import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { EnvTypes } from '@app/shared';
import { createHash, randomInt } from 'crypto';
import Redis from 'ioredis';

type OtpRecord = {
  hash: string;
  attempts: number;
  expiresAt: number;
  cooldownUntil: number;
  payload?: Record<string, unknown>;
};

@Injectable()
export class OtpStore implements OnModuleDestroy {
  private readonly logger = new Logger(OtpStore.name);
  private readonly memory = new Map<string, OtpRecord>();
  private redis: Redis | null = null;

  constructor(private readonly config: ConfigService<EnvTypes, true>) {
    const url = this.config.get('redis.url', { infer: true });
    const client = new Redis(url, {
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
      lazyConnect: true,
    });
    client.on('error', () => undefined);
    void client
      .connect()
      .then(() => {
        this.redis = client;
      })
      .catch(() => {
        this.logger.warn('Redis unavailable; signup OTP uses in-memory store');
        client.disconnect();
      });
  }

  generateCode() {
    return String(randomInt(100000, 999999));
  }

  async issue(email: string, payload?: Record<string, unknown>) {
    const key = this.key(email);
    const existing = await this.read(key);
    const now = Date.now();
    if (existing && existing.cooldownUntil > now) {
      const wait = Math.ceil((existing.cooldownUntil - now) / 1000);
      throw new Error(`Wait ${wait}s before requesting another code`);
    }

    const code = this.generateCode();
    const expiryMinutes = this.config.get('otp.expiryMinutes', { infer: true });
    const cooldown = this.config.get('otp.resendCooldownSeconds', {
      infer: true,
    });
    const record: OtpRecord = {
      hash: this.hash(code),
      attempts: 0,
      expiresAt: now + expiryMinutes * 60_000,
      cooldownUntil: now + cooldown * 1000,
      payload,
    };
    await this.write(key, record);
    return code;
  }

  async verify(email: string, code: string) {
    const key = this.key(email);
    const record = await this.read(key);
    const maxAttempts = this.config.get('otp.maxAttempts', { infer: true });
    if (!record || record.expiresAt < Date.now()) {
      await this.remove(key);
      return null;
    }
    record.attempts += 1;
    if (record.attempts > maxAttempts) {
      await this.remove(key);
      return null;
    }
    if (record.hash !== this.hash(code)) {
      await this.write(key, record);
      return null;
    }
    const payload = record.payload;
    await this.remove(key);
    return payload ?? {};
  }

  onModuleDestroy() {
    if (this.redis) {
      this.redis.disconnect();
      this.redis = null;
    }
  }

  private key(email: string) {
    return `aurora:otp:${email.trim().toLowerCase()}`;
  }

  private hash(code: string) {
    return createHash('sha256').update(code).digest('hex');
  }

  private async read(key: string): Promise<OtpRecord | undefined> {
    if (this.redis) {
      try {
        const raw = await this.redis.get(key);
        return raw ? (JSON.parse(raw) as OtpRecord) : undefined;
      } catch {
        return this.memory.get(key);
      }
    }
    return this.memory.get(key);
  }

  private async write(key: string, record: OtpRecord) {
    this.memory.set(key, record);
    if (!this.redis) return;
    try {
      const ttl = Math.max(1, record.expiresAt - Date.now());
      await this.redis.set(key, JSON.stringify(record), 'PX', ttl);
    } catch {
      // memory already holds the record
    }
  }

  private async remove(key: string) {
    this.memory.delete(key);
    if (!this.redis) return;
    try {
      await this.redis.del(key);
    } catch {
      // ignore
    }
  }
}
