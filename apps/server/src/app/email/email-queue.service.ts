import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { EnvTypes } from '@app/shared';
import { Queue, Worker } from 'bullmq';
import Redis from 'ioredis';

export type EmailJob = { campaignId?: string; messageId?: string };

@Injectable()
export class EmailQueueService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(EmailQueueService.name);
  private mode: 'bull' | 'memory' = 'memory';
  private queue?: Queue<EmailJob>;
  private worker?: Worker<EmailJob>;
  private handler: ((job: EmailJob) => Promise<void>) | null = null;
  private readonly timers = new Set<NodeJS.Timeout>();

  constructor(private readonly config: ConfigService<EnvTypes, true>) {}

  async onModuleInit() {
    const url = this.config.get('redis.url', { infer: true });
    const probe = new Redis(url, {
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
      lazyConnect: true,
    });
    probe.on('error', () => undefined);
    try {
      await probe.connect();
      await probe.ping();
      await probe.quit();
    } catch {
      this.logger.warn('Redis unavailable; email queue runs in-process');
      probe.disconnect();
      return;
    }

    const connection = { url, maxRetriesPerRequest: null };
    this.queue = new Queue<EmailJob>('core-email', { connection });
    this.worker = new Worker<EmailJob>(
      'core-email',
      async (job) => {
        if (!this.handler) return;
        await this.handler(job.data);
      },
      { connection, concurrency: 1 },
    );
    this.worker.on('error', (error) => {
      this.logger.warn(`Email worker error: ${error.message}`);
    });
    this.mode = 'bull';
  }

  listen(handler: (job: EmailJob) => Promise<void>) {
    this.handler = handler;
  }

  async enqueue(data: EmailJob, delayMs = 0) {
    if (this.mode === 'bull' && this.queue) {
      await this.queue.add('send', data, {
        delay: Math.max(0, delayMs),
        attempts: 1,
        removeOnComplete: 1000,
        removeOnFail: 1000,
      });
      return;
    }
    const timer = setTimeout(
      () => {
        this.timers.delete(timer);
        void this.handler?.(data)?.catch((error) => {
          this.logger.warn(
            `In-process email job failed: ${error instanceof Error ? error.message : String(error)}`,
          );
        });
      },
      Math.max(0, delayMs),
    );
    this.timers.add(timer);
  }

  async onModuleDestroy() {
    for (const timer of this.timers) clearTimeout(timer);
    await this.worker?.close();
    await this.queue?.close();
  }
}
