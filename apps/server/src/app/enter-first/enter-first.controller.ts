import {
  Body,
  Controller,
  Delete,
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
      'Public website enrollment. The enrollment is stored under program Core 3.0 with the selected course tracks. Price is loaded from the course table. A course is accepted only when it is published (status open), belongs to Core 3.0, and has a price set, or is free. Draft, closed, archived, full, and unpaid courses are rejected. A course after its enrollment cutoff is rejected as closed. Initializes Paystack, including Pay with Transfer, when the amount is greater than 0.',
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
    description: `Website / Enter First payment enrollments for admin. Defaults to program Core 3.0. Each item includes emailStatus (null, pending, sending, sent, failed), emailSentAt, and emailError. compliance_viewer responses mask PII. ${ENROLLMENT_LIST_QUERY_DOCS}`,
  })
  async list(
    @CurrentUser() user: JwtPayload,
    @Query() query: EnrollmentListQuery,
  ) {
    const maskPii = await this.pii.shouldMaskPii(user.sub);
    return this.enterFirst.list(enrollmentQuery(query), maskPii);
  }

  @ApiBearerAuth()
  @Post('admin/enter-first/enrollments/clear-all')
  @RequirePermissions({ action: Action.MANAGE, resource: Resource.ALL })
  @ApiOperation({
    operationId: 'clearAllEnterFirstEnrollments',
    summary: 'Delete every Payments list record',
    description:
      'Super admin only. Soft-deletes every enrollment the Payments list can return, in every program, and the refund requests for those enrollments. Cleared rows leave the list, the compliance CSV export, and overview counts. Does not call Paystack. Returns 403 when the caller is not a super admin.',
  })
  clearAll(@CurrentUser('sub') userId: string) {
    return this.enterFirst.clearAll(userId);
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

  @ApiBearerAuth()
  @Post('admin/enter-first/enrollments/:id/resend-confirmation')
  @RequirePermissions({ action: Action.UPDATE, resource: Resource.ENTER_FIRST })
  @ApiOperation({
    operationId: 'resendEnterFirstConfirmation',
    summary: 'Resend the after-payment email',
    description:
      'Admin resend for one paid enrollment. Bypasses the one-time claim and queues a single email to the payer. Failed or unpaid enrollments are rejected.',
  })
  resendConfirmation(@Param('id') id: string) {
    return this.enterFirst.resendConfirmation(id);
  }

  @ApiBearerAuth()
  @Delete('admin/enter-first/enrollments/:id')
  @RequirePermissions({ action: Action.MANAGE, resource: Resource.ALL })
  @ApiOperation({
    operationId: 'deleteEnterFirstEnrollment',
    summary: 'Delete a Payments list record',
    description:
      'Super admin only. The id is the enrollment id returned by GET /admin/enter-first/enrollments (field id). Soft-deletes that enrollment and its refund requests. The row leaves the Payments list, the compliance CSV export, and overview counts. Does not call Paystack. Returns 404 when the record does not exist and 403 when the caller is not a super admin.',
  })
  remove(@Param('id') id: string, @CurrentUser('sub') userId: string) {
    return this.enterFirst.remove(id, userId);
  }
}
