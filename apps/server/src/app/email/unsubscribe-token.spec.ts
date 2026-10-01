import { signUnsubscribe, verifyUnsubscribe } from './unsubscribe-token';

describe('unsubscribe token', () => {
  it('round-trips a signed email and rejects tampering', () => {
    const token = signUnsubscribe('Ada@Example.com', 'secret', 2_000);
    expect(verifyUnsubscribe(token, 'secret', 1_000)).toBe('ada@example.com');
    expect(verifyUnsubscribe(token, 'other', 1_000)).toBeNull();
    expect(verifyUnsubscribe(token, 'secret', 3_000)).toBeNull();
    expect(verifyUnsubscribe(`${token}x`, 'secret', 1_000)).toBeNull();
  });
});
