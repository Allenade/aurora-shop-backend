import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Action, Resource } from '@app/shared';
import type { Request } from 'express';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Public } from '../auth/decorators/public.decorator';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { ClientIpThrottlerGuard } from '../../common/guards/client-ip-throttler.guard';
import {
  EmailContentDto,
  PreviewAudienceDto,
  SegmentDto,
  SingleEmailDto,
  TemplateDto,
  TestEmailDto,
} from './dto/email.dto';
import { EmailService } from './email.service';

@ApiTags('Emails')
@Controller()
export class EmailController {
  constructor(private readonly emails: EmailService) {}

  @ApiBearerAuth()
  @Get('admin/emails/templates')
  @RequirePermissions({ action: Action.LIST, resource: Resource.EMAIL })
  @ApiOperation({
    operationId: 'listEmailTemplates',
    summary: 'List email templates',
    description: 'Saved block templates for transactional and marketing mail.',
  })
  listTemplates() {
    return this.emails.listTemplates();
  }

  @ApiBearerAuth()
  @Post('admin/emails/templates')
  @RequirePermissions({ action: Action.CREATE, resource: Resource.EMAIL })
  @ApiOperation({
    operationId: 'createEmailTemplate',
    summary: 'Create email template',
    description: 'Stores subject, kind, and block content.',
  })
  createTemplate(
    @Body() body: TemplateDto,
    @CurrentUser('sub') userId: string,
  ) {
    return this.emails.createTemplate(body, userId);
  }

  @ApiBearerAuth()
  @Patch('admin/emails/templates/:id')
  @RequirePermissions({ action: Action.UPDATE, resource: Resource.EMAIL })
  @ApiOperation({
    operationId: 'updateEmailTemplate',
    summary: 'Update email template',
    description: 'Partial update of a template.',
  })
  updateTemplate(
    @Param('id') id: string,
    @Body() body: TemplateDto,
    @CurrentUser('sub') userId: string,
  ) {
    return this.emails.updateTemplate(id, body, userId);
  }

  @ApiBearerAuth()
  @Delete('admin/emails/templates/:id')
  @RequirePermissions({ action: Action.DELETE, resource: Resource.EMAIL })
  @ApiOperation({
    operationId: 'deleteEmailTemplate',
    summary: 'Delete email template',
    description: 'Soft-deletes a template.',
  })
  deleteTemplate(@Param('id') id: string, @CurrentUser('sub') userId: string) {
    return this.emails.deleteTemplate(id, userId);
  }

  @ApiBearerAuth()
  @Get('admin/emails/segments')
  @RequirePermissions({ action: Action.LIST, resource: Resource.EMAIL })
  @ApiOperation({
    operationId: 'listEmailSegments',
    summary: 'List saved segments',
    description: 'Reusable audience filters.',
  })
  listSegments() {
    return this.emails.listSegments();
  }

  @ApiBearerAuth()
  @Post('admin/emails/segments')
  @RequirePermissions({ action: Action.CREATE, resource: Resource.EMAIL })
  @ApiOperation({
    operationId: 'createEmailSegment',
    summary: 'Create segment',
    description: 'Saves an audience filter.',
  })
  createSegment(@Body() body: SegmentDto, @CurrentUser('sub') userId: string) {
    return this.emails.createSegment(
      { name: body.name, filters: body.filters },
      userId,
    );
  }

  @ApiBearerAuth()
  @Patch('admin/emails/segments/:id')
  @RequirePermissions({ action: Action.UPDATE, resource: Resource.EMAIL })
  @ApiOperation({
    operationId: 'updateEmailSegment',
    summary: 'Update segment',
    description: 'Updates a saved audience filter.',
  })
  updateSegment(@Param('id') id: string, @Body() body: SegmentDto) {
    return this.emails.updateSegment(id, {
      name: body.name,
      filters: body.filters,
    });
  }

  @ApiBearerAuth()
  @Delete('admin/emails/segments/:id')
  @RequirePermissions({ action: Action.DELETE, resource: Resource.EMAIL })
  @ApiOperation({
    operationId: 'deleteEmailSegment',
    summary: 'Delete segment',
    description: 'Soft-deletes a saved segment.',
  })
  deleteSegment(@Param('id') id: string) {
    return this.emails.deleteSegment(id);
  }

  @ApiBearerAuth()
  @Post('admin/emails/preview')
  @RequirePermissions({ action: Action.READ, resource: Resource.EMAIL })
  @ApiOperation({
    operationId: 'previewEmailAudience',
    summary: 'Preview recipient count',
    description:
      'Counts recipients after suppression and, for marketing, missing opt-in.',
  })
  preview(@Body() body: PreviewAudienceDto) {
    return this.emails.preview(body.audience, body.kind);
  }

  @ApiBearerAuth()
  @Post('admin/emails/send')
  @RequirePermissions({ action: Action.CREATE, resource: Resource.EMAIL })
  @ApiOperation({
    operationId: 'sendSingleEmail',
    summary: 'Send one email',
    description:
      'Queues a single recipient. Marketing still requires opt-in and adds an unsubscribe link.',
  })
  send(@Body() body: SingleEmailDto, @CurrentUser('sub') userId: string) {
    return this.emails.sendSingle(body, userId);
  }

  @ApiBearerAuth()
  @Post('admin/emails/campaigns')
  @RequirePermissions({ action: Action.CREATE, resource: Resource.EMAIL })
  @ApiOperation({
    operationId: 'createEmailCampaign',
    summary: 'Create email campaign',
    description:
      'Materialises one message per recipient and queues a BullMQ job. Pass scheduledAt to send later.',
  })
  createCampaign(
    @Body() body: EmailContentDto,
    @CurrentUser('sub') userId: string,
  ) {
    return this.emails.createCampaign(body, userId);
  }

  @ApiBearerAuth()
  @Get('admin/emails/campaigns')
  @RequirePermissions({ action: Action.LIST, resource: Resource.EMAIL })
  @ApiOperation({
    operationId: 'listEmailCampaigns',
    summary: 'List campaigns',
    description: 'Campaigns with status and recipient stats.',
  })
  listCampaigns() {
    return this.emails.listCampaigns();
  }

  @ApiBearerAuth()
  @Get('admin/emails/campaigns/:id')
  @RequirePermissions({ action: Action.READ, resource: Resource.EMAIL })
  @ApiOperation({
    operationId: 'getEmailCampaign',
    summary: 'Get campaign',
    description: 'Campaign plus up to 200 message statuses.',
  })
  getCampaign(@Param('id') id: string) {
    return this.emails.getCampaign(id);
  }

  @ApiBearerAuth()
  @Post('admin/emails/campaigns/:id/pause')
  @RequirePermissions({ action: Action.UPDATE, resource: Resource.EMAIL })
  @ApiOperation({
    operationId: 'pauseEmailCampaign',
    summary: 'Pause campaign',
    description: 'Stops the worker from sending further batches.',
  })
  pause(@Param('id') id: string, @CurrentUser('sub') userId: string) {
    return this.emails.setCampaignStatus(id, 'paused', userId);
  }

  @ApiBearerAuth()
  @Post('admin/emails/campaigns/:id/resume')
  @RequirePermissions({ action: Action.UPDATE, resource: Resource.EMAIL })
  @ApiOperation({
    operationId: 'resumeEmailCampaign',
    summary: 'Resume campaign',
    description: 'Queues remaining messages.',
  })
  resume(@Param('id') id: string, @CurrentUser('sub') userId: string) {
    return this.emails.setCampaignStatus(id, 'sending', userId);
  }

  @ApiBearerAuth()
  @Post('admin/emails/campaigns/:id/cancel')
  @RequirePermissions({ action: Action.UPDATE, resource: Resource.EMAIL })
  @ApiOperation({
    operationId: 'cancelEmailCampaign',
    summary: 'Cancel campaign',
    description: 'Cancels queued messages. Sent messages are left as-is.',
  })
  cancel(@Param('id') id: string, @CurrentUser('sub') userId: string) {
    return this.emails.setCampaignStatus(id, 'cancelled', userId);
  }

  @ApiBearerAuth()
  @Post('admin/emails/campaigns/:id/retry-failed')
  @RequirePermissions({ action: Action.UPDATE, resource: Resource.EMAIL })
  @ApiOperation({
    operationId: 'retryFailedEmailCampaign',
    summary: 'Retry failed messages',
    description: 'Resets failed messages to queued and enqueues the campaign.',
  })
  retry(@Param('id') id: string, @CurrentUser('sub') userId: string) {
    return this.emails.retryFailed(id, userId);
  }

  @ApiBearerAuth()
  @Post('admin/emails/test-send')
  @RequirePermissions({ action: Action.CREATE, resource: Resource.EMAIL })
  @ApiOperation({
    operationId: 'testSendEmail',
    summary: 'Send a test email',
    description: 'Sends one transactional test to an address you choose.',
  })
  testSend(@Body() body: TestEmailDto, @CurrentUser('sub') userId: string) {
    return this.emails.testSend(body, userId);
  }

  @ApiBearerAuth()
  @Post('admin/emails/images')
  @RequirePermissions({ action: Action.CREATE, resource: Resource.EMAIL })
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  @ApiOperation({
    operationId: 'uploadEmailImage',
    summary: 'Upload email image',
    description:
      'Validates type and size, resizes to fit 1600px, recompresses, and stores the file on R2.',
  })
  upload(
    @UploadedFile()
    file?: {
      buffer: Buffer;
      originalname: string;
      mimetype: string;
      size: number;
    },
  ) {
    if (!file) throw new BadRequestException('File is required');
    return this.emails.uploadImage(file);
  }

  @Public()
  @Post('webhooks/resend')
  @ApiOperation({
    operationId: 'handleResendWebhook',
    summary: 'Resend webhook',
    description:
      'Svix signature over the raw body. Updates delivery status and suppresses hard bounces and complaints.',
  })
  resendWebhook(
    @Req() req: RawBodyRequest<Request>,
    @Headers() headers: Record<string, string>,
  ) {
    if (!req.rawBody) throw new BadRequestException('Missing raw body');
    return this.emails.handleResendWebhook(req.rawBody, headers);
  }

  @Public()
  @UseGuards(ClientIpThrottlerGuard)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Get('enter-first/unsubscribe')
  @ApiOperation({
    operationId: 'unsubscribeEnterFirst',
    summary: 'Unsubscribe',
    description:
      'Public signed-token unsubscribe. Clears marketing opt-in and adds a suppression.',
  })
  unsubscribe(@Query('token') token: string) {
    return this.emails.unsubscribe(token ?? '');
  }
}
