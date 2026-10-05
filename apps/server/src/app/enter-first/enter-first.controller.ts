import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Action, Resource } from '@app/shared';
import type { Request } from 'express';
import { clientIpFromRequest } from '../../common/http/client-ip';
import { PublicEndpointThrottlerGuard } from '../../common/http/public-throttler.guard';
import { PiiAccessService } from '../auth/pii-access.service';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Public } from '../auth/decorators/public.decorator';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import type { JwtPayload } from '../auth/dto/auth.types';
import { EnterFirstEnrollDto } from './dto/enroll.dto';
import {
  ENROLLMENT_LIST_QUERY_DOCS,
  type EnrollmentListQuery,
} from './enrollment-list-filters';
import { enrollmentQuery } from './enrollment-list-query';
import { EnterFirstService } from './enter-first.service';

@ApiTags('Enter First')
@Controller()
export class EnterFirstController {
  constructor(
    private readonly enterFirst: EnterFirstService,
    private readonly pii: PiiAccessService,
  ) {}

  @Public()
  @UseGuards(PublicEndpointThrottlerGuard)
  @Post('enter-first/enrollments')
  @ApiOperation({
    operationId: 'createEnterFirstEnrollment',
    summary: 'Enroll + start Paystack',
    description:
      'Public website enrollment. The enrollment is stored under program Core 3.0 with the selected course tracks. Price is loaded from the course table. A course is accepted only when it is published (status open), belongs to Core 3.0, and has a price set, or is free. Draft, closed, archived, full, past-cutoff, and unpaid courses are rejected. Initializes Paystack, including Pay with Transfer, when the amount is greater than 0.',
  })
  enroll(@Body() body: EnterFirstEnrollDto, @Req() req: Request) {
    return this.enterFirst.enroll(body, {
      ip: clientIpFromRequest(req),
      userAgent: req.get('user-agent') ?? '',
    });
  }

  @Public()
  @UseGuards(PublicEndpointThrottlerGuard)
  @Get('enter-first/enrollments/by-reference/:reference/status')
  @ApiOperation({
    operationId: 'getEnterFirstPaymentStatus',
    summary: 'Enter First payment status',
    description:
      'Public status check after Paystack redirect. Re-verifies pending payments with Paystack, including amount and currency.',
  })
  status(@Param('reference') reference: string) {
    return this.enterFirst.statusByReference(reference);
  }

  @ApiBearerAuth()
  @Get('admin/enter-first/enrollments')
  @RequirePermissions({ action: Action.LIST, resource: Resource.ENTER_FIRST })
  @ApiOperation({
    operationId: 'listEnterFirstEnrollments',
    summary: 'List Enter First enrollments',
    description: `Website / Enter First payment enrollments for admin. Defaults to program Core 3.0. compliance_viewer responses mask PII. ${ENROLLMENT_LIST_QUERY_DOCS}`,
  })
  async list(
    @CurrentUser() user: JwtPayload,
    @Query() query: EnrollmentListQuery,
  ) {
    const maskPii = await this.pii.shouldMaskPii(user.sub);
    return this.enterFirst.list(enrollmentQuery(query), maskPii);
  }

  @ApiBearerAuth()
  @Get('admin/enter-first/enrollments/:id')
  @RequirePermissions({ action: Action.READ, resource: Resource.ENTER_FIRST })
  @ApiOperation({
    operationId: 'getEnterFirstEnrollment',
    summary: 'Get Enter First enrollment',
    description:
      'Full enrollment + form payload. PII is masked for compliance_viewer.',
  })
  async get(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    const maskPii = await this.pii.shouldMaskPii(user.sub);
    return this.enterFirst.getById(id, maskPii);
  }
}
