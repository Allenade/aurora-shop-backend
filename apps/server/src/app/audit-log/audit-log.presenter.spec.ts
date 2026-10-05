import { AuditLogType } from '@app/shared/audit-log/audit-log.types';
import { toAuditListItem } from './audit-log.presenter';

describe('audit log list item', () => {
  it('returns actor, action, timestamp, ip, user agent, and request id', () => {
    const createdAt = new Date('2026-10-05T12:00:00.000Z');
    const item = toAuditListItem(
      {
        id: 'log-1',
        type: AuditLogType.ACCESS,
        action: 'ADMIN_VIEW',
        userId: 'user-1',
        resourceType: 'enrollment',
        resourceId: 'enr-1',
        decision: 'allow',
        reason: null,
        metadata: { path: '/admin/enter-first/enrollments' },
        ip: '203.0.113.10',
        userAgent: 'dashboard',
        requestId: 'req-1',
        createdAt,
      },
      {
        id: 'user-1',
        email: 'allen@example.com',
        firstName: 'Allen',
        lastName: 'Ade',
      },
    );

    expect(item).toMatchObject({
      action: 'ADMIN_VIEW',
      actor: { id: 'user-1', email: 'allen@example.com', name: 'Allen Ade' },
      timestamp: '2026-10-05T12:00:00.000Z',
      createdAt: '2026-10-05T12:00:00.000Z',
      ip: '203.0.113.10',
      userAgent: 'dashboard',
      requestId: 'req-1',
    });
  });

  it('keeps a user id when the actor record is gone', () => {
    const item = toAuditListItem({
      id: 'log-2',
      type: AuditLogType.MUTATION,
      action: 'LOGIN',
      userId: 'user-2',
      createdAt: new Date('2026-10-05T12:00:00.000Z'),
    });
    expect(item.actor).toEqual({
      id: 'user-2',
      email: null,
      name: null,
    });
    expect(item.ip).toBeNull();
    expect(item.userAgent).toBeNull();
    expect(item.requestId).toBeNull();
  });
});
