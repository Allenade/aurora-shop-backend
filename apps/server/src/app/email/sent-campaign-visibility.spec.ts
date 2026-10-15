jest.mock('@nestjs/common', () => {
  class HttpError extends Error {
    constructor(message?: string) {
      super(message);
      this.name = new.target.name;
    }
  }
  const decorator = () => () => undefined;
  return {
    Injectable: decorator,
    Module: decorator,
    Inject: decorator,
    Logger: class Logger {
      log() {}
      error() {}
      warn() {}
      debug() {}
    },
    BadRequestException: class BadRequestException extends HttpError {},
    ConflictException: class ConflictException extends HttpError {},
    NotFoundException: class NotFoundException extends HttpError {},
    UnauthorizedException: class UnauthorizedException extends HttpError {},
  };
});

jest.mock('@nestjs/config', () => ({
  ConfigService: class ConfigService {},
}));

jest.mock('@nestjs/schedule', () => ({
  Cron: () => () => undefined,
  CronExpression: { EVERY_MINUTE: '* * * * *' },
}));

jest.mock('@nestjs/typeorm', () => ({
  InjectRepository: () => () => undefined,
  TypeOrmModule: {
    forRootAsync: () => ({}),
    forFeature: () => ({}),
  },
}));

jest.mock('@nestjs/swagger', () => ({
  ApiProperty: () => () => undefined,
  ApiPropertyOptional: () => () => undefined,
  PartialType: (input: unknown) => input,
}));

import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { EnvTypes } from '@app/shared';
import { FindOperator, type DataSource, type Repository } from 'typeorm';
import type { AuditLogService } from '../audit-log/audit-log.service';
import type { CourseEntity } from '../course/entities/course.entity';
import type { EnterFirstEnrollmentEntity } from '../enter-first/entities/enter-first-enrollment.entity';
import { EmailService } from './email.service';
import {
  EmailCampaignEntity,
  EmailMessageEntity,
  type EmailCampaignStatus,
  type EmailMessageStatus,
  type EmailSuppressionEntity,
  type EmailTemplateEntity,
} from './entities/email.entities';

const STILL_SENDING =
  "This email is still sending. Try again when it's finished.";
const visibleId = '11111111-1111-4111-8111-111111111111';
const hiddenId = '22222222-2222-4222-8222-222222222222';
const sendingId = '33333333-3333-4333-8333-333333333333';
const draftId = '44444444-4444-4444-8444-444444444444';
const adminId = '55555555-5555-4555-8555-555555555555';

type CampaignRow = {
  id: string;
  name: string;
  subject: string;
  status: EmailCampaignStatus;
  hiddenAt: Date | null;
  html: string;
  text: string;
  kind: 'transactional';
  audience: { kind: 'explicit'; emails: string[] };
  totalRecipients: number;
  sentCount: number;
  failedCount: number;
  selectors: string[];
  templateId: null;
  scheduledAt: null;
  createdAt: Date;
};

type MessageRow = {
  id: string;
  campaignId: string | null;
  enrollmentId: string | null;
  toEmail: string;
  toName: string;
  subject: string;
  html: string;
  text: string;
  kind: 'transactional';
  status: EmailMessageStatus;
  attempts: number;
  lastError: string | null;
  resendId: string | null;
  nextAttemptAt: Date | null;
  claimToken: string | null;
  idempotencyKey: string;
  attachments: [];
};

function operatorType(value: unknown) {
  return value instanceof FindOperator ? value.type : undefined;
}

function operatorValue(value: unknown): unknown {
  return value instanceof FindOperator ? value.value : undefined;
}

function inValues(value: unknown): string[] | undefined {
  if (operatorType(value) !== 'in') return undefined;
  const inner = operatorValue(value);
  return Array.isArray(inner) ? (inner as string[]) : undefined;
}

function matchesHidden(filter: unknown, hiddenAt: Date | null) {
  if (!(filter instanceof FindOperator)) return true;
  if (filter.type === 'isNull') return hiddenAt == null;
  if (filter.type === 'not' && filter.child?.type === 'isNull') {
    return hiddenAt != null;
  }
  return true;
}

function campaign(
  input: Partial<CampaignRow> & Pick<CampaignRow, 'id' | 'status' | 'subject'>,
): CampaignRow {
  return {
    name: input.subject,
    hiddenAt: null,
    html: '<p>Hello</p>',
    text: 'Hello',
    kind: 'transactional',
    audience: { kind: 'explicit', emails: [] },
    totalRecipients: 1,
    sentCount: 1,
    failedCount: 0,
    selectors: [],
    templateId: null,
    scheduledAt: null,
    createdAt: new Date('2026-10-01T00:00:00.000Z'),
    ...input,
  };
}

function message(
  input: Partial<MessageRow> & Pick<MessageRow, 'id' | 'status'>,
): MessageRow {
  return {
    campaignId: visibleId,
    enrollmentId: null,
    toEmail: 'ada@gmail.com',
    toName: 'Ada',
    subject: 'Hello',
    html: '<p>Hello</p>',
    text: 'Hello',
    kind: 'transactional',
    attempts: 0,
    lastError: null,
    resendId: null,
    nextAttemptAt: null,
    claimToken: null,
    idempotencyKey: `ef-email-${input.id}`,
    attachments: [],
    ...input,
  };
}

describe('sent campaign hide and delete', () => {
  const audits: Array<Record<string, unknown>> = [];
  const campaigns = new Map<string, CampaignRow>();
  const messages = new Map<string, MessageRow>();
  let enrollmentTouched = false;

  function touchEnrollment() {
    enrollmentTouched = true;
    throw new Error('confirmation enrollments must stay untouched');
  }

  function campaignMatches(row: CampaignRow, where: Record<string, unknown>) {
    if (typeof where.status === 'string' && row.status !== where.status) {
      return false;
    }
    if ('hiddenAt' in where && !matchesHidden(where.hiddenAt, row.hiddenAt)) {
      return false;
    }
    const ids = inValues(where.id);
    if (ids && !ids.includes(row.id)) return false;
    if (typeof where.id === 'string' && row.id !== where.id) return false;
    return true;
  }

  function findCampaigns(options?: { where?: unknown }) {
    const where = options?.where;
    const clauses = Array.isArray(where) ? where : where ? [where] : [];
    const rows = [...campaigns.values()].filter((row) =>
      clauses.length
        ? clauses.some((clause) =>
            campaignMatches(row, clause as Record<string, unknown>),
          )
        : true,
    );
    rows.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    return rows;
  }

  function findMessages(options?: { where?: unknown }) {
    const where = options?.where;
    const clauses = (
      Array.isArray(where) ? where : where ? [where] : []
    ) as Array<Record<string, unknown>>;
    return [...messages.values()].filter((row) =>
      clauses.length
        ? clauses.some((clause) => {
            if (
              typeof clause.campaignId === 'string' &&
              row.campaignId !== clause.campaignId
            ) {
              return false;
            }
            if (
              typeof clause.status === 'string' &&
              row.status !== clause.status
            ) {
              return false;
            }
            if (
              typeof clause.claimToken === 'string' &&
              row.claimToken !== clause.claimToken
            ) {
              return false;
            }
            if (typeof clause.id === 'string' && row.id !== clause.id)
              return false;
            return true;
          })
        : true,
    );
  }

  function selectBuilder(
    load: (ids: string[]) => unknown[],
    apply?: (
      ids: string[],
      status: string | undefined,
      patch: Record<string, unknown>,
    ) => void,
  ) {
    let ids: string[] = [];
    let status: string | undefined;
    let patch: Record<string, unknown> = {};
    const builder = {
      update: () => builder,
      set: (value: Record<string, unknown>) => {
        patch = value;
        return builder;
      },
      setLock: () => builder,
      where: (_sql: string, params?: { ids?: string[] }) => {
        if (params?.ids) ids = params.ids;
        return builder;
      },
      andWhere: (_sql: string, params?: { status?: string }) => {
        if (params?.status) status = params.status;
        return builder;
      },
      getMany: () => Promise.resolve(load(ids)),
      execute: () => {
        apply?.(ids, status, patch);
        return Promise.resolve({ affected: ids.length });
      },
    };
    return builder;
  }

  function service() {
    let inTransaction = false;
    const campaignRepo = {
      find: (options?: { where?: unknown }) =>
        Promise.resolve(findCampaigns(options)),
      findOne: (options?: { where?: { id?: string } }) =>
        Promise.resolve(
          options?.where?.id ? (campaigns.get(options.where.id) ?? null) : null,
        ),
      save: (rowOrRows: CampaignRow | CampaignRow[]) => {
        const list = Array.isArray(rowOrRows) ? rowOrRows : [rowOrRows];
        for (const row of list) campaigns.set(row.id, row);
        return Promise.resolve(rowOrRows);
      },
      delete: () => {
        throw new Error('campaign delete must run inside the transaction');
      },
      createQueryBuilder: () =>
        selectBuilder((ids) =>
          [...campaigns.values()].filter(
            (row) => !ids.length || ids.includes(row.id),
          ),
        ),
    };
    const messageRepo = {
      find: (options?: { where?: unknown }) =>
        Promise.resolve(findMessages(options)),
      count: (options?: { where?: unknown }) =>
        Promise.resolve(findMessages(options).length),
      save: (rowOrRows: MessageRow | MessageRow[]) => {
        const list = Array.isArray(rowOrRows) ? rowOrRows : [rowOrRows];
        for (const row of list) messages.set(row.id, row);
        return Promise.resolve(rowOrRows);
      },
      update: (where: { id?: string }, patch: Partial<MessageRow>) => {
        for (const row of messages.values()) {
          if (where.id && row.id !== where.id) continue;
          Object.assign(row, patch);
        }
        return Promise.resolve({ affected: 1 });
      },
      delete: () => {
        throw new Error('message delete must run inside the transaction');
      },
      create: (row: MessageRow) => row,
      createQueryBuilder: () =>
        selectBuilder(
          (ids) =>
            [...messages.values()].filter(
              (row) => !ids.length || ids.includes(row.id),
            ),
          (ids, status, patch) => {
            for (const row of messages.values()) {
              if (ids.length && !ids.includes(row.id)) continue;
              if (status && row.status !== status) continue;
              row.status = patch.status as EmailMessageStatus;
              row.claimToken = (patch.claimToken as string | null) ?? null;
              if (typeof patch.attempts === 'function') row.attempts += 1;
            }
          },
        ),
    };
    const dataSource = {
      transaction: (
        work: (manager: {
          getRepository: (entity: unknown) => unknown;
        }) => Promise<unknown>,
      ) => {
        inTransaction = true;
        const manager = {
          getRepository: (entity: unknown) => {
            if (entity === EmailCampaignEntity) {
              return {
                createQueryBuilder: () =>
                  selectBuilder((ids) =>
                    [...campaigns.values()].filter((row) =>
                      ids.includes(row.id),
                    ),
                  ),
                delete: (criteria: { id?: unknown }) => {
                  if (!inTransaction) {
                    throw new Error('campaign delete left the transaction');
                  }
                  for (const id of inValues(criteria.id) ?? [])
                    campaigns.delete(id);
                  return Promise.resolve({ affected: 1 });
                },
              };
            }
            if (entity === EmailMessageEntity) {
              return {
                createQueryBuilder: () =>
                  selectBuilder((ids) =>
                    [...messages.values()].filter(
                      (row) =>
                        row.campaignId != null && ids.includes(row.campaignId),
                    ),
                  ),
                delete: (criteria: { campaignId?: unknown }) => {
                  if (!inTransaction) {
                    throw new Error('message delete left the transaction');
                  }
                  const ids = new Set(inValues(criteria.campaignId) ?? []);
                  for (const [id, row] of messages) {
                    if (row.campaignId && ids.has(row.campaignId))
                      messages.delete(id);
                  }
                  return Promise.resolve({ affected: ids.size });
                },
              };
            }
            throw new Error('unexpected repository');
          },
        };
        return work(manager).finally(() => {
          inTransaction = false;
        });
      },
    };
    const enrollments = {
      update: touchEnrollment,
      save: touchEnrollment,
      create: touchEnrollment,
      find: touchEnrollment,
      findOne: touchEnrollment,
      createQueryBuilder: touchEnrollment,
    };
    const emails = new EmailService(
      {} as Repository<EmailTemplateEntity>,
      campaignRepo as unknown as Repository<EmailCampaignEntity>,
      messageRepo as unknown as Repository<EmailMessageEntity>,
      {
        find: () => Promise.resolve([]),
      } as unknown as Repository<EmailSuppressionEntity>,
      enrollments as unknown as Repository<EnterFirstEnrollmentEntity>,
      {} as Repository<CourseEntity>,
      {
        get: (key: string) => {
          const values: Record<string, unknown> = {
            'email.batchSize': 50,
            'email.maxAttempts': 3,
            'email.allowlist': '',
            'email.redirectTo': '',
            'email.fromName': 'Aurora',
            'email.fromEmail': 'no-reply@aurorainstitute.ca',
            'email.apiKey': '',
            'unsubscribe.secret': 'secret',
            'http.publicApiUrl': 'http://localhost:4000',
            port: 4000,
            nodeEnv: 'test',
          };
          return values[key];
        },
      } as unknown as ConfigService<EnvTypes, true>,
      dataSource as unknown as DataSource,
      {
        log: (entry: Record<string, unknown>) => audits.push(entry),
      } as unknown as AuditLogService,
    );
    return emails;
  }

  beforeEach(() => {
    audits.length = 0;
    campaigns.clear();
    messages.clear();
    enrollmentTouched = false;
    campaigns.set(
      visibleId,
      campaign({
        id: visibleId,
        status: 'completed',
        subject: 'Visible welcome',
        createdAt: new Date('2026-10-02T00:00:00.000Z'),
      }),
    );
    campaigns.set(
      hiddenId,
      campaign({
        id: hiddenId,
        status: 'completed',
        subject: 'Hidden welcome',
        hiddenAt: new Date('2026-10-03T12:00:00.000Z'),
        createdAt: new Date('2026-10-03T00:00:00.000Z'),
      }),
    );
    campaigns.set(
      sendingId,
      campaign({
        id: sendingId,
        status: 'sending',
        subject: 'Still going',
        hiddenAt: new Date('2026-10-04T12:00:00.000Z'),
        sentCount: 0,
        createdAt: new Date('2026-10-04T00:00:00.000Z'),
      }),
    );
    campaigns.set(
      draftId,
      campaign({
        id: draftId,
        status: 'draft',
        subject: 'Not sent',
        sentCount: 0,
      }),
    );
    messages.set(
      'msg-visible',
      message({
        id: 'msg-visible',
        campaignId: visibleId,
        status: 'delivered',
      }),
    );
    messages.set(
      'msg-hidden',
      message({ id: 'msg-hidden', campaignId: hiddenId, status: 'delivered' }),
    );
    messages.set(
      'msg-sending',
      message({ id: 'msg-sending', campaignId: sendingId, status: 'queued' }),
    );
  });

  it('lists visible campaigns by default and hidden campaigns on hidden=true', async () => {
    const emails = service();

    const visible = await emails.listSent();
    expect(visible.map((row) => row.id)).toEqual([visibleId]);
    expect(visible[0].hiddenAt).toBeNull();

    const hidden = await emails.listSent('true');
    expect(hidden.map((row) => row.id)).toEqual([sendingId, hiddenId]);
    expect(hidden.map((row) => row.hiddenAt)).toEqual([
      '2026-10-04T12:00:00.000Z',
      '2026-10-03T12:00:00.000Z',
    ]);

    await expect(emails.listSent('false')).resolves.toMatchObject([
      { id: visibleId, hiddenAt: null },
    ]);
  });

  it('includes hiddenAt on a hidden sent detail', async () => {
    const emails = service();
    const detail = await emails.getSent(hiddenId);
    expect(detail.hiddenAt).toBe('2026-10-03T12:00:00.000Z');
    expect(detail.subject).toBe('Hidden welcome');
  });

  it('hides and unhides sent campaigns and writes an audit row', async () => {
    const emails = service();
    const hidden = await emails.hideSent([visibleId, visibleId], adminId);
    expect(hidden).toEqual({ ids: [visibleId] });
    const firstHiddenAt = campaigns.get(visibleId)?.hiddenAt;
    expect(firstHiddenAt).toBeInstanceOf(Date);

    await emails.hideSent([visibleId], adminId);
    expect(campaigns.get(visibleId)?.hiddenAt).toBe(firstHiddenAt);

    const restored = await emails.unhideSent([visibleId, hiddenId], adminId);
    expect(restored.ids).toEqual([visibleId, hiddenId]);
    expect(campaigns.get(visibleId)?.hiddenAt).toBeNull();
    expect(campaigns.get(hiddenId)?.hiddenAt).toBeNull();
    expect(audits).toEqual([
      {
        type: 'mutation',
        action: 'EMAIL_SENT_HIDE',
        userId: adminId,
        resourceType: 'email',
        metadata: { ids: [visibleId], subjects: ['Visible welcome'] },
      },
      {
        type: 'mutation',
        action: 'EMAIL_SENT_HIDE',
        userId: adminId,
        resourceType: 'email',
        metadata: { ids: [visibleId], subjects: ['Visible welcome'] },
      },
      {
        type: 'mutation',
        action: 'EMAIL_SENT_UNHIDE',
        userId: adminId,
        resourceType: 'email',
        metadata: {
          ids: [visibleId, hiddenId],
          subjects: ['Visible welcome', 'Hidden welcome'],
        },
      },
    ]);
  });

  it('rejects hide, unhide, and delete when an id is not a sent campaign', async () => {
    const emails = service();
    await expect(emails.hideSent([draftId], adminId)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    await expect(
      emails.unhideSent(['missing-id'], adminId),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(emails.deleteSent([], adminId)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(emails.deleteSent([draftId], adminId)).rejects.toThrow(
      'Sent email not found',
    );
    expect(campaigns.has(draftId)).toBe(true);
    expect(audits).toEqual([]);
  });

  it('deletes a hidden finished campaign and its recipient rows', async () => {
    const emails = service();
    const result = await emails.deleteSent([hiddenId], adminId);
    expect(result).toEqual({ ids: [hiddenId] });
    expect(campaigns.has(hiddenId)).toBe(false);
    expect(messages.has('msg-hidden')).toBe(false);
    expect(campaigns.has(visibleId)).toBe(true);
    expect(messages.has('msg-visible')).toBe(true);
    expect(enrollmentTouched).toBe(false);
    expect(audits).toEqual([
      {
        type: 'mutation',
        action: 'EMAIL_SENT_DELETE',
        userId: adminId,
        resourceType: 'email',
        metadata: { ids: [hiddenId], subjects: ['Hidden welcome'] },
      },
    ]);
  });

  it('refuses to delete a visible campaign or one that is still sending', async () => {
    const emails = service();
    await expect(
      emails.deleteSent([visibleId], adminId),
    ).rejects.toBeInstanceOf(ConflictException);
    await expect(emails.deleteSent([visibleId], adminId)).rejects.toThrow(
      'Hide this email before deleting it.',
    );
    expect(campaigns.has(visibleId)).toBe(true);
    expect(messages.has('msg-visible')).toBe(true);

    await expect(
      emails.deleteSent([hiddenId, sendingId], adminId),
    ).rejects.toThrow(STILL_SENDING);
    expect(campaigns.has(hiddenId)).toBe(true);
    expect(campaigns.has(sendingId)).toBe(true);
    expect(messages.has('msg-hidden')).toBe(true);
    expect(messages.has('msg-sending')).toBe(true);

    const sendingMessage = messages.get('msg-sending');
    if (!sendingMessage) throw new Error('missing sending message');
    sendingMessage.status = 'sending';
    await expect(emails.deleteSent([sendingId], adminId)).rejects.toThrow(
      STILL_SENDING,
    );
    expect(audits).toEqual([]);
    expect(enrollmentTouched).toBe(false);
  });

  it('fails a claimed message in place when its campaign is already gone', async () => {
    const emails = service();
    messages.set(
      'msg-orphan',
      message({
        id: 'msg-orphan',
        campaignId: 'gone-campaign',
        status: 'queued',
        attempts: 1,
      }),
    );

    await emails.processIds(['msg-orphan']);

    expect(messages.get('msg-orphan')).toMatchObject({
      status: 'failed',
      lastError: 'campaign_deleted',
      claimToken: null,
      nextAttemptAt: null,
      attempts: 2,
    });
    expect(enrollmentTouched).toBe(false);
  });

  it('still delivers a confirmation message that has no campaign', async () => {
    const emails = service();
    messages.set(
      'msg-confirm',
      message({
        id: 'msg-confirm',
        campaignId: null,
        status: 'queued',
        toEmail: 'ada@gmail.com',
      }),
    );

    await emails.processIds(['msg-confirm']);

    expect(messages.get('msg-confirm')).toMatchObject({
      status: 'delivered',
      campaignId: null,
      lastError: null,
    });
    expect(enrollmentTouched).toBe(false);
  });

  it('does not retry a deleted campaign or a campaign_deleted recipient', async () => {
    const emails = service();
    await expect(emails.resendFailed('gone-campaign')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(messages.get('msg-sending')?.status).toBe('queued');

    messages.set(
      'msg-deleted',
      message({
        id: 'msg-deleted',
        campaignId: hiddenId,
        status: 'failed',
        lastError: 'campaign_deleted',
      }),
    );
    messages.set(
      'msg-network',
      message({
        id: 'msg-network',
        campaignId: hiddenId,
        status: 'failed',
        lastError: 'timeout',
      }),
    );

    const result = await emails.retryFailed(hiddenId);
    expect(result).toEqual({ retried: 1 });
    expect(messages.get('msg-deleted')).toMatchObject({
      status: 'failed',
      lastError: 'campaign_deleted',
    });
    expect(messages.get('msg-network')?.status).not.toBe('failed');
    expect(enrollmentTouched).toBe(false);
  });
});
