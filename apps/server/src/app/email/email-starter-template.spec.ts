import { STARTER_EMAIL_TEMPLATE } from './email-starter-template';

describe('starter email template', () => {
  it('uses placeholders and does not name a person', () => {
    const body = `${STARTER_EMAIL_TEMPLATE.subject}\n${STARTER_EMAIL_TEMPLATE.html}\n${STARTER_EMAIL_TEMPLATE.text}`;
    expect(STARTER_EMAIL_TEMPLATE.kind).toBe('transactional');
    expect(body).toContain('{{firstName}}');
    expect(body).toContain('{{lastName}}');
    expect(body).toContain('{{track}}');
    expect(body).toContain('{{amount}}');
    expect(body).toContain('{{reference}}');
    expect(body).not.toMatch(/@example\.com|Ada|Okoye|Allen/i);
  });
});
