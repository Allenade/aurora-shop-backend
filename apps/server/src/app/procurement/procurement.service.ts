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
    const year = new Date().getFullYear();
    const saved = await this.quotes.save(
      this.quotes.create({
        ...input,
        userId,
        reference: `QTE-${year}-${randomInt(1000, 9999)}`,
        title: input.components || input.companyName || 'Quote',
        status: input.submit ? 'pending' : 'draft',
      }),
    );
    return this.toDto(saved);
  }

  async list(userId: string, isAdmin: boolean) {
    const rows = await this.quotes.find({
      where: isAdmin ? {} : { userId },
      order: { createdAt: 'DESC' },
    });
    return rows.map((row) => this.toDto(row));
  }

  async setStatus(id: string, status: QuoteStatus) {
    const row = await this.quotes.findOne({ where: { id } });
    if (!row) throw new NotFoundException('Quote not found');
    row.status = status;
    await this.quotes.save(row);
    return this.toDto(row);
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
