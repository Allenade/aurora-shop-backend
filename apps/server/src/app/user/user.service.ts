import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { UserStatus } from '@app/shared';
import { Repository } from 'typeorm';
import { OrderEntity } from '../order/entities/order.entity';
import { UserEntity } from './entities/user.entity';
import { UserRepository } from './repositories/user.repository';

@Injectable()
export class UserService {
  constructor(
    private readonly users: UserRepository,
    @InjectRepository(UserEntity)
    private readonly userRepo: Repository<UserEntity>,
    @InjectRepository(OrderEntity)
    private readonly orders: Repository<OrderEntity>,
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

    const paginate =
      query?.page !== undefined || query?.limit !== undefined;

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
            metric.spent > 0
              ? `₦${metric.spent.toLocaleString('en-NG')}`
              : '—',
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
}
