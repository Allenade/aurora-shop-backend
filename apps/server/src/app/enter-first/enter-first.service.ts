import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import type { EnvTypes } from '@app/shared';
import { randomInt } from 'crypto';
import { ILike, Repository } from 'typeorm';
import { MailService } from '../mail/mail.service';
import { PaystackProvider } from '../payment-gateway/paystack/paystack.provider';
import {
  TransactionStatus,
  type CallbackOutcome,
} from '../payment-gateway/_contract/payment.types';
import type { EnterFirstEnrollDto } from './dto/enroll.dto';
import {
  EnterFirstEnrollmentEntity,
  type EnterFirstFormPayload,
  type EnterFirstPaymentStatus,
} from './entities/enter-first-enrollment.entity';
import { priceTracks } from './enter-first.pricing';

@Injectable()
export class EnterFirstService {
  private readonly logger = new Logger(EnterFirstService.name);

  constructor(
    @InjectRepository(EnterFirstEnrollmentEntity)
    private readonly enrollments: Repository<EnterFirstEnrollmentEntity>,
    private readonly paystack: PaystackProvider,
    private readonly mail: MailService,
    private readonly config: ConfigService<EnvTypes, true>,
  ) {}

  async enroll(dto: EnterFirstEnrollDto) {
    const tracks = [
      ...new Set(dto.tracks.map((t) => t.trim()).filter(Boolean)),
    ];
    if (!tracks.length) {
      throw new BadRequestException('Select at least one track');
    }

    const priced = priceTracks(tracks);
    if (priced.unknown.length) {
      throw new BadRequestException(
        `Unknown track(s): ${priced.unknown.join(', ')}`,
      );
    }

    const form: EnterFirstFormPayload = {
      firstName: dto.firstName.trim(),
      lastName: dto.lastName.trim(),
      middleName: dto.middleName?.trim(),
      gender: dto.gender?.trim(),
      nationality: dto.nationality?.trim(),
      stateOfResidence: dto.stateOfResidence?.trim(),
      email: dto.email.trim().toLowerCase(),
      phone: dto.phone.trim(),
      whatsapp: dto.whatsapp?.trim() || dto.phone.trim(),
      currentStatus: dto.currentStatus?.trim(),
      institution: dto.institution?.trim(),
      experienceLevel: dto.experienceLevel?.trim(),
      howDidYouHear: dto.howDidYouHear?.trim(),
      joinedCommunity: dto.joinedCommunity?.trim(),
    };

    const reference = this.nextReference();
    const row = await this.enrollments.save(
      this.enrollments.create({
        source: 'enter_first',
        firstName: form.firstName,
        lastName: form.lastName,
        email: form.email,
        phone: form.phone,
        tracks,
        amount: priced.amount,
        currency: priced.currency,
        paymentStatus: 'pending',
        paystackReference: reference,
        form,
      }),
    );

    // Free tracks only — no Paystack charge.
    if (priced.amount <= 0) {
      row.paymentStatus = 'success';
      row.paidAt = new Date();
      await this.enrollments.save(row);
      await this.sendConfirmationIfNeeded(row);
      return {
        enrollment: this.toDto(row),
        payment: {
          provider: 'paystack' as const,
          reference,
          authorizationUrl: null,
          publicKey: this.config.get('paystack.publicKey', { infer: true }),
          amount: 0,
          currency: priced.currency,
          free: true,
        },
      };
    }

    const website = this.websiteOrigin();
    const registered = await this.paystack.register({
      amount: priced.amount,
      reference,
      email: form.email,
      firstName: form.firstName,
      lastName: form.lastName,
      phone: form.phone,
      callbackUrl: `${website}/core-3/enroll?pay=${encodeURIComponent(reference)}`,
      metadata: {
        product: 'enter_first',
        enrollmentId: row.id,
        tracks,
      },
    });

    row.paystackReference = registered.externalReference ?? reference;
    row.authorizationUrl =
      registered.authorizationUrl ?? registered.redirectUrl;
    await this.enrollments.save(row);

    return {
      enrollment: this.toDto(row),
      payment: {
        provider: 'paystack' as const,
        reference: row.paystackReference,
        authorizationUrl: row.authorizationUrl ?? null,
        publicKey: registered.publicKey,
        amount: priced.amount,
        currency: priced.currency,
        free: false,
      },
    };
  }

  /**
   * Called from the shared Paystack webhook when no shop transaction matches.
   */
  async handleProviderCallback(outcome: CallbackOutcome) {
    const reference = outcome.externalReference?.trim();
    if (!reference) return { handled: false };

    const row = await this.enrollments.findOne({
      where: { paystackReference: reference },
    });
    if (!row) return { handled: false };

    if (row.paymentStatus === 'success') {
      return { handled: true, alreadyPaid: true };
    }

    if (outcome.status === TransactionStatus.PENDING) {
      return { handled: true, pending: true };
    }

    row.paymentStatus =
      outcome.status === TransactionStatus.SUCCESS ? 'success' : 'failed';
    if (row.paymentStatus === 'success') {
      row.paidAt = new Date();
    }
    await this.enrollments.save(row);

    if (row.paymentStatus === 'success') {
      await this.sendConfirmationIfNeeded(row);
    }

    return { handled: true, enrollmentId: row.id, status: row.paymentStatus };
  }

  async statusByReference(reference: string) {
    const row = await this.enrollments.findOne({
      where: { paystackReference: reference },
    });
    if (!row) throw new NotFoundException('Enrollment not found');

    if (row.paymentStatus === 'pending' && row.amount > 0) {
      const outcome = await this.paystack.verifyReference(
        row.paystackReference ?? reference,
      );
      if (outcome.status !== TransactionStatus.PENDING) {
        await this.handleProviderCallback(outcome);
        const fresh = await this.enrollments.findOne({
          where: { id: row.id },
        });
        if (fresh) return this.toStatusDto(fresh);
      }
    }

    return this.toStatusDto(row);
  }

  async list(opts: {
    q?: string;
    paymentStatus?: string;
    page?: number;
    limit?: number;
  }) {
    const page = Math.max(1, opts.page ?? 1);
    const limit = Math.min(100, Math.max(1, opts.limit ?? 10));
    const where: Record<string, unknown>[] = [];

    const statusFilter = opts.paymentStatus
      ?.split(',')
      .map((s) => s.trim())
      .filter(Boolean) as EnterFirstPaymentStatus[] | undefined;

    if (opts.q?.trim()) {
      const q = `%${opts.q.trim()}%`;
      const base = statusFilter?.length
        ? statusFilter.map((paymentStatus) => ({ paymentStatus }))
        : [{}];
      for (const statusWhere of base) {
        where.push(
          { ...statusWhere, firstName: ILike(q) },
          { ...statusWhere, lastName: ILike(q) },
          { ...statusWhere, email: ILike(q) },
          { ...statusWhere, paystackReference: ILike(q) },
        );
      }
    } else if (statusFilter?.length) {
      for (const paymentStatus of statusFilter) {
        where.push({ paymentStatus });
      }
    }

    const [items, total] = await this.enrollments.findAndCount({
      where: where.length ? where : undefined,
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    return {
      items: items.map((row) => this.toDto(row)),
      total,
      page,
      limit,
      pageCount: Math.max(1, Math.ceil(total / limit)),
    };
  }

  async getById(id: string) {
    const row = await this.enrollments.findOne({ where: { id } });
    if (!row) throw new NotFoundException('Enrollment not found');
    return this.toDto(row);
  }

  private async sendConfirmationIfNeeded(row: EnterFirstEnrollmentEntity) {
    if (row.emailSentAt) return;
    try {
      await this.mail.sendEnterFirstConfirmation({
        email: row.email,
        firstName: row.firstName,
        lastName: row.lastName,
        tracks: row.tracks,
        amount: row.amount,
        currency: row.currency,
        reference: row.paystackReference ?? row.id,
      });
      row.emailSentAt = new Date();
      await this.enrollments.save(row);
    } catch (error) {
      this.logger.error(
        `Enter First confirmation email failed for ${row.email}`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  private nextReference() {
    return `EF-${Date.now()}-${randomInt(100, 999)}`;
  }

  private websiteOrigin() {
    const dedicated = this.config.get('website.url', { infer: true });
    if (dedicated) return dedicated.replace(/\/$/, '');
    const origins = this.config.get('frontend.allowedOrigins', { infer: true });
    return (origins[0] ?? 'http://localhost:3000').replace(/\/$/, '');
  }

  private toStatusDto(row: EnterFirstEnrollmentEntity) {
    return {
      reference: row.paystackReference ?? null,
      status: row.paymentStatus,
      paid: row.paymentStatus === 'success',
      amount: row.amount,
      currency: row.currency,
      tracks: row.tracks,
      enrollmentId: row.id,
    };
  }

  private toDto(row: EnterFirstEnrollmentEntity) {
    return {
      id: row.id,
      source: row.source,
      firstName: row.firstName,
      lastName: row.lastName,
      email: row.email,
      phone: row.phone ?? null,
      tracks: row.tracks,
      amount: row.amount,
      currency: row.currency,
      paymentStatus: row.paymentStatus,
      paystackReference: row.paystackReference ?? null,
      authorizationUrl: row.authorizationUrl ?? null,
      paidAt: row.paidAt?.toISOString() ?? null,
      form: row.form,
      emailSentAt: row.emailSentAt?.toISOString() ?? null,
      createdAt: row.createdAt?.toISOString?.() ?? row.createdAt,
      updatedAt: row.updatedAt?.toISOString?.() ?? row.updatedAt,
    };
  }
}
