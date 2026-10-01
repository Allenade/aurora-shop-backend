import { renderEmail } from './email-render';

describe('renderEmail', () => {
  it('escapes user values inside HTML and keeps a marketing unsubscribe link', () => {
    const rendered = renderEmail({
      subject: 'Hello {{firstName}}',
      marketing: true,
      unsubscribeUrl: 'https://api.example.com/unsub?token=abc',
      vars: { firstName: '<Ada>' },
      blocks: [
        { type: 'heading', text: 'Hi {{firstName}}' },
        { type: 'text', text: 'Track {{track}}' },
        {
          type: 'button',
          label: 'Pay',
          url: 'https://pay.example.com/{{reference}}',
        },
        { type: 'button', label: 'Bad', url: 'javascript:alert(1)' },
      ],
    });
    expect(rendered.subject).toBe('Hello <Ada>');
    expect(rendered.html).toContain('Hi &lt;Ada&gt;');
    expect(rendered.html).not.toContain('<Ada>');
    expect(rendered.html).toContain('Unsubscribe');
    expect(rendered.html).not.toContain('javascript:');
    expect(rendered.text).toContain('Unsubscribe:');
  });
});
