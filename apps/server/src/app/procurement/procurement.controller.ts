import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Action, Resource, UserType } from '@app/shared';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import type { JwtPayload } from '../auth/dto/auth.types';
import { ProcurementService } from './procurement.service';
import type { QuoteStatus } from './entities/quote.entity';

@ApiTags('Procurement')
@ApiBearerAuth()
@Controller()
export class ProcurementController {
  constructor(private readonly procurement: ProcurementService) {}

  @Post('quotes')
  @RequirePermissions({ action: Action.CREATE, resource: Resource.QUOTE })
  @ApiOperation({
    operationId: 'createQuote',
    summary: 'Create Quote',
    description: 'Submit or save a procurement quote.',
  })
  create(
    @CurrentUser('sub') userId: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.procurement.create(userId, body as never);
  }

  @Get('quotes')
  @RequirePermissions({ action: Action.LIST, resource: Resource.PROCUREMENT })
  @ApiOperation({
    operationId: 'listQuotes',
    summary: 'List Quotes',
    description: 'Buyer quotes or the admin queue.',
  })
  list(@CurrentUser() user: JwtPayload) {
    return this.procurement.list(user.sub, user.type === UserType.ADMIN);
  }

  @Patch('admin/quotes/:id/status')
  @RequirePermissions({ action: Action.MANAGE, resource: Resource.PROCUREMENT })
  @ApiOperation({
    operationId: 'setQuoteStatus',
    summary: 'Set Quote Status',
    description: 'Admin review workflow.',
  })
  setStatus(@Param('id') id: string, @Body() body: { status: QuoteStatus }) {
    return this.procurement.setStatus(id, body.status);
  }
}
