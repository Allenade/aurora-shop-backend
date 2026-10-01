import type { EmailBlock } from './email-blocks';

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function safeHttpUrl(url: string): string {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return '#';
    return parsed.toString();
  } catch {
    return '#';
  }
}

export function applyPlaceholders(
  template: string,
  vars: Record<string, string>,
  mode: 'html' | 'text',
): string {
  return template.replace(
    /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g,
    (_match, key: string) => {
      const value = vars[key] ?? '';
      return mode === 'html'
        ? escapeHtml(value)
        : value.replace(/[\r\n]+/g, ' ');
    },
  );
}

export function renderEmail(input: {
  blocks: EmailBlock[];
  subject: string;
  vars: Record<string, string>;
  marketing: boolean;
  unsubscribeUrl?: string;
}): {
  subject: string;
  html: string;
  text: string;
  attachments: Array<{ filename: string; content?: string; path?: string }>;
} {
  const subject = applyPlaceholders(input.subject, input.vars, 'text').slice(
    0,
    200,
  );
  const parts: string[] = [];
  const textParts: string[] = [];
  const attachments: Array<{
    filename: string;
    content?: string;
    path?: string;
  }> = [];

  for (const block of input.blocks) {
    if (block.type === 'heading') {
      const text = applyPlaceholders(block.text, input.vars, 'html');
      parts.push(
        `<h1 style="margin:0 0 12px;font-size:22px;line-height:1.3;color:#111">${text}</h1>`,
      );
      textParts.push(applyPlaceholders(block.text, input.vars, 'text'));
    } else if (block.type === 'text') {
      const text = applyPlaceholders(block.text, input.vars, 'html').replace(
        /\n/g,
        '<br>',
      );
      parts.push(
        `<p style="margin:0 0 12px;font-size:15px;line-height:1.5;color:#222">${text}</p>`,
      );
      textParts.push(applyPlaceholders(block.text, input.vars, 'text'));
    } else if (block.type === 'image') {
      const url = safeHttpUrl(applyPlaceholders(block.url, input.vars, 'text'));
      const alt = escapeHtml(block.alt ?? '');
      parts.push(
        `<img src="${escapeHtml(url)}" alt="${alt}" width="560" style="max-width:100%;height:auto;border:0;display:block;margin:0 0 12px" />`,
      );
    } else if (block.type === 'button') {
      const url = safeHttpUrl(applyPlaceholders(block.url, input.vars, 'text'));
      const label = applyPlaceholders(block.label, input.vars, 'html');
      parts.push(
        `<p style="margin:0 0 16px"><a href="${escapeHtml(url)}" style="background:#111;color:#fff;text-decoration:none;padding:12px 18px;border-radius:6px;display:inline-block">${label}</a></p>`,
      );
      textParts.push(
        `${applyPlaceholders(block.label, input.vars, 'text')}: ${url}`,
      );
    } else if (block.type === 'divider') {
      parts.push(
        `<hr style="border:0;border-top:1px solid #e5e5e5;margin:16px 0" />`,
      );
    } else if (block.type === 'columns') {
      const cells = (block.columns ?? [])
        .slice(0, 3)
        .map((column) => {
          const text = applyPlaceholders(column.text, input.vars, 'html');
          textParts.push(applyPlaceholders(column.text, input.vars, 'text'));
          return `<td valign="top" style="padding:8px;font-size:14px;line-height:1.5;color:#222">${text}</td>`;
        })
        .join('');
      parts.push(
        `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 12px"><tr>${cells}</tr></table>`,
      );
    } else if (block.type === 'attachment') {
      const filename =
        block.filename.replace(/[^\w.\- ]+/g, '').slice(0, 120) || 'file';
      if (block.contentBase64) {
        attachments.push({ filename, content: block.contentBase64 });
      } else if (block.url) {
        const url = safeHttpUrl(block.url);
        attachments.push({ filename, path: url });
        textParts.push(`Attachment: ${filename} ${url}`);
      }
    }
  }

  if (input.marketing) {
    const href = input.unsubscribeUrl ? safeHttpUrl(input.unsubscribeUrl) : '#';
    parts.push(
      `<p style="margin:24px 0 0;font-size:12px;color:#666">You received this because you opted in to Aurora updates. <a href="${escapeHtml(href)}">Unsubscribe</a></p>`,
    );
    textParts.push(`Unsubscribe: ${href}`);
  }

  const inner = parts.join('');
  const html = `<!doctype html><html><body style="margin:0;padding:0;background:#f6f6f6"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px"><table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:600px;max-width:100%;background:#fff;padding:24px;font-family:Arial,Helvetica,sans-serif"><tr><td>${inner}</td></tr></table></td></tr></table></body></html>`;
  return { subject, html, text: textParts.join('\n\n'), attachments };
}
