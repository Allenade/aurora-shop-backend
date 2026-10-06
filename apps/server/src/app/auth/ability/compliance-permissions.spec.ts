import { Action, Resource } from '@app/shared/permission/permission.enum';
import {
  ADMIN_GRANTS,
  COMPLIANCE_MANAGER_GRANTS,
  COMPLIANCE_VIEWER_GRANTS,
} from '../grants';
import { permissionAllows } from './permission-allows';

function allows(
  grants: Array<{ action: Action; resource: Resource }>,
  action: Action,
  resource: Resource,
) {
  return permissionAllows(grants, action, resource);
}

describe('compliance roles', () => {
  it('lets a compliance viewer read but not change or send', () => {
    const grants = COMPLIANCE_VIEWER_GRANTS;
    expect(allows(grants, Action.READ, Resource.ENTER_FIRST)).toBe(true);
    expect(allows(grants, Action.LIST, Resource.COMPLIANCE)).toBe(true);
    expect(allows(grants, Action.UPDATE, Resource.ENTER_FIRST)).toBe(false);
    expect(allows(grants, Action.CREATE, Resource.EMAIL)).toBe(false);
    expect(allows(grants, Action.CREATE, Resource.REFUND)).toBe(false);
    expect(allows(grants, Action.UPDATE, Resource.COURSE)).toBe(false);
    expect(allows(grants, Action.MANAGE, Resource.SETTINGS)).toBe(false);
  });

  it('lets a compliance manager re-verify, refund, and email without editing courses', () => {
    const grants = COMPLIANCE_MANAGER_GRANTS;
    expect(allows(grants, Action.UPDATE, Resource.ENTER_FIRST)).toBe(true);
    expect(allows(grants, Action.CREATE, Resource.REFUND)).toBe(true);
    expect(allows(grants, Action.UPDATE, Resource.REFUND)).toBe(true);
    expect(allows(grants, Action.CREATE, Resource.EMAIL)).toBe(true);
    expect(allows(grants, Action.UPDATE, Resource.EMAIL)).toBe(true);
    expect(allows(grants, Action.DELETE, Resource.EMAIL)).toBe(false);
    expect(allows(grants, Action.CREATE, Resource.COMPLIANCE)).toBe(true);
    expect(allows(grants, Action.UPDATE, Resource.COURSE)).toBe(false);
    expect(allows(grants, Action.MANAGE, Resource.SETTINGS)).toBe(false);
    expect(allows(grants, Action.DELETE, Resource.ENTER_FIRST)).toBe(false);
    expect(allows(grants, Action.MANAGE, Resource.ALL)).toBe(false);
  });

  it('lets a super admin manage courses, settings, and users', () => {
    const grants = ADMIN_GRANTS;
    expect(allows(grants, Action.DELETE, Resource.COURSE)).toBe(true);
    expect(allows(grants, Action.DELETE, Resource.ENTER_FIRST)).toBe(true);
    expect(allows(grants, Action.MANAGE, Resource.SETTINGS)).toBe(true);
    expect(allows(grants, Action.UPDATE, Resource.USER)).toBe(true);
    expect(allows(grants, Action.CREATE, Resource.EMAIL)).toBe(true);
  });
});
