import { resolveClientIp } from './client-ip';

describe('resolveClientIp', () => {
  it('ignores X-Forwarded-For when no proxy is trusted', () => {
    expect(
      resolveClientIp({
        socketIp: '10.0.0.8',
        forwardedFor: '203.0.113.9, 10.0.0.8',
        trustProxyHops: 0,
      }),
    ).toBe('10.0.0.8');
  });

  it('uses the client address in front of one trusted proxy', () => {
    expect(
      resolveClientIp({
        socketIp: '10.0.0.8',
        forwardedFor: '203.0.113.9, 10.0.0.2',
        trustProxyHops: 1,
      }),
    ).toBe('203.0.113.9');
  });

  it('skips two trusted proxies and keeps a spoofed prefix out', () => {
    expect(
      resolveClientIp({
        socketIp: '10.0.0.8',
        forwardedFor: '198.51.100.4, 203.0.113.9, 10.0.0.2',
        trustProxyHops: 1,
      }),
    ).toBe('203.0.113.9');
  });
});
