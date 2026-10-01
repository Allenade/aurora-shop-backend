const HTML_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => HTML_ESCAPES[char] ?? char);
}

export function renderPlaceholders(
  template: string,
  vars: Record<string, string>,
  mode: 'html' | 'text',
): string {
  return template.replace(
    /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g,
    (_match, key: string) => {
      const raw = vars[key] ?? '';
      const safe = raw.replace(/[\r\n]+/g, ' ');
      return mode === 'html' ? escapeHtml(safe) : safe;
    },
  );
}

export function renderEmail(input: {
  subject: string;
  html: string;
  text?: string;
  vars: Record<string, string>;
  kind: 'transactional' | 'marketing';
}): { subject: string; html: string; text: string } {
  const subject = renderPlaceholders(input.subject, input.vars, 'text')
    .replace(/[<>]/g, '')
    .slice(0, 200);
  let html = renderPlaceholders(input.html, input.vars, 'html');
  let text = renderPlaceholders(
    input.text || stripTags(input.html),
    input.vars,
    'text',
  );
  if (input.kind === 'marketing') {
    const link = input.vars.unsubscribeUrl || '';
    if (
      link &&
      !html.includes(escapeHtml(link)) &&
      !input.html.includes('{{unsubscribeUrl}}')
    ) {
      html += `<p><a href="${escapeHtml(link)}">Unsubscribe</a></p>`;
      text += `\n\nUnsubscribe: ${link}`;
    }
  }
  return { subject, html, text };
}

function stripTags(html: string) {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
