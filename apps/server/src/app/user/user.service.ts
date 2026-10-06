import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { AuditLogType, UserStatus } from '@app/shared';
import { IsNull, Repository } from 'typeorm';
import { AuditLogService } from '../audit-log/audit-log.service';
import { RefreshTokenEntity } from '../auth/entities/refresh-token.entity';
import { CartItemEntity } from '../cart/entities/cart-item.entity';
import { SUPER_ADMIN_ROLE } from '../course/course-removal';
import { OrderEntity } from '../order/entities/order.entity';
import { UserRoleEntity } from '../role/entities/user-role.entity';
import { UserEntity } from './entities/user.entity';
import { UserRepository } from './repositories/user.repository';
import {
  isSuperAdminRole,
  roleSlugs,
  userDeleteDecision,
} from './user-removal';

@Injectable()
export class UserService {
  constructor(
    private readonly users: UserRepository,
    @InjectRepository(UserEntity)
    private readonly userRepo: Repository<UserEntity>,
    @InjectRepository(OrderEntity)
    private readonly orders: Repository<OrderEntity>,
    @InjectRepository(UserRoleEntity)
    private readonly assignments: Repository<UserRoleEntity>,
    private readonly audit: AuditLogService,
  ) {}

  async list(query?: {
    q?: string;
    status?: string;
    page?: number;
    limit?: number;
  }) {
    const qb = this.userRepo
      .createQueryBuilder('user')
      .leftJoinAndSelect('user.roleAssignments', 'assignment')
      .leftJoinAndSelect('assignment.role', 'role')
      .orderBy('user.createdAt', 'DESC');

    if (query?.q) {
      qb.andWhere(
        `(user.email ILIKE :q OR user.firstName ILIKE :q OR user.lastName ILIKE :q OR CONCAT(user.firstName, ' ', user.lastName) ILIKE :q OR COALESCE(user.companyName, '') ILIKE :q)`,
        { q: `%${query.q}%` },
      );
    }

    if (query?.status === 'active') {
      qb.andWhere('user.status = :status', { status: UserStatus.ACTIVE });
    } else if (query?.status === 'suspended') {
      qb.andWhere('user.status = :status', { status: UserStatus.SUSPENDED });
    }

    const paginate = query?.page !== undefined || query?.limit !== undefined;

    const mapRows = async (rows: UserEntity[]) => {
      const ids = rows.map((user) => user.id);
      const stats = new Map<string, { orders: number; spent: number }>();
      if (ids.length > 0) {
        const raw = await this.orders
          .createQueryBuilder('o')
          .select('o.user_id', 'userId')
          .addSelect('COUNT(*)::int', 'orders')
          .addSelect(
            `COALESCE(SUM(CASE WHEN o.payment_status = 'paid' THEN o.total ELSE 0 END), 0)::int`,
            'spent',
          )
          .where('o.user_id IN (:...ids)', { ids })
          .andWhere('o.status != :cancelled', { cancelled: 'cancelled' })
          .groupBy('o.user_id')
          .getRawMany<{ userId: string; orders: string; spent: string }>();
        for (const row of raw) {
          stats.set(row.userId, {
            orders: Number(row.orders) || 0,
            spent: Number(row.spent) || 0,
          });
        }
      }

      return rows.map((user) => {
        const name = `${user.firstName} ${user.lastName}`.trim();
        const metric = stats.get(user.id) ?? { orders: 0, spent: 0 };
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
          orders: metric.orders,
          totalSpent:
            metric.spent > 0 ? `₦${metric.spent.toLocaleString('en-NG')}` : '—',
          joined: user.createdAt.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
          }),
          joinedIso: user.createdAt.toISOString(),
          verified: user.emailVerified,
        };
      });
    };

    if (!paginate) {
      const rows = await qb.getMany();
      return mapRows(rows);
    }

    const page = Math.max(1, Number(query?.page) || 1);
    const limit = Math.min(50, Math.max(1, Number(query?.limit) || 10));
    const total = await qb.clone().getCount();
    const rows = await qb
      .skip((page - 1) * limit)
      .take(limit)
      .getMany();
    const items = await mapRows(rows);
    return {
      items,
      total,
      page,
      limit,
      pageCount: Math.max(1, Math.ceil(total / limit)),
    };
  }

  async setStatus(id: string, status: UserStatus) {
    const user = await this.users.findById(id);
    if (!user) throw new NotFoundException('User not found');
    user.status = status;
    await this.users.save(user);
    return { ok: true, id, status };
  }

  /**
   * Super admin only. Soft-deletes the user. Sessions and role rows are
   * soft-removed and the cart is cleared so a later hard delete cannot
   * fail on those foreign keys. Orders, payments, quotes, audit rows, and
   * course enrollments stay.
   */
  async remove(targetId: string, actorId?: string) {
    const actor = actorId ? await this.users.findByIdWithRoles(actorId) : null;
    const target = await this.userRepo.findOne({
      where: { id: targetId },
      relations: { roleAssignments: { role: true } },
    });
    const superAdminCount = await this.countSuperAdmins();
    const decision = userDeleteDecision({
      actorId,
      actorIsSuperAdmin: isSuperAdminRole(roleSlugs(actor?.roleAssignments)),
      targetExists: Boolean(target),
      targetId,
      targetIsSuperAdmin: isSuperAdminRole(roleSlugs(target?.roleAssignments)),
      superAdminCount,
    });
    if (!decision.ok) {
      if (decision.status === 404)
        throw new NotFoundException(decision.message);
      throw new ForbiddenException(decision.message);
    }
    if (!target) throw new NotFoundException('User not found');

    await this.userRepo.manager.transaction(async (manager) => {
      const still = await this.countSuperAdmins(manager);
      if (isSuperAdminRole(roleSlugs(target.roleAssignments)) && still <= 1) {
        throw new ForbiddenException('Cannot delete the last super admin');
      }
      await manager.update(
        RefreshTokenEntity,
        { userId: target.id, revokedAt: IsNull() },
        { revokedAt: new Date() },
      );
      await manager.softDelete(RefreshTokenEntity, { userId: target.id });
      await manager.softDelete(UserRoleEntity, { userId: target.id });
      await manager.delete(CartItemEntity, { userId: target.id });
      await manager.softDelete(UserEntity, target.id);
    });

    this.audit.log({
      type: AuditLogType.MUTATION,
      action: 'USER_DELETED',
      userId: actorId,
      resourceType: 'user',
      resourceId: target.id,
    });
    return { ok: true, id: target.id };
  }

  private async countSuperAdmins(manager = this.assignments.manager) {
    const raw = await manager
      .createQueryBuilder(UserRoleEntity, 'assignment')
      .innerJoin('assignment.user', 'user')
      .innerJoin('assignment.role', 'role')
      .where('role.slug = :slug', { slug: SUPER_ADMIN_ROLE })
      .select('COUNT(DISTINCT user.id)', 'count')
      .getRawOne<{ count: string }>();
    return Number(raw?.count) || 0;
  }
}
