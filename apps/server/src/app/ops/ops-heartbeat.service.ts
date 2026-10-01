import { Injectable } from '@nestjs/common';

@Injectable()
export class OpsHeartbeatService {
  private readonly beats = new Map<string, string>();
  readonly startedAt = new Date();

  beat(key: string, at = new Date()) {
    this.beats.set(key, at.toISOString());
  }

  get(key: string): string | null {
    return this.beats.get(key) ?? null;
  }
}
