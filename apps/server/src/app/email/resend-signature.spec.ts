import { createHmac } from 'crypto';
import { verifyResendSignature } from './resend-signature';

describe('verifyResendSignature', () => {
  it('accepts a Svix v1 signature over the raw body', () => {
    const secret = `whsec_${Buffer.from('super-secret-key').toString('base64')}`;
    const raw = Buffer.from('{"type":"email.delivered"}');
    const timestamp = '1700000000';
    const id = 'msg_1';
    const signed = `${id}.${timestamp}.${raw.toString('utf8')}`;
    const digest = createHmac('sha256', Buffer.from('super-secret-key'))
      .update(signed)
      .digest('base64');
    expect(
      verifyResendSignature({
        rawBody: raw,
        svixId: id,
        svixTimestamp: timestamp,
        svixSignature: `v1,${digest}`,
        secret,
        nowSeconds: 1700000000,
      }),
    ).toBe(true);
  });

  it('rejects a modified body', () => {
    const secret = Buffer.from('super-secret-key').toString('base64');
    const raw = Buffer.from('{"type":"email.delivered"}');
    const digest = createHmac('sha256', Buffer.from('super-secret-key'))
      .update(`msg.1.${raw.toString('utf8')}`)
      .digest('base64');
    expect(
      verifyResendSignature({
        rawBody: Buffer.from('{"type":"email.bounced"}'),
        svixId: 'msg',
        svixTimestamp: '1',
        svixSignature: `v1,${digest}`,
        secret,
        nowSeconds: 1,
      }),
    ).toBe(false);
  });
});
