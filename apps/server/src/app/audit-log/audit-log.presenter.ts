export type AuditActorUser = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
};

export type AuditListSource = {
  id: string;
  type: string;
  action: string;
  userId?: string | null;
  resourceType?: string | null;
  resourceId?: string | null;
  decision?: string | null;
  reason?: string | null;
  metadata?: Record<string, unknown> | null;
  ip?: string | null;
  userAgent?: string | null;
  requestId?: string | null;
  createdAt?: Date | string | null;
};

export function toAuditListItem(
  row: AuditListSource,
  actorUser?: AuditActorUser | null,
) {
  const createdAt =
    row.createdAt instanceof Date
      ? row.createdAt.toISOString()
      : (row.createdAt ?? null);
  const actor = row.userId
    ? {
        id: row.userId,
        email: actorUser?.email ?? null,
        name: actorUser
          ? `${actorUser.firstName} ${actorUser.lastName}`.trim()
          : null,
      }
    : null;
  return {
    id: row.id,
    type: row.type,
    action: row.action,
    actor,
    userId: row.userId ?? null,
    resourceType: row.resourceType ?? null,
    resourceId: row.resourceId ?? null,
    decision: row.decision ?? null,
    reason: row.reason ?? null,
    metadata: row.metadata ?? null,
    ip: row.ip ?? null,
    userAgent: row.userAgent ?? null,
    requestId: row.requestId ?? null,
    timestamp: createdAt,
    createdAt,
  };
}
