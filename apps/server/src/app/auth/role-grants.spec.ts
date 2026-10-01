import { Action, Resource } from '@app/shared/permission/permission.enum';
import { permissionAllows } from './permission-check';
import {
  COMPLIANCE_MANAGER_GRANTS,
  COMPLIANCE_VIEWER_GRANTS,
  SUPER_ADMIN_GRANTS,
} from './role-grants';

function allows(
  grants: Array<{ action: Action; resource: Resource }>,
  action: Action,
  resource: Resource,
) {
  return permissionAllows(grants, action, resource);
}

describe('compliance role grants', () => {
  it('masks PII and blocks mutations for compliance_viewer', () => {
    const grants = COMPLIANCE_VIEWER_GRANTS;
    expect(allows(grants, Action.READ, Resource.ENTER_FIRST)).toBe(true);
    expect(allows(grants, Action.READ, Resource.PII)).toBe(false);
    expect(allows(grants, Action.UPDATE, Resource.REFUND)).toBe(false);
    expect(allows(grants, Action.CREATE, Resource.EMAIL)).toBe(false);
    expect(allows(grants, Action.UPDATE, Resource.COURSE)).toBe(false);
  });

  it('lets compliance_manager re-verify, refund, and email without pricing access', () => {
    const grants = COMPLIANCE_MANAGER_GRANTS;
    expect(allows(grants, Action.READ, Resource.PII)).toBe(true);
    expect(allows(grants, Action.UPDATE, Resource.ENTER_FIRST)).toBe(true);
    expect(allows(grants, Action.UPDATE, Resource.REFUND)).toBe(true);
    expect(allows(grants, Action.CREATE, Resource.EMAIL)).toBe(true);
    expect(allows(grants, Action.UPDATE, Resource.COMPLIANCE)).toBe(true);
    expect(allows(grants, Action.UPDATE, Resource.COURSE)).toBe(false);
    expect(allows(grants, Action.UPDATE, Resource.SETTINGS)).toBe(false);
    expect(allows(grants, Action.MANAGE, Resource.USER)).toBe(false);
  });

  it('lets super_admin manage courses, settings, and users', () => {
    const grants = SUPER_ADMIN_GRANTS;
    expect(allows(grants, Action.DELETE, Resource.COURSE)).toBe(true);
    expect(allows(grants, Action.UPDATE, Resource.SETTINGS)).toBe(true);
    expect(allows(grants, Action.MANAGE, Resource.USER)).toBe(true);
    expect(allows(grants, Action.READ, Resource.PII)).toBe(true);
    expect(allows(grants, Action.MANAGE, Resource.PRODUCT)).toBe(true);
  });
});
