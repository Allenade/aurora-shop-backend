import { Body, Controller, Delete, Get, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Action, Resource } from '@app/shared';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import type { JwtPayload } from '../auth/dto/auth.types';
import { CartService } from './cart.service';

@ApiTags('Cart')
@ApiBearerAuth()
@Controller()
export class CartController {
  constructor(private readonly cart: CartService) {}

  @Get('cart')
  @RequirePermissions({ action: Action.READ, resource: Resource.ORDER })
  @ApiOperation({
    operationId: 'getCart',
    summary: 'Get Cart',
    description: 'Current user cart with stock-clamped quantities.',
  })
  get(@CurrentUser() user: JwtPayload) {
    return this.cart.getCart(user.sub);
  }

  @Post('cart/items')
  @RequirePermissions({ action: Action.CREATE, resource: Resource.ORDER })
  @ApiOperation({
    operationId: 'setCartItem',
    summary: 'Set Cart Item',
    description:
      'Add or update a cart line by product slug. Qty is clamped to available stock (min 1).',
  })
  setItem(
    @CurrentUser() user: JwtPayload,
    @Body() body: { slug?: string; qty?: number },
  ) {
    return this.cart.setItem(user.sub, {
      slug: body.slug ?? '',
      qty: body.qty ?? 1,
    });
  }

  @Delete('cart/items/:slug')
  @RequirePermissions({ action: Action.CREATE, resource: Resource.ORDER })
  @ApiOperation({
    operationId: 'removeCartItem',
    summary: 'Remove Cart Item',
    description: 'Remove a product from the cart by slug.',
  })
  remove(@CurrentUser() user: JwtPayload, @Param('slug') slug: string) {
    return this.cart.removeItem(user.sub, slug);
  }

  @Delete('cart')
  @RequirePermissions({ action: Action.CREATE, resource: Resource.ORDER })
  @ApiOperation({
    operationId: 'clearCart',
    summary: 'Clear Cart',
    description: 'Remove all items from the current user cart.',
  })
  clear(@CurrentUser() user: JwtPayload) {
    return this.cart.clear(user.sub);
  }
}
