import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { randomInt } from 'crypto';
import { QuoteEntity, type QuoteStatus } from './entities/quote.entity';

const LABEL: Record<QuoteStatus, string> = {
  draft: 'Draft',
  pending: 'Pending',
  under_review: 'Under Review',
  approved: 'Approved',
  rejected: 'Rejected',
};

const STATUS_VALUES: QuoteStatus[] = [
  'draft',
  'pending',
  'under_review',
  'approved',
  'rejected',
];

@Injectable()
export class ProcurementService {
  constructor(
    @InjectRepository(QuoteEntity)
    private readonly quotes: Repository<QuoteEntity>,
  ) {}

  async create(
    userId: string,
    input: Partial<QuoteEntity> & { submit?: boolean },
  ) {
    const { submit, ...fields } = input;
    const year = new Date().getFullYear();
    const saved = await this.quotes.save(
      this.quotes.create({
        ...fields,
        userId,
        reference: `QTE-${year}-${randomInt(1000, 9999)}`,
        title: fields.components || fields.companyName || 'Quote',
        status: submit ? 'pending' : 'draft',
      }),
    );
    return this.toDto(saved);
  }

  async list(
    userId: string,
    isAdmin: boolean,
    query?: {
      q?: string;
      status?: string;
      page?: number;
      limit?: number;
    },
  ) {
    const qb = this.quotes
      .createQueryBuilder('q')
      .orderBy('q.createdAt', 'DESC');

    if (!isAdmin) {
      qb.andWhere('q.userId = :userId', { userId });
    }

    if (query?.q) {
      qb.andWhere(
        `(q.reference ILIKE :q OR q.companyName ILIKE :q OR q.contactPerson ILIKE :q OR q.email ILIKE :q OR q.components ILIKE :q OR COALESCE(q.title, '') ILIKE :q)`,
        { q: `%${query.q}%` },
      );
    }

    const status = this.normalizeStatus(query?.status);
    if (status) {
      qb.andWhere('q.status = :status', { status });
    }

    const awaitingQb = this.quotes
      .createQueryBuilder('q')
      .where('q.status IN (:...awaiting)', {
        awaiting: ['pending', 'under_review'],
      });
    if (!isAdmin) {
      awaitingQb.andWhere('q.userId = :userId', { userId });
    }
    const awaitingReview = await awaitingQb.getCount();

    const paginate =
      query?.page !== undefined || query?.limit !== undefined;
    if (!paginate) {
      const rows = await qb.getMany();
      return rows.map((row) => this.toDto(row));
    }

    const page = Math.max(1, Number(query?.page) || 1);
    const limit = Math.min(50, Math.max(1, Number(query?.limit) || 10));
    const total = await qb.clone().getCount();
    const rows = await qb
      .skip((page - 1) * limit)
      .take(limit)
      .getMany();
    return {
      items: rows.map((row) => this.toDto(row)),
      total,
      page,
      limit,
      pageCount: Math.max(1, Math.ceil(total / limit)),
      awaitingReview,
    };
  }

  async setStatus(id: string, status: QuoteStatus) {
    const row = await this.quotes.findOne({ where: { id } });
    if (!row) throw new NotFoundException('Quote not found');
    row.status = status;
    await this.quotes.save(row);
    return this.toDto(row);
  }

  private normalizeStatus(value?: string): QuoteStatus | undefined {
    if (!value) return undefined;
    const raw = value.trim().toLowerCase().replace(/\s+/g, '_');
    if (STATUS_VALUES.includes(raw as QuoteStatus)) {
      return raw as QuoteStatus;
    }
    return undefined;
  }

  private toDto(row: QuoteEntity) {
    return {
      id: row.reference,
      internalId: row.id,
      title: row.title,
      status: LABEL[row.status],
      amount: row.budget
        ? row.budget.startsWith('₦')
          ? row.budget
          : `₦${row.budget}`
        : '—',
      date: row.createdAt.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      }),
      companyName: row.companyName,
      contactPerson: row.contactPerson,
      email: row.email,
      phone: row.phone,
      components: row.components,
      quantity: row.quantity,
      budget: row.budget,
      deliveryDate: row.deliveryDate,
      specs: row.specs,
    };
  }
}
