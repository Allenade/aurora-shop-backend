import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiProperty, ApiTags } from '@nestjs/swagger';
import { Action, Resource } from '@app/shared';
import { IsInt, Min } from 'class-validator';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { InventoryService } from './inventory.service';

class RestockDto {
  @IsInt()
  @Min(1)
  @ApiProperty()
  quantity: number;
}

@ApiTags('Inventory')
@ApiBearerAuth()
@Controller('inventory')
export class InventoryController {
  constructor(private readonly inventory: InventoryService) {}

  @Get()
  @RequirePermissions({ action: Action.LIST, resource: Resource.INVENTORY })
  @ApiOperation({
    operationId: 'listInventory',
    summary: 'List Inventory',
    description: 'Stock levels for admin.',
  })
  list() {
    return this.inventory.list();
  }

  @Post(':productId/restock')
  @RequirePermissions({ action: Action.MANAGE, resource: Resource.INVENTORY })
  @ApiOperation({
    operationId: 'restockInventory',
    summary: 'Restock Item',
    description: 'Increase on-hand quantity.',
  })
  restock(@Param('productId') productId: string, @Body() dto: RestockDto) {
    return this.inventory.restock(productId, dto.quantity);
  }
}
