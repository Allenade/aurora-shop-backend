import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  OnApplicationBootstrap,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { AuditLogType, type EnvTypes } from '@app/shared';
import { In, Repository } from 'typeorm';
import { AuditLogService } from '../audit-log/audit-log.service';
import { EnterFirstEnrollmentEntity } from '../enter-first/entities/enter-first-enrollment.entity';
import { CORE_TRACK_CATALOG } from '../enter-first/enter-first.pricing';
import {
  cohortKey,
  courseArchiveBlock,
  courseDeleteBlock,
  quoteCourses,
  type CourseQuoteInput,
  type CourseStatus,
} from './course-pricing';
import type { UpdateCourseDto, UpsertCourseDto } from './dto/course.dto';
import { CoursePriceHistoryEntity } from './entities/course-price-history.entity';
import { CourseEntity } from './entities/course.entity';

const SEAT_HOLD_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class CourseService implements OnApplicationBootstrap {
  private readonly logger = new Logger(CourseService.name);

  constructor(
    @InjectRepository(CourseEntity)
    private readonly courses: Repository<CourseEntity>,
    @InjectRepository(CoursePriceHistoryEntity)
    private readonly history: Repository<CoursePriceHistoryEntity>,
    @InjectRepository(EnterFirstEnrollmentEntity)
    private readonly enrollments: Repository<EnterFirstEnrollmentEntity>,
    private readonly audit: AuditLogService,
    private readonly config: ConfigService<EnvTypes, true>,
  ) {}

  async onApplicationBootstrap() {
    try {
      await this.seedCatalogue();
    } catch (err) {
      this.logger.warn(
        `Course seed skipped: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  async listPublic() {
    const rows = await this.courses.find({
      where: { status: 'open' },
      order: { sortOrder: 'ASC', name: 'ASC' },
    });
    const seats = await this.seatCounts(rows.map((row) => row.slug));
    return rows.map((row) => this.toDto(row, seats.get(row.slug) ?? 0));
  }

  async listAdmin() {
    const rows = await this.courses.find({
      order: { sortOrder: 'ASC', name: 'ASC' },
    });
    const seats = await this.seatCounts(rows.map((row) => row.slug));
    return rows.map((row) => this.toDto(row, seats.get(row.slug) ?? 0));
  }

  async get(id: string) {
    const row = await this.findOrThrow(id);
    const seats = await this.seatCounts([row.slug]);
    return this.toDto(row, seats.get(row.slug) ?? 0);
  }

  async create(dto: UpsertCourseDto, actorId?: string) {
    const existing = await this.courses.findOne({
      where: { slug: dto.slug.trim() },
    });
    if (existing) throw new BadRequestException('Slug already exists');
    const row = await this.courses.save(
      this.courses.create(this.applyDto(dto, this.courses.create())),
    );
    await this.history.save(
      this.history.create({
        courseId: row.id,
        actorId: actorId ?? null,
        oldPrice: 0,
        newPrice: row.price,
        oldCurrency: null,
        newCurrency: row.currency,
        effectiveFrom: dto.effectiveFrom
          ? new Date(dto.effectiveFrom)
          : new Date(),
      }),
    );
    this.audit.log({
      type: AuditLogType.MUTATION,
      action: 'COURSE_CREATED',
      userId: actorId,
      resourceType: 'course',
      resourceId: row.id,
      metadata: { slug: row.slug, price: row.price },
    });
    return this.toDto(row, 0);
  }

  async update(id: string, dto: UpdateCourseDto, actorId?: string) {
    const row = await this.findOrThrow(id);
    const previousPrice = row.price;
    const previousCurrency = row.currency;
    if (dto.slug && dto.slug !== row.slug) {
      const clash = await this.courses.findOne({ where: { slug: dto.slug } });
      if (clash && clash.id !== row.id) {
        throw new BadRequestException('Slug already exists');
      }
    }
    this.applyDto(dto, row);
    await this.courses.save(row);
    if (row.price !== previousPrice || row.currency !== previousCurrency) {
      await this.history.save(
        this.history.create({
          courseId: row.id,
          actorId: actorId ?? null,
          oldPrice: previousPrice,
          newPrice: row.price,
          oldCurrency: previousCurrency,
          newCurrency: row.currency,
          effectiveFrom: dto.effectiveFrom
            ? new Date(dto.effectiveFrom)
            : new Date(),
        }),
      );
      this.audit.log({
        type: AuditLogType.MUTATION,
        action: 'COURSE_PRICE_CHANGED',
        userId: actorId,
        resourceType: 'course',
        resourceId: row.id,
        metadata: {
          oldPrice: previousPrice,
          newPrice: row.price,
          oldCurrency: previousCurrency,
          newCurrency: row.currency,
        },
      });
    } else {
      this.audit.log({
        type: AuditLogType.MUTATION,
        action: 'COURSE_UPDATED',
        userId: actorId,
        resourceType: 'course',
        resourceId: row.id,
      });
    }
    const seats = await this.seatCounts([row.slug]);
    return this.toDto(row, seats.get(row.slug) ?? 0);
  }

  async remove(id: string, actorId?: string) {
    const row = await this.findOrThrow(id);
    const count = await this.enrollmentCount(row.slug);
    const block = courseDeleteBlock(row.status, count);
    if (block) throw new BadRequestException(block);
    await this.courses.softRemove(row);
    this.audit.log({
      type: AuditLogType.MUTATION,
      action: 'COURSE_DELETED',
      userId: actorId,
      resourceType: 'course',
      resourceId: row.id,
    });
    return { ok: true };
  }

  async archive(id: string, actorId?: string) {
    const row = await this.findOrThrow(id);
    const count = await this.enrollmentCount(row.slug);
    const block = courseArchiveBlock(count);
    if (block) throw new BadRequestException(block);
    row.status = 'archived';
    await this.courses.save(row);
    this.audit.log({
      type: AuditLogType.MUTATION,
      action: 'COURSE_ARCHIVED',
      userId: actorId,
      resourceType: 'course',
      resourceId: row.id,
    });
    return this.toDto(row, count);
  }

  async reorder(ids: string[], actorId?: string) {
    const rows = await this.courses.find({ where: { id: In(ids) } });
    if (rows.length !== ids.length) {
      throw new BadRequestException('One or more courses were not found');
    }
    const byId = new Map(rows.map((row) => [row.id, row]));
    for (let index = 0; index < ids.length; index += 1) {
      const row = byId.get(ids[index]);
      if (!row) continue;
      row.sortOrder = index;
    }
    await this.courses.save(rows);
    this.audit.log({
      type: AuditLogType.MUTATION,
      action: 'COURSE_REORDERED',
      userId: actorId,
      resourceType: 'course',
      metadata: { ids },
    });
    return this.listAdmin();
  }

  async priceHistory(id: string) {
    await this.findOrThrow(id);
    const rows = await this.history.find({
      where: { courseId: id },
      order: { effectiveFrom: 'DESC' },
    });
    return rows.map((row) => ({
      id: row.id,
      courseId: row.courseId,
      actorId: row.actorId ?? null,
      oldPrice: row.oldPrice,
      newPrice: row.newPrice,
      oldCurrency: row.oldCurrency ?? null,
      newCurrency: row.newCurrency ?? null,
      effectiveFrom: row.effectiveFrom.toISOString(),
      createdAt: row.createdAt?.toISOString?.() ?? row.createdAt,
    }));
  }

  async quote(slugs: string[], now = new Date()) {
    const unique = [
      ...new Set(slugs.map((slug) => slug.trim()).filter(Boolean)),
    ];
    const rows = unique.length
      ? await this.courses.find({ where: { slug: In(unique) } })
      : [];
    const seats = await this.seatCounts(unique);
    const inputs: CourseQuoteInput[] = rows.map((row) => ({
      slug: row.slug,
      name: row.name,
      price: row.price,
      currency: row.currency,
      isFree: row.isFree,
      status: row.status,
      seatCap: row.seatCap ?? null,
      seatsTaken: seats.get(row.slug) ?? 0,
      enrollmentCutoff: row.enrollmentCutoff ?? null,
      startDate: row.startDate ?? null,
    }));
    return quoteCourses(inputs, unique, now);
  }

  async seatCounts(slugs: string[]) {
    const counts = new Map<string, number>();
    if (!slugs.length) return counts;
    const holdAfter = new Date(Date.now() - SEAT_HOLD_MS);
    const rows = await this.enrollments
      .createQueryBuilder('e')
      .select(['e.tracks', 'e.paymentStatus', 'e.createdAt'])
      .where('e.paymentStatus IN (:...statuses)', {
        statuses: ['pending', 'success'],
      })
      .getMany();
    for (const row of rows) {
      const holdsSeat =
        row.paymentStatus === 'success' ||
        (row.paymentStatus === 'pending' && row.createdAt >= holdAfter);
      if (!holdsSeat) continue;
      for (const slug of row.tracks ?? []) {
        if (!slugs.includes(slug)) continue;
        counts.set(slug, (counts.get(slug) ?? 0) + 1);
      }
    }
    return counts;
  }

  private async enrollmentCount(slug: string) {
    const rows = await this.enrollments
      .createQueryBuilder('e')
      .where('e.tracks @> CAST(:track AS jsonb)', {
        track: JSON.stringify([slug]),
      })
      .getCount();
    return rows;
  }

  private async findOrThrow(id: string) {
    const row = await this.courses.findOne({ where: { id } });
    if (!row) throw new NotFoundException('Course not found');
    return row;
  }

  private applyDto(
    dto: Partial<UpsertCourseDto>,
    row: CourseEntity,
  ): CourseEntity {
    if (dto.slug != null) row.slug = dto.slug.trim();
    if (dto.name != null) row.name = dto.name.trim();
    if (dto.description != null) row.description = dto.description;
    if (dto.price != null) row.price = dto.price;
    if (dto.currency != null) row.currency = dto.currency.toUpperCase();
    if (dto.isFree != null) row.isFree = dto.isFree;
    if (dto.seatCap !== undefined) row.seatCap = dto.seatCap;
    if (dto.startDate !== undefined) {
      row.startDate = dto.startDate ? new Date(dto.startDate) : null;
    }
    if (dto.endDate !== undefined) {
      row.endDate = dto.endDate ? new Date(dto.endDate) : null;
    }
    if (dto.enrollmentCutoff !== undefined) {
      row.enrollmentCutoff = dto.enrollmentCutoff
        ? new Date(dto.enrollmentCutoff)
        : null;
    }
    if (dto.status != null) row.status = dto.status;
    if (dto.sortOrder != null) row.sortOrder = dto.sortOrder;
    if (row.isFree) row.price = 0;
    return row;
  }

  private async seedCatalogue() {
    const amount = this.config.get('enterFirst.seedTrackAmountNgn', {
      infer: true,
    });
    for (const track of CORE_TRACK_CATALOG) {
      const existing = await this.courses.findOne({
        where: { slug: track.slug },
      });
      if (existing) continue;
      const row = await this.courses.save(
        this.courses.create({
          slug: track.slug,
          name: track.name,
          description: track.description,
          price: amount,
          currency: 'NGN',
          isFree: amount <= 0,
          status: 'open' as CourseStatus,
          sortOrder: track.sortOrder,
        }),
      );
      await this.history.save(
        this.history.create({
          courseId: row.id,
          actorId: null,
          oldPrice: 0,
          newPrice: row.price,
          oldCurrency: null,
          newCurrency: row.currency,
          effectiveFrom: new Date(),
        }),
      );
      this.logger.log(`Seeded course ${track.slug} at NGN ${amount}`);
    }
  }

  private toDto(row: CourseEntity, seatsTaken: number) {
    return {
      id: row.id,
      slug: row.slug,
      name: row.name,
      description: row.description,
      price: row.isFree ? 0 : row.price,
      currency: row.currency,
      isFree: row.isFree,
      seatCap: row.seatCap ?? null,
      seatsTaken,
      seatsRemaining:
        row.seatCap == null ? null : Math.max(0, row.seatCap - seatsTaken),
      startDate: row.startDate?.toISOString() ?? null,
      endDate: row.endDate?.toISOString() ?? null,
      enrollmentCutoff: row.enrollmentCutoff?.toISOString() ?? null,
      cohort: cohortKey({
        slug: row.slug,
        startDate: row.startDate ?? null,
      }),
      status: row.status,
      sortOrder: row.sortOrder,
      createdAt: row.createdAt?.toISOString?.() ?? row.createdAt,
      updatedAt: row.updatedAt?.toISOString?.() ?? row.updatedAt,
    };
  }
}
