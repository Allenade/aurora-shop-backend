import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { InjectRepository } from '@nestjs/typeorm';
import { Action, Resource, UserStatus } from '@app/shared';
import { Repository } from 'typeorm';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { ProductEntity } from '../catalog/entities/product.entity';
import { InventoryEntity } from '../inventory/entities/inventory.entity';
import { OrderEntity } from '../order/entities/order.entity';
import { QuoteEntity } from '../procurement/entities/quote.entity';
import { UserEntity } from '../user/entities/user.entity';

@ApiTags('Admin')
@ApiBearerAuth()
@Controller('admin/overview')
export class AdminController {
  constructor(
    @InjectRepository(OrderEntity)
    private readonly orders: Repository<OrderEntity>,
    @InjectRepository(UserEntity)
    private readonly users: Repository<UserEntity>,
    @InjectRepository(ProductEntity)
    private readonly products: Repository<ProductEntity>,
    @InjectRepository(QuoteEntity)
    private readonly quotes: Repository<QuoteEntity>,
    @InjectRepository(InventoryEntity)
    private readonly inventory: Repository<InventoryEntity>,
  ) {}

  @Get()
  @RequirePermissions({ action: Action.READ, resource: Resource.OVERVIEW })
  @ApiOperation({
    operationId: 'getAdminOverview',
    summary: 'Admin Overview',
    description: 'Counts, recent orders, and stock alerts for the admin home.',
  })
  async overview() {
    const [orderRows, userCount, activeUserCount, productCount, quoteCount] =
      await Promise.all([
        this.orders.find({ order: { createdAt: 'DESC' }, take: 200 }),
        this.users.count(),
        this.users.count({ where: { status: UserStatus.ACTIVE } }),
        this.products.count(),
        this.quotes.count(),
      ]);

    const unpaid = orderRows.filter(
      (row) => row.paymentStatus === 'unpaid',
    ).length;
    const paidTotal = orderRows
      .filter((row) => row.paymentStatus === 'paid')
      .reduce((sum, row) => sum + row.total, 0);
    const statusCounts = {
      delivered: orderRows.filter((row) => row.status === 'delivered').length,
      pending: orderRows.filter((row) => row.status === 'pending').length,
      in_transit: orderRows.filter((row) => row.status === 'in_transit').length,
      cancelled: orderRows.filter((row) => row.status === 'cancelled').length,
    };
    const totalOrders = orderRows.length || 1;

    const recentOrders = orderRows.slice(0, 8).map((row) => ({
      id: row.orderNumber,
      internalId: row.id,
      customer: row.shippingName,
      amount: `₦${row.total.toLocaleString('en-NG')}`,
      status:
        row.status === 'in_transit'
          ? 'In Transit'
          : row.status === 'delivered'
            ? 'Delivered'
            : row.status === 'cancelled'
              ? 'Cancelled'
              : 'Pending',
      date: row.createdAt.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      }),
    }));

    const stockRows = await this.inventory.find({
      relations: { product: true },
    });
    const alerts = stockRows
      .map((row) => {
        const qty = row.quantity;
        const min = row.minStock;
        const level =
          qty <= 0
            ? 'OUT OF STOCK'
            : qty <= Math.max(1, Math.floor(min / 2))
              ? 'CRITICAL'
              : qty <= min
                ? 'LOW STOCK'
                : null;
        if (!level) return null;
        return {
          id: row.productId,
          name: row.product?.name ?? 'Item',
          level,
          qty,
          minStock: min,
          fillPercent:
            min <= 0 ? 0 : Math.min(100, Math.round((qty / min) * 100)),
        };
      })
      .filter((row): row is NonNullable<typeof row> => Boolean(row))
      .slice(0, 6);

    const breakdown = [
      {
        id: 'delivered',
        label: 'Delivered',
        count: statusCounts.delivered,
        percent: Math.round((statusCounts.delivered / totalOrders) * 100),
        tone: 'green',
      },
      {
        id: 'processing',
        label: 'Processing',
        count: statusCounts.pending,
        percent: Math.round((statusCounts.pending / totalOrders) * 100),
        tone: 'blue',
      },
      {
        id: 'shipped',
        label: 'Shipped',
        count: statusCounts.in_transit,
        percent: Math.round((statusCounts.in_transit / totalOrders) * 100),
        tone: 'orange',
      },
      {
        id: 'cancelled',
        label: 'Cancelled',
        count: statusCounts.cancelled,
        percent: Math.round((statusCounts.cancelled / totalOrders) * 100),
        tone: 'gray',
      },
    ];

    return {
      orderCount: orderRows.length,
      userCount,
      activeUserCount,
      productCount,
      quoteCount,
      unpaid,
      stats: [
        {
          id: 'orders',
          label: 'Total Orders',
          value: String(orderRows.length),
          hint: `${unpaid} unpaid`,
          icon: 'orders',
        },
        {
          id: 'revenue',
          label: 'Paid Revenue',
          value: `₦${paidTotal.toLocaleString('en-NG')}`,
          hint: 'Confirmed payments',
          icon: 'revenue',
        },
        {
          id: 'active',
          label: 'Active Users',
          value: String(activeUserCount),
          hint: `${userCount} total users`,
          icon: 'active',
        },
        {
          id: 'inactive',
          label: 'Catalog SKUs',
          value: String(productCount),
          hint: `${alerts.length} stock alerts`,
          icon: 'inactive',
        },
      ],
      recentOrders,
      stockAlerts: alerts,
      orderBreakdown: breakdown,
    };
  }
}
