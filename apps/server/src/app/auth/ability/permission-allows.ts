import { Action, Resource } from '@app/shared/permission/permission.enum';

export function permissionAllows(
  permissions: Array<{ action: string; resource: string }>,
  action: Action | string,
  resource: Resource | string,
) {
  const act = action;
  const res = resource;
  return permissions.some(
    (permission) =>
      (permission.action === (Action.MANAGE as string) &&
        (permission.resource === (Resource.ALL as string) ||
          permission.resource === res)) ||
      (permission.action === act && permission.resource === res),
  );
}
