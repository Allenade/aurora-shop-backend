import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ILike, Repository } from 'typeorm';
import { AuditLogType } from '@app/shared';
import { AuditLogService } from '../audit-log/audit-log.service';
import type { CreatePersonDto, UpdatePersonDto } from './dto/person.dto';
import { EnterFirstInviteService } from './enter-first-invite.service';
import { EnterFirstPersonEntity } from './entities/enter-first-person.entity';
import { maskEmail, maskName, maskPhone } from './pii';

@Injectable()
export class EnterFirstPeopleService {
  constructor(
    @InjectRepository(EnterFirstPersonEntity)
    private readonly people: Repository<EnterFirstPersonEntity>,
    private readonly invites: EnterFirstInviteService,
    private readonly audit: AuditLogService,
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
          { firstName: ILike(`%${opts.q.trim()}%`) },
          { lastName: ILike(`%${opts.q.trim()}%`) },
          { email: ILike(`%${opts.q.trim()}%`) },
        ]
      : undefined;
    const [items, total] = await this.people.findAndCount({
      where,
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return {
      items: items.map((row) => this.toDto(row, opts.maskPii)),
      total,
      page,
      limit,
      pageCount: Math.max(1, Math.ceil(total / limit)),
    };
  }

  async get(id: string, maskPii = false) {
    const row = await this.findOrThrow(id);
    return this.toDto(row, maskPii);
  }

  async create(dto: CreatePersonDto, userId?: string) {
    const row = await this.people.save(
      this.people.create({
        firstName: dto.firstName.trim(),
        lastName: dto.lastName.trim(),
        email: dto.email.trim().toLowerCase(),
        phone: dto.phone?.trim() || null,
        notes: dto.notes?.trim() || null,
      }),
    );
    this.audit.log({
      type: AuditLogType.MUTATION,
      action: 'ENTER_FIRST_PERSON_CREATED',
      userId,
      resourceType: 'enter_first_person',
      resourceId: row.id,
      metadata: { email: row.email },
    });
    return this.toDto(row);
  }

  async update(id: string, dto: UpdatePersonDto, userId?: string) {
    const row = await this.findOrThrow(id);
    if (dto.firstName !== undefined) row.firstName = dto.firstName.trim();
    if (dto.lastName !== undefined) row.lastName = dto.lastName.trim();
    if (dto.email !== undefined) row.email = dto.email.trim().toLowerCase();
    if (dto.phone !== undefined) row.phone = dto.phone?.trim() || null;
    if (dto.notes !== undefined) row.notes = dto.notes?.trim() || null;
    await this.people.save(row);
    this.audit.log({
      type: AuditLogType.MUTATION,
      action: 'ENTER_FIRST_PERSON_UPDATED',
      userId,
      resourceType: 'enter_first_person',
      resourceId: row.id,
    });
    return this.toDto(row);
  }

  async remove(id: string, userId?: string) {
    const row = await this.findOrThrow(id);
    await this.invites.removeForPerson(id, userId);
    await this.people.softRemove(row);
    this.audit.log({
      type: AuditLogType.MUTATION,
      action: 'ENTER_FIRST_PERSON_DELETED',
      userId,
      resourceType: 'enter_first_person',
      resourceId: id,
    });
    return { ok: true };
  }

  async findEntity(id: string) {
    return this.findOrThrow(id);
  }

  private async findOrThrow(id: string) {
    const row = await this.people.findOne({ where: { id } });
    if (!row) throw new NotFoundException('Person not found');
    return row;
  }

  private toDto(row: EnterFirstPersonEntity, maskPii = false) {
    return {
      id: row.id,
      firstName: maskPii ? maskName(row.firstName) : row.firstName,
      lastName: maskPii ? maskName(row.lastName) : row.lastName,
      email: maskPii ? maskEmail(row.email) : row.email,
      phone: maskPii ? maskPhone(row.phone) : (row.phone ?? null),
      notes: row.notes ?? null,
      createdAt: row.createdAt?.toISOString?.() ?? row.createdAt,
      updatedAt: row.updatedAt?.toISOString?.() ?? row.updatedAt,
    };
  }
}
