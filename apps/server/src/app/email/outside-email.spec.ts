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

import { BadRequestException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { EnvTypes } from '@app/shared';
import type { DataSource, Repository } from 'typeorm';
import type { AuditLogService } from '../audit-log/audit-log.service';
import type { CourseEntity } from '../course/entities/course.entity';
import type { EnterFirstEnrollmentEntity } from '../enter-first/entities/enter-first-enrollment.entity';
import { EmailService } from './email.service';
import type {
  EmailCampaignEntity,
  EmailMessageEntity,
  EmailSuppressionEntity,
  EmailTemplateEntity,
} from './entities/email.entities';

const roboticsId = '11111111-1111-4111-8111-111111111111';
const adaId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const kenId = '44444444-4444-4444-8444-444444444444';
const campaignId = '99999999-9999-4999-8999-999999999999';

type PaymentStatus = 'pending' | 'success' | 'failed' | 'refunded';

type Person = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  tracks: string[];
  paymentStatus: PaymentStatus;
  anonymisedAt?: Date | null;
  marketingOptIn?: boolean;
  currency?: string;
  amount?: number;
  paystackReference?: string;
  authorizationUrl?: string;
  priceSnapshot?: Array<{ enrollmentCutoff?: string | null }>;
};

type CourseRow = { id: string; slug: string; name: string };

const courses: CourseRow[] = [
  { id: roboticsId, slug: 'robotics', name: 'Robotics' },
];

const people: Person[] = [
  {
    id: adaId,
    email: 'Ada.Okoye@gmail.com',
    firstName: 'Ada',
    lastName: 'Okoye',
    tracks: ['robotics'],
    paymentStatus: 'success',
    marketingOptIn: true,
    anonymisedAt: null,
    currency: 'NGN',
    amount: 50000,
  },
  {
    id: kenId,
    email: 'ken.pending@gmail.com',
    firstName: 'Ken',
    lastName: 'Pending',
    tracks: ['robotics'],
    paymentStatus: 'pending',
    marketingOptIn: false,
    anonymisedAt: null,
  },
];

function paidQuery(rows: Person[]) {
  const checks: Array<(row: Person) => boolean> = [];
  const apply = (sql: string, params?: Record<string, unknown>) => {
    if (params && Object.prototype.hasOwnProperty.call(params, 'paid')) {
      checks.push((row) => row.paymentStatus === params.paid);
      return;
    }
    if (sql.includes('anonymised_at IS NULL')) {
      checks.push((row) => row.anonymisedAt == null);
      return;
    }
    if (typeof params?.track === 'string') {
      const slugs = JSON.parse(params.track) as string[];
      checks.push((row) => slugs.every((slug) => row.tracks.includes(slug)));
      return;
    }
    if (typeof params?.email === 'string') {
      const email = params.email;
      checks.push((row) => row.email.trim().toLowerCase() === email);
      return;
    }
    throw new Error(`Unhandled enrollment filter: ${sql}`);
  };
  const builder = {
    where(sql: string, params?: Record<string, unknown>) {
      apply(sql, params);
      return builder;
    },
    andWhere(sql: string, params?: Record<string, unknown>) {
      apply(sql, params);
      return builder;
    },
    getMany() {
      return Promise.resolve(
        rows.filter((row) => checks.every((check) => check(row))),
      );
    },
  };
  return builder;
}

function queryChain(result: unknown) {
  const builder = {
    update: () => builder,
    set: () => builder,
    where: () => builder,
    andWhere: () => builder,
    returning: () => builder,
    execute: () => Promise.resolve(result),
  };
  return builder;
}

describe('email:<address> recipients', () => {
  const audits: Array<Record<string, unknown>> = [];
  const messages = new Map<string, Record<string, unknown>>();
  let enrollmentsSaved = 0;

  function service(draftSelectors: string[] = []) {
    const draft: Record<string, unknown> = {
      id: campaignId,
      status: 'draft',
      selectors: draftSelectors,
      kind: 'transactional',
      subject: 'Hello',
      html: '<p>Hello</p>',
      text: 'Hello',
      attachments: [],
      createdBy: 'admin-author',
      name: 'Hello',
      totalRecipients: 0,
      sentCount: 0,
      failedCount: 0,
      audience: { kind: 'explicit', emails: [] },
    };
    const enrollments = {
      createQueryBuilder: () => paidQuery(people),
      findOne: (options: { where?: { id?: string } }) =>
        Promise.resolve(
          people.find((row) => row.id === options.where?.id) ?? null,
        ),
      find: () => Promise.resolve(people),
      save: () => {
        enrollmentsSaved += 1;
        throw new Error('outside recipients must not create enrollments');
      },
      create: () => {
        enrollmentsSaved += 1;
        throw new Error('outside recipients must not create enrollments');
      },
    };
    const campaigns = {
      create: (row: Record<string, unknown>) => row,
      save: (row: Record<string, unknown>) => Promise.resolve(row),
      findOne: () => Promise.resolve(draft),
      find: () => Promise.resolve([]),
      createQueryBuilder: () => queryChain({ raw: [{ id: campaignId }] }),
    };
    const messageRepo = {
      create: (row: Record<string, unknown>) => ({ ...row }),
      save: (rows: Record<string, unknown> | Record<string, unknown>[]) => {
        const list = Array.isArray(rows) ? rows : [rows];
        const saved = list.map((row) => {
          const id =
            (row.id as string | undefined) ?? `msg-${messages.size + 1}`;
          const next = { ...row, id };
          messages.set(id, next);
          return next;
        });
        return Promise.resolve(Array.isArray(rows) ? saved : saved[0]);
      },
      find: () => Promise.resolve([]),
      count: () => Promise.resolve(0),
      createQueryBuilder: () => queryChain({ raw: [] }),
    };
    const config = {
      get: (key: string) => {
        const values: Record<string, unknown> = {
          'unsubscribe.secret': 'secret',
          'email.batchSize': 50,
          'email.allowlist': '',
          'email.redirectTo': '',
          'email.fromName': 'Aurora',
          'email.fromEmail': 'no-reply@aurorainstitute.ca',
          'http.publicApiUrl': 'http://localhost:4000',
          port: 4000,
          nodeEnv: 'test',
        };
        return values[key];
      },
    };
    const audit = {
      log: (entry: Record<string, unknown>) => {
        audits.push(entry);
      },
    };
    return {
      draft,
      emails: new EmailService(
        {} as Repository<EmailTemplateEntity>,
        campaigns as unknown as Repository<EmailCampaignEntity>,
        messageRepo as unknown as Repository<EmailMessageEntity>,
        {
          find: () => Promise.resolve([]),
        } as unknown as Repository<EmailSuppressionEntity>,
        enrollments as unknown as Repository<EnterFirstEnrollmentEntity>,
        {
          findOne: (options: { where?: { id?: string } }) =>
            Promise.resolve(
              courses.find((row) => row.id === options.where?.id) ?? null,
            ),
          find: () => Promise.resolve(courses),
        } as unknown as Repository<CourseEntity>,
        config as unknown as ConfigService<EnvTypes, true>,
        {} as DataSource,
        audit as unknown as AuditLogService,
      ),
    };
  }

  beforeEach(() => {
    audits.length = 0;
    messages.clear();
    enrollmentsSaved = 0;
  });

  it('treats a paid match as that student and anyone else as outside', async () => {
    const { emails } = service();

    await expect(
      emails.previewSelectors({
        selectors: ['email:  Ada.Okoye@Gmail.com '],
      }),
    ).resolves.toMatchObject({
      count: 1,
      notInSystem: 0,
      sample: [
        {
          email: 'ada.okoye@gmail.com',
          name: 'Ada Okoye',
          enrollmentId: adaId,
          courses: ['Robotics'],
        },
      ],
    });

    await expect(
      emails.previewSelectors({
        selectors: ['email:ken.pending@gmail.com', 'email:guest@gmail.com'],
      }),
    ).resolves.toMatchObject({
      count: 2,
      notInSystem: 2,
      sample: [
        {
          email: 'ken.pending@gmail.com',
          name: '',
          enrollmentId: null,
          courses: [],
        },
        {
          email: 'guest@gmail.com',
          name: '',
          enrollmentId: null,
          courses: [],
        },
      ],
    });
  });

  it('de-duplicates an address that is also in a course', async () => {
    const { emails } = service();
    const preview = await emails.previewSelectors({
      selectors: [
        'email:guest@gmail.com',
        'email: Guest@Gmail.com',
        `course:${roboticsId}`,
        'email:ada.okoye@gmail.com',
      ],
    });

    expect(preview.count).toBe(2);
    expect(preview.notInSystem).toBe(1);
    expect(preview.sample.map((row) => row.email)).toEqual([
      'guest@gmail.com',
      'ada.okoye@gmail.com',
    ]);
  });

  it('rejects an address the mailer would not send', async () => {
    const { emails } = service();
    await expect(
      emails.previewSelectors({ selectors: ['email:ada@mailinator.com'] }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      emails.saveDraft(
        {
          subject: 'Hello',
          html: '<p>Hello</p>',
          selectors: ['email:not-an-email'],
        },
        'admin-author',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('stores the normalised selector on a draft', async () => {
    const { emails } = service();
    const draft = await emails.saveDraft(
      {
        subject: 'Hello',
        html: '<p>Hello</p>',
        selectors: ['email:  Guest@Gmail.com ', `course:${roboticsId}`],
      },
      'admin-author',
    );
    expect(draft.selectors).toEqual([
      'email:guest@gmail.com',
      `course:${roboticsId}`,
    ]);
  });

  it('queues an outside address on the student send path and audits it', async () => {
    const { emails } = service(['email:  Guest@Gmail.com ']);
    const sent = await emails.sendDraftNow(campaignId, {
      userId: 'admin-sender',
    });

    expect(sent.queued).toBe(1);
    expect(enrollmentsSaved).toBe(0);
    const queued = [...messages.values()];
    expect(queued.some((row) => row.toEmail === 'guest@gmail.com')).toBe(true);
    const outside = queued.find((row) => row.toEmail === 'guest@gmail.com');
    expect(outside).toMatchObject({
      enrollmentId: null,
      toEmail: 'guest@gmail.com',
    });
    expect(String(outside?.idempotencyKey)).toMatch(/^ef-email-/);
    expect(audits).toEqual([
      {
        type: 'mutation',
        action: 'EMAIL_OUTSIDE_SEND',
        userId: 'admin-sender',
        resourceType: 'email',
        resourceId: campaignId,
        metadata: { outsideEmails: ['guest@gmail.com'] },
      },
    ]);
  });

  it('does not audit a typed address that is a paid student', async () => {
    const { emails } = service(['email:Ada.Okoye@gmail.com']);
    await emails.sendDraftNow(campaignId, { userId: 'admin-sender' });
    expect(audits).toEqual([]);
    const ada = [...messages.values()].find(
      (row) => row.toEmail === 'ada.okoye@gmail.com',
    );
    expect(ada).toMatchObject({ enrollmentId: adaId });
  });

  it('marks sent recipients that are not students', async () => {
    const sentCampaign = {
      id: campaignId,
      status: 'sending',
      name: 'Hello',
      subject: 'Hello',
      html: '<p>Hello</p>',
      text: 'Hello',
      kind: 'transactional',
      audience: { kind: 'explicit', emails: [] },
      totalRecipients: 2,
      sentCount: 1,
      failedCount: 0,
      selectors: ['email:guest@gmail.com'],
      templateId: null,
      scheduledAt: null,
      createdAt: new Date('2026-10-09T00:00:00.000Z'),
    };
    const emails = new EmailService(
      {} as Repository<EmailTemplateEntity>,
      {
        findOne: () => Promise.resolve(sentCampaign),
      } as unknown as Repository<EmailCampaignEntity>,
      {
        find: () =>
          Promise.resolve([
            {
              id: 'msg-ada',
              enrollmentId: adaId,
              toEmail: 'ada.okoye@gmail.com',
              toName: 'Ada Okoye',
              status: 'delivered',
              attempts: 1,
              lastError: null,
              resendId: 're_1',
            },
            {
              id: 'msg-guest',
              enrollmentId: null,
              toEmail: 'guest@gmail.com',
              toName: 'there',
              status: 'queued',
              attempts: 0,
              lastError: null,
              resendId: null,
            },
          ]),
      } as unknown as Repository<EmailMessageEntity>,
      {} as Repository<EmailSuppressionEntity>,
      {} as Repository<EnterFirstEnrollmentEntity>,
      {} as Repository<CourseEntity>,
      { get: () => undefined } as unknown as ConfigService<EnvTypes, true>,
      {} as DataSource,
    );

    const detail = await emails.getSent(campaignId);
    expect(detail.recipients).toEqual([
      expect.objectContaining({
        email: 'ada.okoye@gmail.com',
        enrollmentId: adaId,
        inSystem: true,
      }),
      expect.objectContaining({
        email: 'guest@gmail.com',
        enrollmentId: null,
        inSystem: false,
      }),
    ]);
  });
});
