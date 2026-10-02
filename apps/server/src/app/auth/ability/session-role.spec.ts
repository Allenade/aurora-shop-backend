import { UserType } from '@app/shared/user/user.enums';
import { buildSessionUser } from './session-user';

describe('session role slug', () => {
  it('returns the role slug next to the display name', () => {
    const session = buildSessionUser({
      id: 'user-1',
      email: 'viewer@aurora.local',
      firstName: 'Viewer',
      lastName: 'Account',
      type: UserType.ADMIN,
      avatarUrl: null,
      roleAssignments: [
        {
          role: {
            id: 'role-1',
            name: 'Compliance Viewer',
            slug: 'compliance_viewer',
            permissions: [{ action: 'read', resource: 'compliance' }],
          },
        },
      ],
    });

    expect(session.roles).toEqual([
      {
        id: 'role-1',
        name: 'Compliance Viewer',
        slug: 'compliance_viewer',
      },
    ]);
    expect(session.rules).toEqual([{ action: 'read', subject: 'compliance' }]);
  });
});
