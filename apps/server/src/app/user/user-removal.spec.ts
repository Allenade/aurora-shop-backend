import { readFileSync } from 'fs';
import { join } from 'path';
import { userDeleteDecision } from './user-removal';

const actor = '11111111-1111-4111-8111-111111111111';
const other = '22222222-2222-4222-8222-222222222222';

describe('user removal rules', () => {
  it('refuses a caller who is not a super admin', () => {
    expect(
      userDeleteDecision({
        actorId: actor,
        actorIsSuperAdmin: false,
        targetExists: true,
        targetId: other,
        targetIsSuperAdmin: false,
        superAdminCount: 2,
      }),
    ).toEqual({ ok: false, status: 403, message: 'Super admin only' });
  });

  it('refuses deleting the signed-in account', () => {
    expect(
      userDeleteDecision({
        actorId: actor,
        actorIsSuperAdmin: true,
        targetExists: true,
        targetId: actor,
        targetIsSuperAdmin: true,
        superAdminCount: 2,
      }),
    ).toEqual({
      ok: false,
      status: 403,
      message: 'You cannot delete your own account',
    });
  });

  it('returns not found when the user is missing', () => {
    expect(
      userDeleteDecision({
        actorId: actor,
        actorIsSuperAdmin: true,
        targetExists: false,
        targetId: other,
        targetIsSuperAdmin: false,
        superAdminCount: 1,
      }),
    ).toEqual({ ok: false, status: 404, message: 'User not found' });
  });

  it('refuses deleting the last super admin and allows another user', () => {
    expect(
      userDeleteDecision({
        actorId: actor,
        actorIsSuperAdmin: true,
        targetExists: true,
        targetId: other,
        targetIsSuperAdmin: true,
        superAdminCount: 1,
      }),
    ).toEqual({
      ok: false,
      status: 403,
      message: 'Cannot delete the last super admin',
    });
    expect(
      userDeleteDecision({
        actorId: actor,
        actorIsSuperAdmin: true,
        targetExists: true,
        targetId: other,
        targetIsSuperAdmin: false,
        superAdminCount: 1,
      }),
    ).toEqual({ ok: true });
    expect(
      userDeleteDecision({
        actorId: actor,
        actorIsSuperAdmin: true,
        targetExists: true,
        targetId: other,
        targetIsSuperAdmin: true,
        superAdminCount: 2,
      }),
    ).toEqual({ ok: true });
  });

  it('soft-deletes the user after sessions, roles, and cart, and keeps payments', () => {
    const source = readFileSync(join(__dirname, 'user.service.ts'), 'utf8');
    const remove = source.slice(
      source.indexOf('async remove('),
      source.indexOf('private async countSuperAdmins('),
    );
    const revokeAt = remove.indexOf('RefreshTokenEntity');
    const roleAt = remove.indexOf('UserRoleEntity');
    const cartAt = remove.indexOf('CartItemEntity');
    const userAt = remove.indexOf('UserEntity');
    expect(revokeAt).toBeGreaterThan(-1);
    expect(roleAt).toBeGreaterThan(revokeAt);
    expect(cartAt).toBeGreaterThan(roleAt);
    expect(userAt).toBeGreaterThan(cartAt);
    expect(remove).toContain('manager.softDelete(UserEntity, target.id)');
    expect(remove).toContain('userDeleteDecision');
    expect(remove).toContain('Cannot delete the last super admin');
    expect(remove).toContain('User not found');
    const rules = readFileSync(join(__dirname, 'user-removal.ts'), 'utf8');
    expect(rules).toContain('You cannot delete your own account');
    expect(remove).not.toContain('OrderEntity');
    expect(remove).not.toContain('this.orders.delete');
    expect(remove).not.toContain('this.orders.softRemove');
    expect(remove).not.toContain('EnterFirstEnrollmentEntity');
    expect(source).not.toMatch(/seed/i);
  });
});
