import {
  Body,
  Controller,
  Get,
  Header,
  Param,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Action, Resource } from '@app/shared';
import type { Response } from 'express';
import { PiiAccessService } from '../auth/pii-access.service';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import type { JwtPayload } from '../auth/dto/auth.types';
import {
  ENROLLMENT_LIST_QUERY_DOCS,
  type EnrollmentListQuery,
} from '../enter-first/enrollment-list-filters';
import { enrollmentQuery } from '../enter-first/enrollment-list-query';
import { ComplianceService } from './compliance.service';
import { CreateDataRequestDto } from './dto/compliance.dto';

@ApiTags('Compliance')
@ApiBearerAuth()
@Controller('admin/compliance')
export class ComplianceController {
  constructor(
    private readonly compliance: ComplianceService,
    private readonly pii: PiiAccessService,
  ) {}

  @Get('summary')
  @RequirePermissions({ action: Action.READ, resource: Resource.COMPLIANCE })
  @ApiOperation({
    operationId: 'getComplianceSummary',
    summary: 'Compliance summary',
    description:
      'Counts by status, amount collected, pending over 24h, exceptions, consent percent, unknown-age students, and seats per course.',
  })
  summary(@Query('from') from?: string, @Query('to') to?: string) {
    return this.compliance.summary(from, to);
  }

  @Get('timeline')
  @RequirePermissions({ action: Action.READ, resource: Resource.COMPLIANCE })
  @ApiOperation({
    operationId: 'getComplianceTimeline',
    summary: 'Enrollment timeline',
  })
  timeline(@Query('from') from?: string, @Query('to') to?: string) {
    return this.compliance.timeline(from, to);
  }

  @Get('exceptions')
  @RequirePermissions({ action: Action.READ, resource: Resource.COMPLIANCE })
  @ApiOperation({
    operationId: 'listComplianceExceptions',
    summary: 'Reconciliation exceptions',
    description:
      'Paid but not verified, amount mismatch, paid with no email, and stale pending.',
  })
  async exceptions(@CurrentUser() user: JwtPayload) {
    const maskPii = await this.pii.shouldMaskPii(user.sub);
    return this.compliance.exceptions(maskPii);
  }

  @Post('enrollments/:id/reverify')
  @RequirePermissions({ action: Action.UPDATE, resource: Resource.ENTER_FIRST })
  @ApiOperation({
    operationId: 'reverifyEnterFirstEnrollment',
    summary: 'Re-verify an enrollment with Paystack',
  })
  reverify(@Param('id') id: string) {
    return this.compliance.reverify(id);
  }

  @Post('enrollments/:id/resend-confirmation')
  @RequirePermissions({ action: Action.UPDATE, resource: Resource.ENTER_FIRST })
  @ApiOperation({
    operationId: 'resendEnterFirstConfirmation',
    summary: 'Resend enrollment confirmation',
  })
  resend(@Param('id') id: string) {
    return this.compliance.resendConfirmation(id);
  }

  @Get('export')
  @RequirePermissions({ action: Action.READ, resource: Resource.COMPLIANCE })
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @ApiOperation({
    operationId: 'exportComplianceCsv',
    summary: 'Export enrollments CSV',
    description: `UTF-8 CSV with a BOM and CRLF rows for Excel. Same filters as the enrollment list, up to 20000 rows. PDF stays on the dashboard. ${ENROLLMENT_LIST_QUERY_DOCS}`,
  })
  async exportCsv(
    @CurrentUser() user: JwtPayload,
    @Res({ passthrough: true }) res: Response,
    @Query() query: EnrollmentListQuery,
  ) {
    const maskPii = await this.pii.shouldMaskPii(user.sub);
    const { csv, truncated } = await this.compliance.exportCsv(
      enrollmentQuery(query),
      maskPii,
    );
    res.setHeader(
      'Content-Disposition',
      'attachment; filename="core30-enrollments.csv"',
    );
    if (truncated) res.setHeader('X-Export-Truncated', 'true');
    return csv;
  }

  @Get('tests')
  @RequirePermissions({ action: Action.READ, resource: Resource.COMPLIANCE })
  @ApiOperation({
    operationId: 'getComplianceTests',
    summary: 'Compliance control checks',
    description:
      'Pass/fail list for webhook signature, Paystack key, consent capture, policy pages, and rate limiting.',
  })
  tests() {
    return this.compliance.tests();
  }

  @Get('data-requests')
  @RequirePermissions({ action: Action.LIST, resource: Resource.COMPLIANCE })
  @ApiOperation({
    operationId: 'listDataRequests',
    summary: 'List data requests',
  })
  listRequests() {
    return this.compliance.listDataRequests();
  }

  @Post('data-requests')
  @RequirePermissions({ action: Action.CREATE, resource: Resource.COMPLIANCE })
  @ApiOperation({
    operationId: 'createDataRequest',
    summary: 'Create a data request',
  })
  createRequest(
    @Body() body: CreateDataRequestDto,
    @CurrentUser('sub') userId: string,
  ) {
    return this.compliance.createDataRequest(body, userId);
  }

  @Post('data-requests/:id/export')
  @RequirePermissions({ action: Action.UPDATE, resource: Resource.COMPLIANCE })
  @ApiOperation({
    operationId: 'exportDataRequest',
    summary: 'Export a subject access file',
  })
  exportRequest(@Param('id') id: string) {
    return this.compliance.exportDataRequest(id);
  }

  @Post('data-requests/:id/anonymise')
  @RequirePermissions({ action: Action.UPDATE, resource: Resource.COMPLIANCE })
  @ApiOperation({
    operationId: 'anonymiseDataRequest',
    summary: 'Anonymise enrollments for a delete request',
  })
  anonymise(@Param('id') id: string, @CurrentUser('sub') userId: string) {
    return this.compliance.anonymiseDataRequest(id, userId);
  }
}
