import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Action, Resource, UserType } from '@app/shared';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import type { JwtPayload } from '../auth/dto/auth.types';
import { OrderService, type CheckoutInput } from './order.service';
import type { OrderStatus } from './entities/order.entity';

@ApiTags('Orders')
@ApiBearerAuth()
@Controller()
export class OrderController {
  constructor(private readonly orders: OrderService) {}

  @Post('checkout')
  @RequirePermissions({ action: Action.CREATE, resource: Resource.ORDER })
  @ApiOperation({
    operationId: 'createCheckout',
    summary: 'Create Checkout',
    description:
      'Server-priced checkout. Creates a pending ledger transaction.',
  })
  checkout(
    @CurrentUser() user: JwtPayload,
    @Body() body: Omit<CheckoutInput, 'userId'>,
  ) {
    return this.orders.checkout({ ...body, userId: user.sub });
  }

  @Get('orders')
  @RequirePermissions({ action: Action.LIST, resource: Resource.ORDER })
  @ApiOperation({
    operationId: 'listOrders',
    summary: 'List Orders',
    description:
      'Orders for the current user, or all orders for admins. Pass page/limit for a paginated `{ items, total, page, limit, pageCount }` response; omit them to receive a plain array.',
  })
  list(
    @CurrentUser() user: JwtPayload,
    @Query('q') q?: string,
    @Query('status') status?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.orders.listForUser(user.sub, user.type === UserType.ADMIN, {
      q,
      status,
      page: page !== undefined ? Number(page) : undefined,
      limit: limit !== undefined ? Number(limit) : undefined,
    });
  }

  @Get('orders/:id')
  @RequirePermissions({ action: Action.READ, resource: Resource.ORDER })
  @ApiOperation({
    operationId: 'getOrder',
    summary: 'Get Order',
    description: 'Order detail by id or order number.',
  })
  get(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.orders.getById(id, user.sub, user.type === UserType.ADMIN);
  }

  @Get('track')
  @RequirePermissions({ action: Action.READ, resource: Resource.TRACK_ORDER })
  @ApiOperation({
    operationId: 'trackOrder',
    summary: 'Track Order',
    description: 'Lookup a shipment by tracking or order number.',
  })
  track(@Query('q') q: string) {
    return this.orders.track(q);
  }

  @Patch('admin/orders/:id/status')
  @RequirePermissions({ action: Action.MANAGE, resource: Resource.ORDER })
  @ApiOperation({
    operationId: 'setOrderStatus',
    summary: 'Set Order Status',
    description: 'Admin fulfillment status update.',
  })
  setStatus(@Param('id') id: string, @Body() body: { status: OrderStatus }) {
    return this.orders.adminSetStatus(id, body.status);
  }
}
