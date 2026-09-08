import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Action, Resource } from '@app/shared';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { CatalogService } from './catalog.service';

@ApiTags('Catalog')
@ApiBearerAuth()
@Controller()
export class CatalogController {
  constructor(private readonly catalog: CatalogService) {}

  @Get('products')
  @RequirePermissions({ action: Action.LIST, resource: Resource.SHOP })
  @ApiOperation({
    operationId: 'listProducts',
    summary: 'List Products',
    description:
      'Shop catalog with optional filters. Pass page/limit for a paginated `{ items, total, page, limit, pageCount }` response; omit them to receive a plain array.',
  })
  list(
    @Query('category') category?: string,
    @Query('brand') brand?: string,
    @Query('q') q?: string,
    @Query('status') status?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.catalog.list({
      category,
      brand,
      q,
      status,
      page: page !== undefined ? Number(page) : undefined,
      limit: limit !== undefined ? Number(limit) : undefined,
    });
  }

  @Get('products/:slug')
  @RequirePermissions({ action: Action.READ, resource: Resource.SHOP })
  @ApiOperation({
    operationId: 'getProductBySlug',
    summary: 'Get Product',
    description: 'Product detail by slug.',
  })
  get(@Param('slug') slug: string) {
    return this.catalog.getBySlug(slug);
  }

  @Post('admin/products')
  @RequirePermissions({ action: Action.MANAGE, resource: Resource.PRODUCT })
  @ApiOperation({
    operationId: 'createProduct',
    summary: 'Create Product',
    description: 'Admin catalog create.',
  })
  create(@Body() body: Record<string, unknown>) {
    return this.catalog.create(body);
  }

  @Patch('admin/products/:id')
  @RequirePermissions({ action: Action.MANAGE, resource: Resource.PRODUCT })
  @ApiOperation({
    operationId: 'updateProduct',
    summary: 'Update Product',
    description: 'Admin catalog update.',
  })
  update(@Param('id') id: string, @Body() body: Record<string, unknown>) {
    return this.catalog.update(id, body);
  }

  @Delete('admin/products/:id')
  @RequirePermissions({ action: Action.MANAGE, resource: Resource.PRODUCT })
  @ApiOperation({
    operationId: 'deleteProduct',
    summary: 'Delete Product',
    description: 'Soft-delete a catalog product.',
  })
  remove(@Param('id') id: string) {
    return this.catalog.remove(id);
  }
}
