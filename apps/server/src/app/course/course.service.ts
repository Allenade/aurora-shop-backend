import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { AuditLogType } from '@app/shared';
import { AuditLogService } from '../audit-log/audit-log.service';
import { EnterFirstEnrollmentEntity } from '../enter-first/entities/enter-first-enrollment.entity';
import {
  isEnrollable,
  publishBlockReason,
  quoteCourses,
  type PricedCourse,
} from './course-pricing';
import type {
  ReorderCoursesDto,
  UpdateCourseDto,
  UpsertCourseDto,
} from './dto/course.dto';
import { CoursePriceHistoryEntity } from './entities/course-price-history.entity';
import { CourseEntity } from './entities/course.entity';

@Injectable()
export class CourseService {
  constructor(
    @InjectRepository(CourseEntity)
    private readonly courses: Repository<CourseEntity>,
    @InjectRepository(CoursePriceHistoryEntity)
    private readonly history: Repository<CoursePriceHistoryEntity>,
    @InjectRepository(EnterFirstEnrollmentEntity)
    private readonly enrollments: Repository<EnterFirstEnrollmentEntity>,
    private readonly audit: AuditLogService,
  ) {}

  async listPublic() {
    const rows = await this.courses.find({
      where: { status: 'open' },
      order: { sortOrder: 'ASC', name: 'ASC' },
    });
    const enrollable = rows.filter((row) =>
      isEnrollable({
        status: row.status,
        isFree: row.isFree,
        price: row.price,
      }),
    );
    return Promise.all(enrollable.map((row) => this.toPublicDto(row)));
  }

  async listAdmin() {
    const rows = await this.courses.find({
      order: { sortOrder: 'ASC', name: 'ASC' },
    });
    return Promise.all(rows.map((row) => this.toAdminDto(row)));
  }

  async getAdmin(id: string) {
    const row = await this.findOrThrow(id);
    const history = await this.history.find({
      where: { courseId: id },
      order: { effectiveFrom: 'DESC' },
      take: 50,
    });
    return {
      ...(await this.toAdminDto(row)),
      priceHistory: history.map((entry) => ({
        id: entry.id,
        changedBy: entry.changedBy ?? null,
        oldPrice: entry.oldPrice ?? null,
        newPrice: entry.newPrice,
        oldCurrency: entry.oldCurrency ?? null,
        newCurrency: entry.newCurrency,
        effectiveFrom: entry.effectiveFrom.toISOString(),
        createdAt: entry.createdAt?.toISOString?.() ?? entry.createdAt,
      })),
    };
  }

  async create(dto: UpsertCourseDto, userId?: string) {
    const slug = dto.slug.trim().toLowerCase();
    const existing = await this.courses.findOne({ where: { slug } });
    if (existing)
      throw new BadRequestException(`Course ${slug} already exists`);
    const price = dto.price ?? null;
    const isFree = dto.isFree ?? false;
    const status = dto.status ?? 'draft';
    const block = publishBlockReason({ status, isFree, price });
    if (block) throw new BadRequestException(block);
    const row = await this.courses.save(
      this.courses.create({
        slug,
        name: dto.name.trim(),
        description: dto.description?.trim() ?? '',
        price,
        currency: (dto.currency ?? 'NGN').toUpperCase(),
        isFree,
        seatCap: dto.seatCap ?? null,
        startDate: parseDate(dto.startDate),
        endDate: parseDate(dto.endDate),
        enrollmentCutoff: parseDate(dto.enrollmentCutoff),
        status,
        sortOrder: dto.sortOrder ?? 0,
        cohort: dto.cohort?.trim() || null,
      }),
    );
    if (row.price != null) {
      await this.history.save(
        this.history.create({
          courseId: row.id,
          changedBy: userId ?? null,
          oldPrice: null,
          newPrice: row.price,
          oldCurrency: null,
          newCurrency: row.currency,
          effectiveFrom: new Date(),
        }),
      );
    }
    this.audit.log({
      type: AuditLogType.MUTATION,
      action: 'COURSE_CREATED',
      userId,
      resourceType: 'course',
      resourceId: row.id,
      metadata: { slug: row.slug, price: row.price },
    });
    return this.toAdminDto(row);
  }

  async update(id: string, dto: UpdateCourseDto, userId?: string) {
    const row = await this.findOrThrow(id);
    const nextPrice = dto.price !== undefined ? dto.price : row.price;
    const nextIsFree = dto.isFree !== undefined ? dto.isFree : row.isFree;
    const nextStatus = dto.status !== undefined ? dto.status : row.status;
    const block = publishBlockReason({
      status: nextStatus,
      isFree: nextIsFree,
      price: nextPrice ?? null,
    });
    if (block) throw new BadRequestException(block);
    const previous = { price: row.price, currency: row.currency };
    if (dto.name !== undefined) row.name = dto.name.trim();
    if (dto.description !== undefined) row.description = dto.description.trim();
    if (dto.price !== undefined) row.price = dto.price;
    if (dto.currency !== undefined) row.currency = dto.currency.toUpperCase();
    if (dto.isFree !== undefined) row.isFree = dto.isFree;
    if (dto.seatCap !== undefined) row.seatCap = dto.seatCap;
    if (dto.startDate !== undefined) row.startDate = parseDate(dto.startDate);
    if (dto.endDate !== undefined) row.endDate = parseDate(dto.endDate);
    if (dto.enrollmentCutoff !== undefined) {
      row.enrollmentCutoff = parseDate(dto.enrollmentCutoff);
    }
    if (dto.status !== undefined) row.status = dto.status;
    if (dto.sortOrder !== undefined) row.sortOrder = dto.sortOrder;
    if (dto.cohort !== undefined) row.cohort = dto.cohort?.trim() || null;
    await this.courses.save(row);
    if (row.price !== previous.price || row.currency !== previous.currency) {
      await this.history.save(
        this.history.create({
          courseId: row.id,
          changedBy: userId ?? null,
          oldPrice: previous.price,
          newPrice: row.price,
          oldCurrency: previous.currency,
          newCurrency: row.currency,
          effectiveFrom: new Date(),
        }),
      );
      this.audit.log({
        type: AuditLogType.MUTATION,
        action: 'COURSE_PRICE_CHANGED',
        userId,
        resourceType: 'course',
        resourceId: row.id,
        metadata: {
          from: previous,
          to: { price: row.price, currency: row.currency },
        },
      });
    }
    this.audit.log({
      type: AuditLogType.MUTATION,
      action: 'COURSE_UPDATED',
      userId,
      resourceType: 'course',
      resourceId: row.id,
    });
    return this.toAdminDto(row);
  }

  async remove(id: string, userId?: string) {
    const row = await this.findOrThrow(id);
    const count = await this.enrollmentCount(row.slug);
    if (row.status !== 'draft' || count > 0) {
      throw new BadRequestException(
        'Only draft courses with no enrollments can be deleted',
      );
    }
    await this.courses.softRemove(row);
    this.audit.log({
      type: AuditLogType.MUTATION,
      action: 'COURSE_DELETED',
      userId,
      resourceType: 'course',
      resourceId: row.id,
    });
    return { ok: true };
  }

  async archive(id: string, userId?: string) {
    const row = await this.findOrThrow(id);
    const count = await this.enrollmentCount(row.slug);
    if (count < 1) {
      throw new BadRequestException(
        'Archive is only available once the course has enrollments',
      );
    }
    row.status = 'archived';
    await this.courses.save(row);
    this.audit.log({
      type: AuditLogType.MUTATION,
      action: 'COURSE_ARCHIVED',
      userId,
      resourceType: 'course',
      resourceId: row.id,
    });
    return this.toAdminDto(row);
  }

  async reorder(dto: ReorderCoursesDto, userId?: string) {
    const rows = await this.courses.find();
    const byId = new Map(rows.map((row) => [row.id, row]));
    dto.ids.forEach((id, index) => {
      const row = byId.get(id);
      if (row) row.sortOrder = index;
    });
    await this.courses.save([...byId.values()]);
    this.audit.log({
      type: AuditLogType.MUTATION,
      action: 'COURSE_REORDERED',
      userId,
      resourceType: 'course',
      metadata: { ids: dto.ids },
    });
    return this.listAdmin();
  }

  async quote(slugs: string[], now = new Date()) {
    const rows = await this.courses.find();
    const priced: PricedCourse[] = [];
    for (const row of rows) {
      priced.push({
        slug: row.slug,
        name: row.name,
        price: row.price,
        currency: row.currency,
        isFree: row.isFree,
        status: row.status,
        seatCap: row.seatCap ?? null,
        seatsTaken: await this.seatsHeld(row.slug),
        enrollmentCutoff: row.enrollmentCutoff ?? null,
      });
    }
    const result = quoteCourses(slugs, priced, now);
    if (!result.ok) throw new BadRequestException(result.error);
    return result;
  }

  async findSlugsByIds(ids: string[]) {
    if (!ids.length) return [];
    const rows = await this.courses.find({ where: { id: In(ids) } });
    return rows.map((row) => ({ id: row.id, slug: row.slug }));
  }

  async seatsHeld(slug: string) {
    return this.enrollments
      .createQueryBuilder('e')
      .where('e.payment_status IN (:...statuses)', {
        statuses: ['pending', 'success'],
      })
      .andWhere('e.tracks @> CAST(:track AS jsonb)', {
        track: JSON.stringify([slug]),
      })
      .getCount();
  }

  async enrollmentCount(slug: string) {
    return this.enrollments
      .createQueryBuilder('e')
      .where('e.tracks @> CAST(:track AS jsonb)', {
        track: JSON.stringify([slug]),
      })
      .getCount();
  }

  private async findOrThrow(id: string) {
    const row = await this.courses.findOne({ where: { id } });
    if (!row) throw new NotFoundException('Course not found');
    return row;
  }

  private async toPublicDto(row: CourseEntity) {
    const seatsTaken = await this.seatsHeld(row.slug);
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
      startDate: iso(row.startDate),
      endDate: iso(row.endDate),
      enrollmentCutoff: iso(row.enrollmentCutoff),
      status: row.status,
      sortOrder: row.sortOrder,
      cohort: row.cohort ?? null,
    };
  }

  private async toAdminDto(row: CourseEntity) {
    return {
      ...(await this.toPublicDto(row)),
      enrollmentCount: await this.enrollmentCount(row.slug),
      createdAt: row.createdAt?.toISOString?.() ?? row.createdAt,
      updatedAt: row.updatedAt?.toISOString?.() ?? row.updatedAt,
    };
  }
}

function parseDate(value?: string | null) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function iso(value?: Date | null) {
  return value ? new Date(value).toISOString() : null;
}
