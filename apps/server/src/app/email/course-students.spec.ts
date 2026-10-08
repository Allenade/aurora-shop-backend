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
const visionId = '22222222-2222-4222-8222-222222222222';
const missingId = '33333333-3333-4333-8333-333333333333';
const adaId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const adaAgainId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const toluId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const bolaId = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const sadeId = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const chiId = 'ffffffff-ffff-4fff-8fff-ffffffffffff';

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
};

type CourseRow = { id: string; slug: string; name: string };

function person(partial: Person): Person {
  return { marketingOptIn: true, anonymisedAt: null, ...partial };
}

/**
 * Honors the payment, anonymised, and course-slug clauses the query builder
 * receives. Dropping one of those clauses lets a row through and fails the test.
 */
function paidQuery(people: Person[]) {
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
        people.filter((row) => checks.every((check) => check(row))),
      );
    },
  };
  return builder;
}

function serviceFor(
  people: Person[],
  courses: CourseRow[],
  suppressed: Array<{
    email: string;
    reason: 'hard_bounce' | 'complaint' | 'unsubscribe';
  }> = [],
) {
  const enrollments = {
    createQueryBuilder: () => paidQuery(people),
    findOne: (options: { where?: { id?: string } }) =>
      Promise.resolve(
        people.find((row) => row.id === options.where?.id) ?? null,
      ),
    find: (options: { where?: { email?: string } }) =>
      Promise.resolve(
        people.filter((row) => row.email === options.where?.email),
      ),
  };
  const courseRepo = {
    findOne: (options: { where?: { id?: string } }) =>
      Promise.resolve(
        courses.find((row) => row.id === options.where?.id) ?? null,
      ),
    find: () => Promise.resolve(courses),
  };
  return new EmailService(
    {} as Repository<EmailTemplateEntity>,
    {} as Repository<EmailCampaignEntity>,
    {} as Repository<EmailMessageEntity>,
    {
      find: () => Promise.resolve(suppressed),
    } as unknown as Repository<EmailSuppressionEntity>,
    enrollments as unknown as Repository<EnterFirstEnrollmentEntity>,
    courseRepo as unknown as Repository<CourseEntity>,
    { get: () => 'test' } as unknown as ConfigService<EnvTypes, true>,
    {} as DataSource,
  );
}

describe('GET /api/v1/admin/emails/courses/:courseId/students', () => {
  const courses: CourseRow[] = [
    { id: roboticsId, slug: 'robotics', name: 'Robotics' },
    { id: visionId, slug: 'vision', name: 'Computer vision' },
  ];
  const people: Person[] = [
    person({
      id: toluId,
      email: 'tolu.ade@gmail.com',
      firstName: 'Tolu',
      lastName: 'Ade',
      tracks: ['robotics'],
      paymentStatus: 'success',
    }),
    person({
      id: adaId,
      email: 'Ada.Okoye@gmail.com',
      firstName: 'Ada',
      lastName: 'Okoye',
      tracks: ['robotics', 'vision'],
      paymentStatus: 'success',
      marketingOptIn: false,
    }),
    person({
      id: adaAgainId,
      email: 'ada.okoye@gmail.com',
      firstName: 'Ada',
      lastName: 'Okoye',
      tracks: ['robotics'],
      paymentStatus: 'success',
    }),
    person({
      id: chiId,
      email: 'chi.okonkwo@gmail.com',
      firstName: 'Chi',
      lastName: 'Okonkwo',
      tracks: ['robotics'],
      paymentStatus: 'success',
    }),
    person({
      id: '44444444-4444-4444-8444-444444444444',
      email: 'ken.pending@gmail.com',
      firstName: 'Ken',
      lastName: 'Pending',
      tracks: ['robotics'],
      paymentStatus: 'pending',
    }),
    person({
      id: '55555555-5555-4555-8555-555555555555',
      email: 'ngozi.refund@gmail.com',
      firstName: 'Ngozi',
      lastName: 'Refund',
      tracks: ['robotics'],
      paymentStatus: 'refunded',
    }),
    person({
      id: '66666666-6666-4666-8666-666666666666',
      email: 'emeka.gone@gmail.com',
      firstName: 'Emeka',
      lastName: 'Gone',
      tracks: ['robotics'],
      paymentStatus: 'success',
      anonymisedAt: new Date('2026-01-01T00:00:00.000Z'),
    }),
    person({
      id: bolaId,
      email: 'bola.nwosu@gmail.com',
      firstName: 'Bola',
      lastName: 'Nwosu',
      tracks: ['vision'],
      paymentStatus: 'success',
    }),
    person({
      id: sadeId,
      email: 'sade.bello@gmail.com',
      firstName: 'Sade',
      lastName: 'Bello',
      tracks: ['mobile'],
      paymentStatus: 'success',
    }),
    person({
      id: '77777777-7777-4777-8777-777777777777',
      email: 'ghost@mailinator.com',
      firstName: 'Ghost',
      lastName: 'Address',
      tracks: ['robotics'],
      paymentStatus: 'success',
    }),
  ];

  function service() {
    return serviceFor(people, courses, [
      { email: 'chi.okonkwo@gmail.com', reason: 'hard_bounce' },
    ]);
  }

  it('returns the people who would receive a course email, sorted by name', async () => {
    const roster = await service().listCourseStudents(roboticsId);

    expect(roster).toEqual({
      count: 2,
      items: [
        {
          enrollmentId: adaId,
          name: 'Ada Okoye',
          email: 'ada.okoye@gmail.com',
        },
        {
          enrollmentId: toluId,
          name: 'Tolu Ade',
          email: 'tolu.ade@gmail.com',
        },
      ],
    });
  });

  it('returns an empty list when the course does not exist', async () => {
    await expect(service().listCourseStudents(missingId)).resolves.toEqual({
      count: 0,
      items: [],
    });
  });

  it('rejects a course id the selector would reject', async () => {
    await expect(
      service().listCourseStudents('robotics'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('counts a mix of selectors once per email', async () => {
    const preview = await service().previewSelectors({
      selectors: [
        `course:${roboticsId}`,
        `course:${visionId}`,
        'allPaid',
        `student:${adaId}`,
      ],
    });

    expect(preview.count).toBe(4);
    expect(preview.sample.map((row) => row.email)).toEqual([
      'tolu.ade@gmail.com',
      'ada.okoye@gmail.com',
      'bola.nwosu@gmail.com',
      'sade.bello@gmail.com',
    ]);
    expect(new Set(preview.sample.map((row) => row.email)).size).toBe(
      preview.count,
    );
  });
});
