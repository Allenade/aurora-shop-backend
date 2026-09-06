import { SetMetadata } from '@nestjs/common';
import type { Action, Resource } from '@app/shared';

export const PERMISSIONS_KEY = 'permissions';

export type PermissionRequirement = {
  action: Action;
  resource: Resource;
};

export const RequirePermissions = (...requirements: PermissionRequirement[]) =>
  SetMetadata(PERMISSIONS_KEY, requirements);
