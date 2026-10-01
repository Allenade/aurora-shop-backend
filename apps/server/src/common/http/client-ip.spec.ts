import { resolveClientIp } from './client-ip';

describe('client ip', () => {
  it('ignores X-Forwarded-For when no proxy is trusted', () => {
    expect(
      resolveClientIp({
        socketAddress: '10.0.0.8',
        forwardedFor: '1.2.3.4',
        trustProxy: false,
      }),
    ).toBe('10.0.0.8');
  });

  it('uses the client address reported by a trusted proxy', () => {
    expect(
      resolveClientIp({
        socketAddress: '10.0.0.8',
        forwardedFor: '1.2.3.4',
        trustProxy: 1,
      }),
    ).toBe('1.2.3.4');
  });

  it('does not trust a spoofed left-most address beyond the configured hops', () => {
    expect(
      resolveClientIp({
        socketAddress: '10.0.0.8',
        forwardedFor: '9.9.9.9, 1.2.3.4',
        trustProxy: 1,
      }),
    ).toBe('1.2.3.4');
  });
});
