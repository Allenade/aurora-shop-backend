import { Action, Resource } from '@app/shared/permission/permission.enum';

export type RoleGrant = { action: Action; resource: Resource };

export const PROCUREMENT_GRANTS: RoleGrant[] = [
  { action: Action.READ, resource: Resource.DASHBOARD },
  { action: Action.READ, resource: Resource.SHOP },
  { action: Action.LIST, resource: Resource.SHOP },
  { action: Action.READ, resource: Resource.ORDER },
  { action: Action.LIST, resource: Resource.ORDER },
  { action: Action.CREATE, resource: Resource.ORDER },
  { action: Action.READ, resource: Resource.TRACK_ORDER },
  { action: Action.READ, resource: Resource.PROCUREMENT },
  { action: Action.LIST, resource: Resource.PROCUREMENT },
  { action: Action.CREATE, resource: Resource.QUOTE },
  { action: Action.UPDATE, resource: Resource.QUOTE },
  { action: Action.READ, resource: Resource.SETTINGS },
  { action: Action.UPDATE, resource: Resource.SETTINGS },
];

/** Shop superuser. `manage` on `all` satisfies every PermissionsGuard check. */
export const ADMIN_GRANTS: RoleGrant[] = [
  { action: Action.MANAGE, resource: Resource.ALL },
];

/** Read-only compliance dashboard. PII stays masked (no `pii` grant). */
export const COMPLIANCE_VIEWER_GRANTS: RoleGrant[] = [
  { action: Action.READ, resource: Resource.DASHBOARD },
  { action: Action.LIST, resource: Resource.ENTER_FIRST },
  { action: Action.READ, resource: Resource.ENTER_FIRST },
  { action: Action.LIST, resource: Resource.COURSE },
  { action: Action.READ, resource: Resource.COURSE },
  { action: Action.LIST, resource: Resource.EMAIL },
  { action: Action.READ, resource: Resource.EMAIL },
  { action: Action.LIST, resource: Resource.REFUND },
  { action: Action.READ, resource: Resource.REFUND },
  { action: Action.LIST, resource: Resource.AUDIT },
  { action: Action.READ, resource: Resource.AUDIT },
  { action: Action.LIST, resource: Resource.COMPLIANCE },
  { action: Action.READ, resource: Resource.COMPLIANCE },
  { action: Action.READ, resource: Resource.SETTINGS },
];

/** Re-verify, refunds, data requests, and email sends. No course prices, settings, or users. */
export const COMPLIANCE_MANAGER_GRANTS: RoleGrant[] = [
  ...COMPLIANCE_VIEWER_GRANTS,
  { action: Action.READ, resource: Resource.PII },
  { action: Action.UPDATE, resource: Resource.ENTER_FIRST },
  { action: Action.CREATE, resource: Resource.EMAIL },
  { action: Action.UPDATE, resource: Resource.EMAIL },
  { action: Action.CREATE, resource: Resource.REFUND },
  { action: Action.UPDATE, resource: Resource.REFUND },
  { action: Action.CREATE, resource: Resource.COMPLIANCE },
  { action: Action.UPDATE, resource: Resource.COMPLIANCE },
];

/**
 * Every compliance action plus shop administration.
 * Granular rows are returned by GET /auth/me so a dashboard can hide buttons
 * without special-casing `manage:all` (which the guard still honours).
 */
export const SUPER_ADMIN_GRANTS: RoleGrant[] = [
  ...ADMIN_GRANTS,
  { action: Action.READ, resource: Resource.PII },
  { action: Action.LIST, resource: Resource.USER },
  { action: Action.READ, resource: Resource.USER },
  { action: Action.UPDATE, resource: Resource.USER },
  { action: Action.MANAGE, resource: Resource.USER },
  { action: Action.LIST, resource: Resource.ENTER_FIRST },
  { action: Action.READ, resource: Resource.ENTER_FIRST },
  { action: Action.UPDATE, resource: Resource.ENTER_FIRST },
  { action: Action.LIST, resource: Resource.COURSE },
  { action: Action.READ, resource: Resource.COURSE },
  { action: Action.CREATE, resource: Resource.COURSE },
  { action: Action.UPDATE, resource: Resource.COURSE },
  { action: Action.DELETE, resource: Resource.COURSE },
  { action: Action.MANAGE, resource: Resource.COURSE },
  { action: Action.LIST, resource: Resource.EMAIL },
  { action: Action.READ, resource: Resource.EMAIL },
  { action: Action.CREATE, resource: Resource.EMAIL },
  { action: Action.UPDATE, resource: Resource.EMAIL },
  { action: Action.DELETE, resource: Resource.EMAIL },
  { action: Action.MANAGE, resource: Resource.EMAIL },
  { action: Action.LIST, resource: Resource.REFUND },
  { action: Action.READ, resource: Resource.REFUND },
  { action: Action.CREATE, resource: Resource.REFUND },
  { action: Action.UPDATE, resource: Resource.REFUND },
  { action: Action.MANAGE, resource: Resource.REFUND },
  { action: Action.LIST, resource: Resource.AUDIT },
  { action: Action.READ, resource: Resource.AUDIT },
  { action: Action.LIST, resource: Resource.COMPLIANCE },
  { action: Action.READ, resource: Resource.COMPLIANCE },
  { action: Action.CREATE, resource: Resource.COMPLIANCE },
  { action: Action.UPDATE, resource: Resource.COMPLIANCE },
  { action: Action.MANAGE, resource: Resource.COMPLIANCE },
  { action: Action.READ, resource: Resource.SETTINGS },
  { action: Action.UPDATE, resource: Resource.SETTINGS },
  { action: Action.MANAGE, resource: Resource.SETTINGS },
];
