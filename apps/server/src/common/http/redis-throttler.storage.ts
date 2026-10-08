import type { ThrottlerStorage } from '@nestjs/throttler';
import type { ThrottlerStorageRecord } from '@nestjs/throttler/dist/throttler-storage-record.interface';
import Redis from 'ioredis';

const INCREMENT = `
local hitsKey = KEYS[1]
local blockKey = KEYS[2]
local ttl = tonumber(ARGV[1])
local limit = tonumber(ARGV[2])
local blockMs = tonumber(ARGV[3])

local blockedFor = redis.call('PTTL', blockKey)
if blockedFor > 0 then
  local hits = tonumber(redis.call('GET', hitsKey) or '0')
  local hitTtl = redis.call('PTTL', hitsKey)
  if hitTtl < 0 then hitTtl = ttl end
  return { hits, hitTtl, 1, blockedFor }
end

local hits = redis.call('INCR', hitsKey)
if hits == 1 then
  redis.call('PEXPIRE', hitsKey, ttl)
end
local hitTtl = redis.call('PTTL', hitsKey)
if hitTtl < 0 then
  redis.call('PEXPIRE', hitsKey, ttl)
  hitTtl = ttl
end

local blocked = 0
local blockTtl = 0
if hits > limit then
  redis.call('SET', blockKey, '1', 'PX', blockMs)
  blocked = 1
  blockTtl = blockMs
end
return { hits, hitTtl, blocked, blockTtl }
`;

type MemorySlot = { hits: number; expiresAt: number; blockExpiresAt: number };

/**
 * Shared throttler counts so two Railway replicas honour the same limit.
 * A Redis error falls back to this process so a blip does not fail the request.
 */
export class RedisThrottlerStorage implements ThrottlerStorage {
  private readonly redis: Redis;
  private readonly memory = new Map<string, MemorySlot>();

  constructor(redisUrl: string) {
    this.redis = new Redis(redisUrl, {
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
    });
    this.redis.on('error', () => undefined);
  }

  async increment(
    key: string,
    ttl: number,
    limit: number,
    blockDuration: number,
    throttlerName: string,
  ): Promise<ThrottlerStorageRecord> {
    const hitsKey = `throttle:${throttlerName}:${key}`;
    const blockKey = `${hitsKey}:block`;
    try {
      if (this.redis.status === 'wait') await this.redis.connect();
      const raw: unknown = await this.redis.eval(
        INCREMENT,
        2,
        hitsKey,
        blockKey,
        String(ttl),
        String(limit),
        String(blockDuration),
      );
      return recordFromRedis(raw, ttl, blockDuration);
    } catch {
      return this.incrementMemory(hitsKey, ttl, limit, blockDuration);
    }
  }

  private incrementMemory(
    key: string,
    ttl: number,
    limit: number,
    blockDuration: number,
  ): ThrottlerStorageRecord {
    const now = Date.now();
    let slot = this.memory.get(key);
    if (!slot || slot.expiresAt <= now) {
      slot = { hits: 0, expiresAt: now + ttl, blockExpiresAt: 0 };
    }
    if (slot.blockExpiresAt > now) {
      this.memory.set(key, slot);
      return {
        totalHits: slot.hits,
        timeToExpire: secondsUntil(slot.expiresAt, now),
        isBlocked: true,
        timeToBlockExpire: secondsUntil(slot.blockExpiresAt, now),
      };
    }
    slot.hits += 1;
    const isBlocked = slot.hits > limit;
    if (isBlocked) slot.blockExpiresAt = now + blockDuration;
    this.memory.set(key, slot);
    return {
      totalHits: slot.hits,
      timeToExpire: secondsUntil(slot.expiresAt, now),
      isBlocked,
      timeToBlockExpire: isBlocked ? Math.ceil(blockDuration / 1000) : 0,
    };
  }
}

function recordFromRedis(
  raw: unknown,
  ttl: number,
  blockDuration: number,
): ThrottlerStorageRecord {
  const values = Array.isArray(raw) ? raw.map((item) => Number(item)) : [];
  const totalHits = Number.isFinite(values[0]) ? values[0] : 1;
  const hitTtl = Number.isFinite(values[1]) && values[1] > 0 ? values[1] : ttl;
  const blocked = values[2] === 1;
  const blockTtl =
    Number.isFinite(values[3]) && values[3] > 0 ? values[3] : blockDuration;
  return {
    totalHits,
    timeToExpire: Math.max(1, Math.ceil(hitTtl / 1000)),
    isBlocked: blocked,
    timeToBlockExpire: blocked ? Math.max(1, Math.ceil(blockTtl / 1000)) : 0,
  };
}

function secondsUntil(at: number, now: number) {
  return Math.max(1, Math.ceil((at - now) / 1000));
}
