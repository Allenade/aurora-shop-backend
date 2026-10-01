import { Action, Resource } from '@app/shared/permission/permission.enum';

export const PROCUREMENT_GRANTS: Array<{ action: Action; resource: Resource }> =
  [
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

export const ADMIN_GRANTS: Array<{ action: Action; resource: Resource }> = [
  { action: Action.MANAGE, resource: Resource.ALL },
];

const COMPLIANCE_READ: Array<{ action: Action; resource: Resource }> = [
  { action: Action.READ, resource: Resource.DASHBOARD },
  { action: Action.READ, resource: Resource.ENTER_FIRST },
  { action: Action.LIST, resource: Resource.ENTER_FIRST },
  { action: Action.READ, resource: Resource.COURSE },
  { action: Action.LIST, resource: Resource.COURSE },
  { action: Action.READ, resource: Resource.EMAIL },
  { action: Action.LIST, resource: Resource.EMAIL },
  { action: Action.READ, resource: Resource.REFUND },
  { action: Action.LIST, resource: Resource.REFUND },
  { action: Action.READ, resource: Resource.AUDIT },
  { action: Action.LIST, resource: Resource.AUDIT },
  { action: Action.READ, resource: Resource.COMPLIANCE },
  { action: Action.LIST, resource: Resource.COMPLIANCE },
  { action: Action.READ, resource: Resource.SETTINGS },
];

/** Read-only compliance dashboard. PII is masked because UPDATE enter_first is absent. */
export const COMPLIANCE_VIEWER_GRANTS = COMPLIANCE_READ;

/** Re-verify, refunds, data requests, and email sends. Cannot change courses or org settings. */
export const COMPLIANCE_MANAGER_GRANTS: Array<{
  action: Action;
  resource: Resource;
}> = [
  ...COMPLIANCE_READ,
  { action: Action.UPDATE, resource: Resource.ENTER_FIRST },
  { action: Action.CREATE, resource: Resource.EMAIL },
  { action: Action.UPDATE, resource: Resource.EMAIL },
  { action: Action.CREATE, resource: Resource.REFUND },
  { action: Action.UPDATE, resource: Resource.REFUND },
  { action: Action.CREATE, resource: Resource.COMPLIANCE },
  { action: Action.UPDATE, resource: Resource.COMPLIANCE },
];
