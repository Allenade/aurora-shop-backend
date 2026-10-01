import {
  Body,
  Controller,
  Get,
  Header,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Action, Resource } from '@app/shared';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { ComplianceService } from './compliance.service';
import { CreateDataRequestDto } from './dto/data-request.dto';

@ApiTags('Compliance')
@ApiBearerAuth()
@Controller('admin/compliance')
export class ComplianceController {
  constructor(private readonly compliance: ComplianceService) {}

  @Get('summary')
  @RequirePermissions({ action: Action.READ, resource: Resource.COMPLIANCE })
  @ApiOperation({
    operationId: 'getComplianceSummary',
    summary: 'Compliance summary',
    description:
      'Counts by status, collected amount, stale pending, exceptions, consent percent, unknown age, and seats. Optional from/to.',
  })
  summary(@Query('from') from?: string, @Query('to') to?: string) {
    return this.compliance.summary(from, to);
  }

  @Get('timeline')
  @RequirePermissions({ action: Action.READ, resource: Resource.COMPLIANCE })
  @ApiOperation({
    operationId: 'getComplianceTimeline',
    summary: 'Enrollment timeline',
    description: 'Daily enrollment counts and collected amounts.',
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
      'Paid but not verified, amount mismatch, paid with no email, and pending older than 24 hours.',
  })
  exceptions() {
    return this.compliance.exceptions();
  }

  @Get('export.csv')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="core-enrollments.csv"')
  @RequirePermissions({ action: Action.READ, resource: Resource.COMPLIANCE })
  @ApiOperation({
    operationId: 'exportComplianceCsv',
    summary: 'Export enrollments CSV',
    description: 'CSV of enrollments in the optional from/to range.',
  })
  exportCsv(@Query('from') from?: string, @Query('to') to?: string) {
    return this.compliance.exportCsv(from, to);
  }

  @Get('tests')
  @RequirePermissions({ action: Action.READ, resource: Resource.COMPLIANCE })
  @ApiOperation({
    operationId: 'getComplianceTests',
    summary: 'Compliance self-checks',
    description:
      'Pass/fail list: webhook raw-body signature, Paystack key, consent captured, policy pages, rate limiting. findings is a count.',
  })
  tests(@Query('from') from?: string, @Query('to') to?: string) {
    return this.compliance.tests(from, to);
  }

  @Get('health')
  @RequirePermissions({ action: Action.READ, resource: Resource.COMPLIANCE })
  @ApiOperation({
    operationId: 'getComplianceHealth',
    summary: 'Service health strip',
    description:
      'Paystack, webhooks, Resend, reconciliation job, and policy pages.',
  })
  health() {
    return this.compliance.health();
  }

  @Post('enrollments/:id/reverify')
  @RequirePermissions({ action: Action.UPDATE, resource: Resource.COMPLIANCE })
  @ApiOperation({
    operationId: 'reverifyEnrollment',
    summary: 'Re-verify enrollment with Paystack',
    description: 'Polls Paystack and records the confirmation source as admin.',
  })
  reverify(@Param('id') id: string, @CurrentUser('sub') userId: string) {
    return this.compliance.reverify(id, userId);
  }

  @Post('enrollments/:id/resend-confirmation')
  @RequirePermissions({ action: Action.UPDATE, resource: Resource.COMPLIANCE })
  @ApiOperation({
    operationId: 'resendEnrollmentConfirmation',
    summary: 'Resend confirmation email',
    description: 'Sends the paid-enrollment confirmation again.',
  })
  resend(@Param('id') id: string, @CurrentUser('sub') userId: string) {
    return this.compliance.resendConfirmation(id, userId);
  }

  @Get('data-requests')
  @RequirePermissions({ action: Action.LIST, resource: Resource.COMPLIANCE })
  @ApiOperation({
    operationId: 'listDataRequests',
    summary: 'List data requests',
    description: 'Access and deletion requests with due dates.',
  })
  listRequests() {
    return this.compliance.listDataRequests();
  }

  @Post('data-requests')
  @RequirePermissions({ action: Action.CREATE, resource: Resource.COMPLIANCE })
  @ApiOperation({
    operationId: 'createDataRequest',
    summary: 'Create data request',
    description:
      'Opens an access or delete request. Due date comes from retention settings.',
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
    summary: 'Export a subject',
    description: 'Returns enrollments for the request email.',
  })
  exportSubject(@Param('id') id: string, @CurrentUser('sub') userId: string) {
    return this.compliance.exportSubject(id, userId);
  }

  @Post('data-requests/:id/anonymise')
  @RequirePermissions({ action: Action.UPDATE, resource: Resource.COMPLIANCE })
  @ApiOperation({
    operationId: 'anonymiseDataRequest',
    summary: 'Anonymise a subject',
    description:
      'Scrubs PII on matching enrollments and completes the request. Payment references are kept.',
  })
  anonymise(@Param('id') id: string, @CurrentUser('sub') userId: string) {
    return this.compliance.anonymiseSubject(id, userId);
  }
}
