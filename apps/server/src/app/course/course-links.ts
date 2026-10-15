export const COURSE_LINK_LABEL_MAX = 60;
export const COURSE_LINK_URL_MAX = 2000;
export const COURSE_LINKS_MAX = 10;

export const COURSE_LINK_LABEL_MESSAGE = 'Please enter a name for this link.';
export const COURSE_LINK_LABEL_LENGTH_MESSAGE =
  'Link names can be at most 60 characters.';
export const COURSE_LINK_URL_MESSAGE =
  'Please enter a full link starting with https://';
export const COURSE_LINKS_MAX_MESSAGE = 'A course can have at most 10 links.';

export type CourseLink = {
  label: string;
  url: string;
};

export class CourseLinkError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CourseLinkError';
  }
}

/** Absolute http(s) URL. Rejects javascript:, data:, and other schemes. */
export function isAbsoluteHttpUrl(value: string): boolean {
  if (!value || value.length > COURSE_LINK_URL_MAX) return false;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code <= 31 || code === 127) return false;
  }
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return false;
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;
  return parsed.hostname.length > 0;
}

/**
 * Full replacement list. Trims label and url and keeps the submitted order.
 * Null and undefined become an empty list.
 */
export function normalizeCourseLinks(value: unknown): CourseLink[] {
  if (value == null) return [];
  if (!Array.isArray(value)) {
    throw new CourseLinkError(COURSE_LINKS_MAX_MESSAGE);
  }
  if (value.length > COURSE_LINKS_MAX) {
    throw new CourseLinkError(COURSE_LINKS_MAX_MESSAGE);
  }
  return value.map((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      throw new CourseLinkError(COURSE_LINK_LABEL_MESSAGE);
    }
    const raw = item as { label?: unknown; url?: unknown };
    if (typeof raw.label !== 'string') {
      throw new CourseLinkError(COURSE_LINK_LABEL_MESSAGE);
    }
    const label = raw.label.trim();
    if (!label) throw new CourseLinkError(COURSE_LINK_LABEL_MESSAGE);
    if (label.length > COURSE_LINK_LABEL_MAX) {
      throw new CourseLinkError(COURSE_LINK_LABEL_LENGTH_MESSAGE);
    }
    if (typeof raw.url !== 'string' || !isAbsoluteHttpUrl(raw.url.trim())) {
      throw new CourseLinkError(COURSE_LINK_URL_MESSAGE);
    }
    return { label, url: raw.url.trim() };
  });
}

/** Public and admin course payload. Drops rows that are not a label and url. */
export function presentCourseLinks(value: unknown): CourseLink[] {
  if (!Array.isArray(value)) return [];
  const links: CourseLink[] = [];
  for (const item of value) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
    const raw = item as { label?: unknown; url?: unknown };
    if (typeof raw.label !== 'string' || typeof raw.url !== 'string') continue;
    const label = raw.label.trim();
    const url = raw.url.trim();
    if (!label || !url) continue;
    links.push({ label, url });
  }
  return links;
}
