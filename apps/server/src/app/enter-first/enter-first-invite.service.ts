import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { randomBytes } from 'crypto';
import type { EnvTypes } from '@app/shared';
import { AuditLogType } from '@app/shared';
import { DataSource, ILike, In, type EntityManager, Repository } from 'typeorm';
import { AuditLogService } from '../audit-log/audit-log.service';
import type { QuoteLine } from '../course/course-pricing';
import type { CreateInviteDto, UpdateInviteDto } from './dto/invite.dto';
import { EnterFirstInviteEntity } from './entities/enter-first-invite.entity';
import { EnterFirstPersonEntity } from './entities/enter-first-person.entity';
import { applyInviteToQuote, type PricingType } from './invite-pricing';
import { maskEmail, maskName } from './pii';

export type RedeemedInvite = {
  invite: EnterFirstInviteEntity;
  amount: number;
  currency: string;
  lines: QuoteLine[];
  listAmount: number;
  pricingType: PricingType;
  discountLabel: string | null;
};

@Injectable()
export class EnterFirstInviteService {
  constructor(
    @InjectRepository(EnterFirstInviteEntity)
    private readonly invites: Repository<EnterFirstInviteEntity>,
    @InjectRepository(EnterFirstPersonEntity)
    private readonly people: Repository<EnterFirstPersonEntity>,
    private readonly dataSource: DataSource,
    private readonly audit: AuditLogService,
    private readonly config: ConfigService<EnvTypes, true>,
  ) {}

  async list(opts: {
    q?: string;
    page?: number;
    limit?: number;
    maskPii?: boolean;
  }) {
    const page = Math.max(1, opts.page ?? 1);
    const limit = Math.min(100, Math.max(1, opts.limit ?? 50));
    const where = opts.q?.trim()
      ? [
          { code: ILike(`%${opts.q.trim()}%`) },
          { label: ILike(`%${opts.q.trim()}%`) },
        ]
      : undefined;
    const [items, total] = await this.invites.findAndCount({
      where,
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    const personIds = [
      ...new Set(items.map((row) => row.personId).filter(Boolean)),
    ] as string[];
    const people =
      personIds.length > 0
        ? await this.people.find({ where: { id: In(personIds) } })
        : [];
    const byId = new Map(people.map((person) => [person.id, person]));
    return {
      items: items.map((row) =>
        this.toDto(row, byId.get(row.personId ?? ''), opts.maskPii),
      ),
      total,
      page,
      limit,
      pageCount: Math.max(1, Math.ceil(total / limit)),
    };
  }

  async get(id: string, maskPii = false) {
    const row = await this.findOrThrow(id);
    const person = row.personId
      ? await this.people.findOne({ where: { id: row.personId } })
      : null;
    return this.toDto(row, person, maskPii);
  }

  async create(dto: CreateInviteDto, userId?: string) {
    this.validateOffer(dto);
    if (dto.personId) {
      const person = await this.people.findOne({ where: { id: dto.personId } });
      if (!person) throw new BadRequestException('Person not found');
    }
    const trackScope = dto.trackScope ?? 'all';
    const trackSlugs =
      trackScope === 'selected'
        ? [
            ...new Set(
              (dto.trackSlugs ?? []).map((s) => s.trim()).filter(Boolean),
            ),
          ]
        : [];
    if (trackScope === 'selected' && trackSlugs.length === 0) {
      throw new BadRequestException(
        'Select at least one track when track scope is selected',
      );
    }

    const code = await this.nextUniqueCode();
    const row = await this.invites.save(
      this.invites.create({
        code,
        label: dto.label?.trim() || null,
        personId: dto.personId ?? null,
        lockToPerson: dto.lockToPerson ?? Boolean(dto.personId),
        offerType: dto.offerType,
        discountPercent:
          dto.offerType === 'discount_percent' ? dto.discountPercent! : null,
        discountAmount:
          dto.offerType === 'discount_fixed' ? dto.discountAmount! : null,
        trackScope,
        trackSlugs,
        maxRedemptions: dto.maxRedemptions ?? null,
        redemptionCount: 0,
        expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
        active: true,
        notes: dto.notes?.trim() || null,
        createdBy: userId ?? null,
      }),
    );
    this.audit.log({
      type: AuditLogType.MUTATION,
      action: 'ENTER_FIRST_INVITE_CREATED',
      userId,
      resourceType: 'enter_first_invite',
      resourceId: row.id,
      metadata: { code: row.code, offerType: row.offerType },
    });
    const person = row.personId
      ? await this.people.findOne({ where: { id: row.personId } })
      : null;
    return this.toDto(row, person);
  }

  async update(id: string, dto: UpdateInviteDto, userId?: string) {
    const row = await this.findOrThrow(id);
    if (dto.label !== undefined) row.label = dto.label?.trim() || null;
    if (dto.active !== undefined) row.active = dto.active;
    if (dto.lockToPerson !== undefined) row.lockToPerson = dto.lockToPerson;
    if (dto.maxRedemptions !== undefined) {
      row.maxRedemptions = dto.maxRedemptions;
    }
    if (dto.expiresAt !== undefined) {
      row.expiresAt = dto.expiresAt ? new Date(dto.expiresAt) : null;
    }
    if (dto.notes !== undefined) row.notes = dto.notes?.trim() || null;
    await this.invites.save(row);
    this.audit.log({
      type: AuditLogType.MUTATION,
      action: 'ENTER_FIRST_INVITE_UPDATED',
      userId,
      resourceType: 'enter_first_invite',
      resourceId: row.id,
      metadata: { active: row.active },
    });
    const person = row.personId
      ? await this.people.findOne({ where: { id: row.personId } })
      : null;
    return this.toDto(row, person);
  }

  async remove(id: string, userId?: string) {
    const row = await this.findOrThrow(id);
    const code = row.code;
    row.active = false;
    await this.invites.save(row);
    await this.invites.softRemove(row);
    this.audit.log({
      type: AuditLogType.MUTATION,
      action: 'ENTER_FIRST_INVITE_DELETED',
      userId,
      resourceType: 'enter_first_invite',
      resourceId: id,
      metadata: { code },
    });
    return { ok: true };
  }

  async removeForPerson(personId: string, userId?: string) {
    const rows = await this.invites.find({ where: { personId } });
    for (const row of rows) {
      await this.remove(row.id, userId);
    }
    return { count: rows.length };
  }

  /** Public preview for the enroll form. Does not redeem. */
  async resolvePublic(code: string) {
    const row = await this.invites.findOne({
      where: { code: code.trim().toLowerCase() },
    });
    if (!row || !row.active) {
      throw new NotFoundException('Invite not found');
    }
    this.assertUsable(row);
    return {
      code: row.code,
      label: row.label ?? null,
      offerType: row.offerType,
      discountPercent: row.discountPercent ?? null,
      discountAmount: row.discountAmount ?? null,
      trackScope: row.trackScope,
      trackSlugs: row.trackSlugs ?? [],
      expiresAt: row.expiresAt?.toISOString?.() ?? row.expiresAt ?? null,
      lockToPerson: row.lockToPerson && Boolean(row.personId),
      discountLabel: this.offerLabel(row),
    };
  }

  /**
   * Validate + apply invite to a course quote.
   * Pass `manager` when nesting inside a larger transaction (enroll + redeem).
   * Increments redemption count when `commit` is true.
   */
  async redeemForEnroll(opts: {
    code: string;
    email: string;
    quote: { amount: number; currency: string; lines: QuoteLine[] };
    commit: boolean;
    manager?: EntityManager;
  }): Promise<RedeemedInvite> {
    const run = async (manager: EntityManager) => {
      const repo = manager.getRepository(EnterFirstInviteEntity);
      const row = await repo
        .createQueryBuilder('invite')
        .setLock('pessimistic_write')
        .where('invite.code = :code', {
          code: opts.code.trim().toLowerCase(),
        })
        .andWhere('invite.deleted_at IS NULL')
        .getOne();
      if (!row || !row.active) {
        throw new BadRequestException('Invite is not valid');
      }
      this.assertUsable(row);

      if (row.personId && row.lockToPerson) {
        const person = await manager
          .getRepository(EnterFirstPersonEntity)
          .findOne({ where: { id: row.personId } });
        if (
          !person ||
          person.email.trim().toLowerCase() !== opts.email.trim().toLowerCase()
        ) {
          throw new BadRequestException(
            'This invite is locked to a different email address',
          );
        }
      }

      const priced = applyInviteToQuote(opts.quote, row);
      if (opts.commit) {
        row.redemptionCount = (row.redemptionCount ?? 0) + 1;
        await repo.save(row);
      }
      return {
        invite: row,
        ...priced,
      };
    };

    if (opts.manager) return run(opts.manager);
    return this.dataSource.transaction(run);
  }

  private validateOffer(dto: CreateInviteDto) {
    if (dto.offerType === 'discount_percent') {
      if (dto.discountPercent == null || dto.discountPercent < 1) {
        throw new BadRequestException('discountPercent is required (1–100)');
      }
    }
    if (dto.offerType === 'discount_fixed') {
      if (dto.discountAmount == null || dto.discountAmount < 1) {
        throw new BadRequestException('discountAmount is required');
      }
    }
  }

  private assertUsable(row: EnterFirstInviteEntity) {
    if (row.expiresAt && row.expiresAt.getTime() < Date.now()) {
      throw new BadRequestException('Invite has expired');
    }
    if (
      row.maxRedemptions != null &&
      row.redemptionCount >= row.maxRedemptions
    ) {
      throw new BadRequestException('Invite has no redemptions left');
    }
  }

  private async nextUniqueCode() {
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const code = randomBytes(5).toString('hex').slice(0, 8);
      const existing = await this.invites.findOne({
        where: { code },
        withDeleted: true,
      });
      if (!existing) return code;
    }
    throw new BadRequestException('Could not allocate invite code');
  }

  private websiteOrigin() {
    const dedicated = this.config.get('website.url', { infer: true });
    if (dedicated) return dedicated.replace(/\/$/, '');
    const origins = this.config.get('frontend.allowedOrigins', { infer: true });
    return (origins[0] ?? 'http://localhost:3000').replace(/\/$/, '');
  }

  private offerLabel(row: EnterFirstInviteEntity) {
    if (row.offerType === 'free') {
      return row.trackScope === 'all'
        ? 'All tracks free'
        : 'Selected tracks free';
    }
    if (row.offerType === 'discount_percent') {
      return `${row.discountPercent ?? 0}% off`;
    }
    return `₦${(row.discountAmount ?? 0).toLocaleString('en-NG')} off`;
  }

  private async findOrThrow(id: string) {
    const row = await this.invites.findOne({ where: { id } });
    if (!row) throw new NotFoundException('Invite not found');
    return row;
  }

  private toDto(
    row: EnterFirstInviteEntity,
    person?: EnterFirstPersonEntity | null,
    maskPii = false,
  ) {
    const origin = this.websiteOrigin();
    return {
      id: row.id,
      code: row.code,
      label: row.label ?? null,
      personId: row.personId ?? null,
      person: person
        ? {
            id: person.id,
            firstName: maskPii ? maskName(person.firstName) : person.firstName,
            lastName: maskPii ? maskName(person.lastName) : person.lastName,
            email: maskPii ? maskEmail(person.email) : person.email,
          }
        : null,
      lockToPerson: row.lockToPerson,
      offerType: row.offerType,
      discountPercent: row.discountPercent ?? null,
      discountAmount: row.discountAmount ?? null,
      trackScope: row.trackScope,
      trackSlugs: row.trackSlugs ?? [],
      maxRedemptions: row.maxRedemptions ?? null,
      redemptionCount: row.redemptionCount ?? 0,
      expiresAt: row.expiresAt?.toISOString?.() ?? row.expiresAt ?? null,
      active: row.active,
      notes: row.notes ?? null,
      discountLabel: this.offerLabel(row),
      enrollUrl: `${origin}/core-3/enroll?invite=${encodeURIComponent(row.code)}`,
      createdAt: row.createdAt?.toISOString?.() ?? row.createdAt,
      updatedAt: row.updatedAt?.toISOString?.() ?? row.updatedAt,
    };
  }
}
