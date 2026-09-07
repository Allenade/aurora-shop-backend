import { Injectable, NotFoundException } from '@nestjs/common';
import { UserStatus } from '@app/shared';
import { UserRepository } from './repositories/user.repository';

@Injectable()
export class UserService {
  constructor(private readonly users: UserRepository) {}

  async list() {
    const rows = await this.users.find({
      order: { createdAt: 'DESC' },
      relations: { roleAssignments: { role: true } },
    });
    return rows.map((user) => {
      const name = `${user.firstName} ${user.lastName}`.trim();
      return {
        id: user.id,
        name,
        email: user.email,
        company: user.companyName ?? '—',
        type: user.type,
        status: user.status === UserStatus.ACTIVE ? 'ACTIVE' : 'Suspended',
        initials:
          `${user.firstName?.[0] ?? ''}${user.lastName?.[0] ?? ''}`.toUpperCase() ||
          'U',
        orders: 0,
        totalSpent: '—',
        joined: user.createdAt.toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
        }),
        joinedIso: user.createdAt.toISOString(),
        verified: user.emailVerified,
      };
    });
  }

  async setStatus(id: string, status: UserStatus) {
    const user = await this.users.findById(id);
    if (!user) throw new NotFoundException('User not found');
    user.status = status;
    await this.users.save(user);
    return { ok: true, id, status };
  }
}
