import { readFileSync } from 'fs';
import { join } from 'path';
import {
  enrollmentClearDecision,
  enrollmentDeleteDecision,
} from './enrollment-removal';

const actor = '11111111-1111-4111-8111-111111111111';

describe('enrollment payment removal', () => {
  it('refuses a caller who is not a super admin', () => {
    expect(
      enrollmentDeleteDecision({
        actorId: actor,
        actorIsSuperAdmin: false,
        targetExists: true,
      }),
    ).toEqual({ ok: false, status: 403, message: 'Super admin only' });
    expect(
      enrollmentDeleteDecision({
        actorIsSuperAdmin: true,
        targetExists: true,
      }),
    ).toEqual({ ok: false, status: 403, message: 'Super admin only' });
  });

  it('returns not found when the enrollment is missing', () => {
    expect(
      enrollmentDeleteDecision({
        actorId: actor,
        actorIsSuperAdmin: true,
        targetExists: false,
      }),
    ).toEqual({ ok: false, status: 404, message: 'Enrollment not found' });
  });

  it('allows a super admin to delete an existing enrollment', () => {
    expect(
      enrollmentDeleteDecision({
        actorId: actor,
        actorIsSuperAdmin: true,
        targetExists: true,
      }),
    ).toEqual({ ok: true });
  });

  it('soft-deletes the enrollment and its refund requests without calling Paystack', () => {
    const source = readFileSync(
      join(__dirname, 'enter-first.service.ts'),
      'utf8',
    );
    const remove = source.slice(
      source.indexOf('async remove('),
      source.indexOf('async clearAll('),
    );
    const refundAt = remove.indexOf('RefundRequestEntity');
    const enrollmentAt = remove.indexOf(
      'softDelete(EnterFirstEnrollmentEntity',
    );
    expect(refundAt).toBeGreaterThan(-1);
    expect(enrollmentAt).toBeGreaterThan(refundAt);
    expect(remove).toContain('enrollmentDeleteDecision');
    expect(remove).toContain('Enrollment not found');
    expect(remove).toContain('ENROLLMENT_DELETED');
    const rules = readFileSync(
      join(__dirname, 'enrollment-removal.ts'),
      'utf8',
    );
    expect(rules).toContain('Super admin only');
    expect(rules).toContain('refund_request');
    expect(remove).toContain('softDelete(RefundRequestEntity');
    expect(remove).not.toContain('this.paystack');
    expect(remove).not.toContain('this.mail');
    expect(remove).not.toContain('.delete(');
    expect(source).not.toMatch(/seed/i);
  });

  it('refuses clear-all for anyone who is not a super admin', () => {
    expect(
      enrollmentClearDecision({
        actorId: actor,
        actorIsSuperAdmin: false,
      }),
    ).toEqual({ ok: false, status: 403, message: 'Super admin only' });
    expect(enrollmentClearDecision({ actorIsSuperAdmin: true })).toEqual({
      ok: false,
      status: 403,
      message: 'Super admin only',
    });
    expect(
      enrollmentClearDecision({ actorId: actor, actorIsSuperAdmin: true }),
    ).toEqual({ ok: true });
  });

  it('soft-deletes every payments-list enrollment and its refund requests', () => {
    const source = readFileSync(
      join(__dirname, 'enter-first.service.ts'),
      'utf8',
    );
    const clear = source.slice(
      source.indexOf('async clearAll('),
      source.indexOf('async anonymise('),
    );
    const refundAt = clear.indexOf('RefundRequestEntity');
    const enrollmentAt = clear.indexOf('softDelete(EnterFirstEnrollmentEntity');
    expect(refundAt).toBeGreaterThan(-1);
    expect(enrollmentAt).toBeGreaterThan(refundAt);
    expect(clear).toContain('enrollmentClearDecision');
    expect(clear).toContain('this.enrollments.find(');
    expect(clear).toContain('ENROLLMENTS_CLEARED');
    expect(clear).toContain('softDelete(RefundRequestEntity');
    expect(clear).not.toContain('this.paystack');
    expect(clear).not.toContain('this.mail');
    expect(clear).not.toContain('.delete(');
    expect(clear).not.toMatch(/seed/i);
  });

  it('keeps a soft-deleted row out of the payments list, export, and overview', () => {
    const service = readFileSync(
      join(__dirname, 'enter-first.service.ts'),
      'utf8',
    );
    const list = service.slice(
      service.indexOf('async list('),
      service.indexOf('async exportCsv('),
    );
    const exported = service.slice(
      service.indexOf('async exportCsv('),
      service.indexOf('async getById('),
    );
    expect(list).toContain("createQueryBuilder('e')");
    expect(list).not.toContain('withDeleted');
    expect(exported).toContain("createQueryBuilder('e')");
    expect(exported).not.toContain('withDeleted');

    const summarySource = readFileSync(
      join(__dirname, '../compliance/compliance.service.ts'),
      'utf8',
    );
    const summary = summarySource.slice(
      summarySource.indexOf('async summary('),
      summarySource.indexOf('async timeline('),
    );
    const timeline = summarySource.slice(
      summarySource.indexOf('async timeline('),
      summarySource.indexOf('async exceptions('),
    );
    expect(summary).toContain("createQueryBuilder('e')");
    expect(summary).not.toContain('withDeleted');
    expect(timeline).toContain('deleted_at IS NULL');
  });
});
