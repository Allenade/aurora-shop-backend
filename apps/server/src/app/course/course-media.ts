import sharp from 'sharp';
import type { FileUploadPayload } from '../storage/storage.service';

export class CourseMediaError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CourseMediaError';
  }
}

export const COURSE_IMAGE_MAX_BYTES = 5 * 1024 * 1024;
export const COURSE_SYLLABUS_PDF_MAX_BYTES = 10 * 1024 * 1024;
export const COURSE_SYLLABUS_TEXT_MAX_CHARS = 50_000;
export const AFTER_PAYMENT_EMAIL_MAX_CHARS = 20_000;

const IMAGE_MIME = {
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
} as const;

type ImageMime = (typeof IMAGE_MIME)[keyof typeof IMAGE_MIME];

const JPEG_ALIASES = new Set(['image/jpeg', 'image/jpg', 'image/pjpeg']);
const PDF_ALIASES = new Set(['application/pdf', 'application/x-pdf']);

const ALLOWED_TAGS = new Set([
  'p',
  'br',
  'strong',
  'b',
  'em',
  'i',
  'u',
  's',
  'h2',
  'h3',
  'h4',
  'ul',
  'ol',
  'li',
  'a',
  'blockquote',
  'hr',
  'span',
  'div',
  'table',
  'thead',
  'tbody',
  'tr',
  'th',
  'td',
  'sup',
  'sub',
  'code',
  'pre',
]);

const VOID_TAGS = new Set(['br', 'hr']);

export type CourseSyllabusView = {
  url: string | null;
  filename: string | null;
  text: string | null;
};

export function courseMediaFields(row: {
  imageUrl?: string | null;
  syllabusUrl?: string | null;
  syllabusFilename?: string | null;
  syllabusText?: string | null;
}): { imageUrl: string | null; syllabus: CourseSyllabusView } {
  return {
    imageUrl: row.imageUrl?.trim() || null,
    syllabus: {
      url: row.syllabusUrl?.trim() || null,
      filename: row.syllabusFilename?.trim() || null,
      text: row.syllabusText?.trim() ? row.syllabusText : null,
    },
  };
}

export async function prepareCourseImage(
  file?: FileUploadPayload,
): Promise<FileUploadPayload> {
  const payload = requireFile(
    file,
    COURSE_IMAGE_MAX_BYTES,
    'Image exceeds 5MB',
  );
  const sniffed = sniffImage(payload.buffer);
  if (!sniffed) {
    throw new CourseMediaError('Image must be jpeg, png, or webp');
  }
  const declared = (payload.mimetype || '').toLowerCase().split(';')[0].trim();
  if (declared && declared !== 'application/octet-stream') {
    const declaredKind = jpegAlias(declared)
      ? IMAGE_MIME.jpeg
      : declared === IMAGE_MIME.png || declared === IMAGE_MIME.webp
        ? declared
        : null;
    if (!declaredKind) {
      throw new CourseMediaError('Image must be jpeg, png, or webp');
    }
    if (declaredKind !== sniffed) {
      throw new CourseMediaError('Image file does not match its type');
    }
  }
  return compressImage(payload, sniffed);
}

export function prepareCourseSyllabusPdf(
  file?: FileUploadPayload,
): FileUploadPayload {
  const payload = requireFile(
    file,
    COURSE_SYLLABUS_PDF_MAX_BYTES,
    'Syllabus PDF exceeds 10MB',
  );
  if (!isPdf(payload.buffer)) {
    throw new CourseMediaError('Syllabus file must be a PDF');
  }
  const declared = (payload.mimetype || '').toLowerCase().split(';')[0].trim();
  if (
    declared &&
    declared !== 'application/octet-stream' &&
    !PDF_ALIASES.has(declared)
  ) {
    throw new CourseMediaError('Syllabus file must be a PDF');
  }
  return {
    buffer: payload.buffer,
    originalname: displayFileName(payload.originalname),
    mimetype: 'application/pdf',
    size: payload.buffer.length,
  };
}

/** Null and blank clear the text. HTML is reduced to an allow-list. */
export function normalizeSyllabusText(value?: string | null): string | null {
  if (value == null) return null;
  const trimmed = stripNulls(value).trim();
  if (!trimmed) return null;
  if (trimmed.length > COURSE_SYLLABUS_TEXT_MAX_CHARS) {
    throw new CourseMediaError(
      `Syllabus text exceeds ${COURSE_SYLLABUS_TEXT_MAX_CHARS} characters`,
    );
  }
  const clean = sanitizeSyllabusHtml(trimmed);
  const visible = clean
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&#160;/g, ' ')
    .trim();
  return visible ? clean : null;
}

/** Sanitized HTML for the post-payment joining message. Blank clears it. */
export function normalizeAfterPaymentEmail(
  value?: string | null,
): string | null {
  if (value == null) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.length > AFTER_PAYMENT_EMAIL_MAX_CHARS) {
    throw new CourseMediaError(
      `After-payment email exceeds ${AFTER_PAYMENT_EMAIL_MAX_CHARS} characters`,
    );
  }
  const clean = sanitizeSyllabusHtml(trimmed);
  const visible = clean
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&#160;/g, ' ')
    .trim();
  return visible ? clean : null;
}

const DISCARD_CONTENT = new Set([
  'script',
  'style',
  'iframe',
  'object',
  'embed',
  'svg',
  'math',
  'noscript',
  'textarea',
  'template',
  'form',
]);

const DISCARD_TAG = new Set([...DISCARD_CONTENT, 'link', 'meta', 'base']);

export function sanitizeSyllabusHtml(input: string): string {
  const source = stripNulls(input);
  let out = '';
  let cursor = 0;
  while (cursor < source.length) {
    const lt = source.indexOf('<', cursor);
    if (lt === -1) {
      out += source.slice(cursor);
      break;
    }
    out += source.slice(cursor, lt);
    if (source.startsWith('<!--', lt)) {
      const end = source.indexOf('-->', lt + 4);
      cursor = end === -1 ? source.length : end + 3;
      continue;
    }
    const tag = tagAt(source, lt);
    if (!tag) {
      out += '&lt;';
      cursor = lt + 1;
      continue;
    }
    if (!tag.closing && DISCARD_CONTENT.has(tag.name)) {
      cursor = skipDiscardedElement(source, tag);
      continue;
    }
    if (DISCARD_TAG.has(tag.name)) {
      cursor = tag.gt + 1;
      continue;
    }
    out += renderTag(source.slice(lt + 1, tag.gt));
    cursor = tag.gt + 1;
  }
  return out.trim();
}

function tagAt(
  source: string,
  lt: number,
): { name: string; closing: boolean; gt: number } | null {
  const gt = source.indexOf('>', lt + 1);
  if (gt === -1) return null;
  const raw = source.slice(lt + 1, gt).trim();
  const closing = raw.startsWith('/');
  const body = (closing ? raw.slice(1) : raw).trim();
  const match = /^([a-zA-Z][a-zA-Z0-9]*)/.exec(body);
  if (!match) return { name: '', closing, gt };
  return { name: match[1].toLowerCase(), closing, gt };
}

function skipDiscardedElement(
  source: string,
  open: { name: string; gt: number },
): number {
  let depth = 1;
  let cursor = open.gt + 1;
  while (cursor < source.length && depth > 0) {
    const next = source.indexOf('<', cursor);
    if (next === -1) return source.length;
    const tag = tagAt(source, next);
    if (!tag) return source.length;
    if (tag.name === open.name) depth += tag.closing ? -1 : 1;
    cursor = tag.gt + 1;
  }
  return cursor;
}

function requireFile(
  file: FileUploadPayload | undefined,
  maxBytes: number,
  tooLarge: string,
): FileUploadPayload {
  if (!file?.buffer?.length) {
    throw new CourseMediaError('File is required');
  }
  if (file.size > maxBytes || file.buffer.length > maxBytes) {
    throw new CourseMediaError(tooLarge);
  }
  return file;
}

function sniffImage(buffer: Buffer): ImageMime | null {
  if (
    buffer.length >= 3 &&
    buffer[0] === 0xff &&
    buffer[1] === 0xd8 &&
    buffer[2] === 0xff
  ) {
    return IMAGE_MIME.jpeg;
  }
  if (
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return IMAGE_MIME.png;
  }
  if (
    buffer.length >= 12 &&
    buffer.toString('ascii', 0, 4) === 'RIFF' &&
    buffer.toString('ascii', 8, 12) === 'WEBP'
  ) {
    return IMAGE_MIME.webp;
  }
  return null;
}

function isPdf(buffer: Buffer): boolean {
  const head = buffer.subarray(0, 16).toString('latin1').replace(/^\s+/, '');
  return head.startsWith('%PDF-');
}

function jpegAlias(mime: string): boolean {
  return JPEG_ALIASES.has(mime);
}

function displayFileName(name: string): string {
  const base = (name || '').split(/[/\\]/).pop() || 'syllabus.pdf';
  const cleaned = base.replace(/[^\w.\- ()]+/g, '').trim();
  const named = (cleaned || 'syllabus.pdf').slice(0, 255);
  return named.toLowerCase().endsWith('.pdf') ? named : `${named}.pdf`;
}

async function compressImage(
  file: FileUploadPayload,
  mime: ImageMime,
): Promise<FileUploadPayload> {
  try {
    let pipeline = sharp(file.buffer, { failOn: 'none' }).rotate().resize({
      width: 2000,
      height: 2000,
      fit: 'inside',
      withoutEnlargement: true,
    });
    let name = file.originalname || 'course-image';
    if (mime === IMAGE_MIME.png) {
      pipeline = pipeline.png({ compressionLevel: 9 });
    } else if (mime === IMAGE_MIME.webp) {
      pipeline = pipeline.webp({ quality: 80 });
    } else {
      pipeline = pipeline.jpeg({ quality: 82 });
      name = name.replace(/\.\w+$/, '') + '.jpg';
    }
    const buffer = await pipeline.toBuffer();
    return {
      buffer,
      originalname: name,
      mimetype: mime === IMAGE_MIME.jpeg ? IMAGE_MIME.jpeg : mime,
      size: buffer.length,
    };
  } catch {
    throw new CourseMediaError('Image could not be processed');
  }
}

function renderTag(raw: string): string {
  const body = raw.trim();
  if (!body) return '';
  const closing = body.startsWith('/');
  const content = (closing ? body.slice(1) : body).trim();
  const match = /^([a-zA-Z][a-zA-Z0-9]*)([\s\S]*)$/.exec(content);
  if (!match) return '';
  const tag = match[1].toLowerCase();
  if (!ALLOWED_TAGS.has(tag)) return '';
  if (closing || VOID_TAGS.has(tag)) {
    return closing ? (VOID_TAGS.has(tag) ? '' : `</${tag}>`) : `<${tag}>`;
  }
  const attrs = sanitizeAttributes(tag, match[2].replace(/\/\s*$/, ''));
  return `<${tag}${attrs}>`;
}

function sanitizeAttributes(tag: string, raw: string): string {
  const kept: string[] = [];
  let href: string | null = null;
  for (const [name, value] of parseAttributes(raw)) {
    const key = name.toLowerCase();
    if (key.startsWith('on') || key === 'style' || key === 'srcdoc') continue;
    if (tag === 'a' && key === 'href') {
      href = safeUrl(value);
    } else if (
      (tag === 'td' || tag === 'th') &&
      (key === 'colspan' || key === 'rowspan') &&
      /^\d{1,2}$/.test(value)
    ) {
      kept.push(` ${key}="${value}"`);
    }
  }
  if (tag === 'a' && href) {
    kept.unshift(` href="${escapeAttr(href)}" rel="noopener noreferrer"`);
  }
  return kept.join('');
}

function parseAttributes(raw: string): Array<[string, string]> {
  const out: Array<[string, string]> = [];
  let i = 0;
  while (i < raw.length) {
    while (i < raw.length && /\s/.test(raw[i])) i += 1;
    if (i >= raw.length || raw[i] === '/') break;
    const start = i;
    while (i < raw.length && /[^\s=/>]/.test(raw[i])) i += 1;
    const name = raw.slice(start, i);
    if (!name) break;
    while (i < raw.length && /\s/.test(raw[i])) i += 1;
    if (raw[i] !== '=') {
      out.push([name, '']);
      continue;
    }
    i += 1;
    while (i < raw.length && /\s/.test(raw[i])) i += 1;
    let value = '';
    const quote = raw[i];
    if (quote === '"' || quote === "'") {
      const end = raw.indexOf(quote, i + 1);
      if (end === -1) break;
      value = raw.slice(i + 1, end);
      i = end + 1;
    } else {
      const valueStart = i;
      while (i < raw.length && !/\s/.test(raw[i]) && raw[i] !== '>') i += 1;
      value = raw.slice(valueStart, i);
    }
    out.push([name, decodeEntities(value)]);
  }
  return out;
}

function safeUrl(value: string): string | null {
  const compact = stripControlsAndSpace(decodeEntities(value));
  const lower = compact.toLowerCase();
  if (
    lower.startsWith('https://') ||
    lower.startsWith('http://') ||
    lower.startsWith('mailto:')
  ) {
    return compact;
  }
  return null;
}

function stripNulls(value: string): string {
  let out = '';
  for (const char of value) {
    if (char !== '\0') out += char;
  }
  return out;
}

function stripControlsAndSpace(value: string): string {
  let out = '';
  for (const char of value) {
    if (char.charCodeAt(0) > 0x20) out += char;
  }
  return out;
}

function decodeEntities(value: string): string {
  let current = value;
  for (let pass = 0; pass < 2; pass += 1) {
    const next = current
      .replace(/&#x([0-9a-f]{1,6});?/gi, (_, hex: string) =>
        safeCodePoint(Number.parseInt(hex, 16)),
      )
      .replace(/&#(\d{1,7});?/g, (_, num: string) =>
        safeCodePoint(Number.parseInt(num, 10)),
      )
      .replace(/&quot;/gi, '"')
      .replace(/&apos;/gi, "'")
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>')
      .replace(/&amp;/gi, '&');
    if (next === current) break;
    current = next;
  }
  return current;
}

function safeCodePoint(code: number): string {
  if (!Number.isFinite(code) || code < 0 || code > 0x10ffff) return '';
  try {
    return String.fromCodePoint(code);
  } catch {
    return '';
  }
}

function escapeAttr(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
