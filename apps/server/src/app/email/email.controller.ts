import {
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
import { UnauthorizedException } from '@nestjs/common';
import { PublicEndpointThrottlerGuard } from '../../common/http/public-throttler.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Public } from '../auth/decorators/public.decorator';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { ConfigService } from '@nestjs/config';
import type { EnvTypes } from '@app/shared';
import {
  CreateCampaignDto,
  PreviewAudienceDto,
  PreviewSelectorsDto,
  SaveDraftDto,
  ScheduleDraftDto,
  SendEmailDto,
  TestSendDto,
  TestToMeDto,
  UpdateDraftDto,
  UpdateTemplateDto,
  UpsertTemplateDto,
} from './dto/email.dto';
import { EmailAssetService } from './email-asset.service';
import { EmailService } from './email.service';
import { verifyResendWebhook } from './resend-webhook';

@ApiTags('Emails')
@Controller()
export class EmailController {
  constructor(
    private readonly emails: EmailService,
    private readonly assets: EmailAssetService,
    private readonly config: ConfigService<EnvTypes, true>,
  ) {}

  @ApiBearerAuth()
  @Get('admin/emails/templates')
  @RequirePermissions({ action: Action.LIST, resource: Resource.EMAIL })
  @ApiOperation({
    operationId: 'listEmailTemplates',
    summary: 'List email templates',
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
  })
  createTemplate(
    @Body() body: UpsertTemplateDto,
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
  })
  updateTemplate(@Param('id') id: string, @Body() body: UpdateTemplateDto) {
    return this.emails.updateTemplate(id, body);
  }

  @ApiBearerAuth()
  @Delete('admin/emails/templates/:id')
  @RequirePermissions({ action: Action.DELETE, resource: Resource.EMAIL })
  @ApiOperation({
    operationId: 'deleteEmailTemplate',
    summary: 'Delete email template',
  })
  removeTemplate(@Param('id') id: string) {
    return this.emails.removeTemplate(id);
  }

  @ApiBearerAuth()
  @Post('admin/emails/audience/preview')
  @RequirePermissions({ action: Action.READ, resource: Resource.EMAIL })
  @ApiOperation({
    operationId: 'previewEmailAudience',
    summary: 'Preview recipient count',
    description:
      'Counts recipients after suppression, marketing opt-in, and duplicate exclusions.',
  })
  preview(@Body() body: PreviewAudienceDto) {
    return this.emails.preview(body);
  }

  @ApiBearerAuth()
  @Post('admin/emails/recipients/preview')
  @RequirePermissions({ action: Action.READ, resource: Resource.EMAIL })
  @ApiOperation({
    operationId: 'previewEmailRecipients',
    summary: 'Preview merged recipients',
    description:
      'Merges selectors (allPaid, course:<courseId>, ageGroup:<range>, student:<enrollmentId or email>), de-duplicates by email, and returns the count plus a sample.',
  })
  previewRecipients(@Body() body: PreviewSelectorsDto) {
    return this.emails.previewSelectors(body);
  }

  @ApiBearerAuth()
  @Get('admin/emails/students/search')
  @RequirePermissions({ action: Action.READ, resource: Resource.EMAIL })
  @ApiOperation({
    operationId: 'searchEmailStudents',
    summary: 'Search students for the To field',
    description:
      'Matches name or email. Each item includes email and the course titles on that enrollment.',
  })
  searchStudents(@Query('q') q = '', @Query('limit') limit?: string) {
    return this.emails.searchStudents(q, limit);
  }

  @ApiBearerAuth()
  @Get('admin/emails/drafts')
  @RequirePermissions({ action: Action.LIST, resource: Resource.EMAIL })
  @ApiOperation({ operationId: 'listEmailDrafts', summary: 'List drafts' })
  listDrafts() {
    return this.emails.listDrafts();
  }

  @ApiBearerAuth()
  @Post('admin/emails/drafts')
  @RequirePermissions({ action: Action.CREATE, resource: Resource.EMAIL })
  @ApiOperation({
    operationId: 'saveEmailDraft',
    summary: 'Save a draft',
  })
  saveDraft(@Body() body: SaveDraftDto, @CurrentUser('sub') userId: string) {
    return this.emails.saveDraft(body, userId);
  }

  @ApiBearerAuth()
  @Get('admin/emails/drafts/:id')
  @RequirePermissions({ action: Action.READ, resource: Resource.EMAIL })
  @ApiOperation({ operationId: 'getEmailDraft', summary: 'Get a draft' })
  getDraft(@Param('id') id: string) {
    return this.emails.getDraft(id);
  }

  @ApiBearerAuth()
  @Patch('admin/emails/drafts/:id')
  @RequirePermissions({ action: Action.UPDATE, resource: Resource.EMAIL })
  @ApiOperation({ operationId: 'updateEmailDraft', summary: 'Edit a draft' })
  updateDraft(@Param('id') id: string, @Body() body: UpdateDraftDto) {
    return this.emails.updateDraft(id, body);
  }

  @ApiBearerAuth()
  @Delete('admin/emails/drafts/:id')
  @RequirePermissions({ action: Action.DELETE, resource: Resource.EMAIL })
  @ApiOperation({ operationId: 'deleteEmailDraft', summary: 'Delete a draft' })
  deleteDraft(@Param('id') id: string) {
    return this.emails.deleteDraft(id);
  }

  @ApiBearerAuth()
  @Post('admin/emails/drafts/:id/schedule')
  @RequirePermissions({ action: Action.UPDATE, resource: Resource.EMAIL })
  @ApiOperation({
    operationId: 'scheduleEmailDraft',
    summary: 'Schedule a draft',
    description:
      'Stores sendAt. The scheduler enqueues the draft when that datetime is due.',
  })
  scheduleDraft(@Param('id') id: string, @Body() body: ScheduleDraftDto) {
    return this.emails.scheduleDraft(id, body);
  }

  @ApiBearerAuth()
  @Post('admin/emails/drafts/:id/send')
  @RequirePermissions({ action: Action.CREATE, resource: Resource.EMAIL })
  @ApiOperation({
    operationId: 'sendEmailDraft',
    summary: 'Send a draft now',
    description:
      'One message per recipient, single To. Does not put recipients on CC or BCC.',
  })
  sendDraft(@Param('id') id: string) {
    return this.emails.sendDraftNow(id);
  }

  @ApiBearerAuth()
  @Post('admin/emails/drafts/:id/test')
  @RequirePermissions({ action: Action.CREATE, resource: Resource.EMAIL })
  @ApiOperation({
    operationId: 'testEmailDraftToMe',
    summary: 'Send this draft to me',
    description: 'Sends only to the logged-in admin email.',
  })
  testDraft(@Param('id') id: string, @CurrentUser('email') email: string) {
    return this.emails.sendDraftTest(id, email);
  }

  @ApiBearerAuth()
  @Post('admin/emails/test-to-me')
  @RequirePermissions({ action: Action.CREATE, resource: Resource.EMAIL })
  @ApiOperation({
    operationId: 'sendTestEmailToMe',
    summary: 'Send a test to me',
    description:
      'Sends only to the logged-in admin email. The body cannot choose another recipient.',
  })
  testToMe(@CurrentUser('email') email: string, @Body() body: TestToMeDto) {
    return this.emails.sendTestToAdmin(email, body);
  }

  @ApiBearerAuth()
  @Get('admin/emails/sent')
  @RequirePermissions({ action: Action.LIST, resource: Resource.EMAIL })
  @ApiOperation({
    operationId: 'listSentEmails',
    summary: 'List sent emails',
    description: 'Each row includes sentCount and failedCount.',
  })
  listSent() {
    return this.emails.listSent();
  }

  @ApiBearerAuth()
  @Get('admin/emails/sent/:id')
  @RequirePermissions({ action: Action.READ, resource: Resource.EMAIL })
  @ApiOperation({
    operationId: 'getSentEmail',
    summary: 'Sent email detail',
    description: 'Includes per-recipient status.',
  })
  getSent(@Param('id') id: string) {
    return this.emails.getSent(id);
  }

  @ApiBearerAuth()
  @Post('admin/emails/sent/:id/resend-failed')
  @RequirePermissions({ action: Action.UPDATE, resource: Resource.EMAIL })
  @ApiOperation({
    operationId: 'resendFailedEmails',
    summary: 'Resend to failed recipients',
  })
  resendFailed(@Param('id') id: string) {
    return this.emails.resendFailed(id);
  }

  @ApiBearerAuth()
  @Post('admin/emails/send')
  @RequirePermissions({ action: Action.CREATE, resource: Resource.EMAIL })
  @ApiOperation({
    operationId: 'sendEmail',
    summary: 'Send one email',
    description:
      'Queues a single recipient. Marketing sends require opt-in and append an unsubscribe link. Placeholders: {{firstName}} {{track}} {{amount}} {{reference}} {{cutoffDate}} {{payLink}}.',
  })
  send(@Body() body: SendEmailDto, @CurrentUser('sub') userId: string) {
    return this.emails.sendSingle(body, userId);
  }

  @ApiBearerAuth()
  @Post('admin/emails/test-send')
  @RequirePermissions({ action: Action.CREATE, resource: Resource.EMAIL })
  @ApiOperation({ operationId: 'testSendEmail', summary: 'Send a test email' })
  testSend(@Body() body: TestSendDto) {
    return this.emails.testSend(body);
  }

  @ApiBearerAuth()
  @Post('admin/emails/campaigns')
  @RequirePermissions({ action: Action.CREATE, resource: Resource.EMAIL })
  @ApiOperation({
    operationId: 'createEmailCampaign',
    summary: 'Queue a bulk campaign',
    description:
      'Creates one email_message per recipient and sends through BullMQ in batches of up to 100 via the Resend batch API.',
  })
  createCampaign(
    @Body() body: CreateCampaignDto,
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
  })
  listCampaigns() {
    return this.emails.listCampaigns();
  }

  @ApiBearerAuth()
  @Get('admin/emails/campaigns/:id')
  @RequirePermissions({ action: Action.READ, resource: Resource.EMAIL })
  @ApiOperation({ operationId: 'getEmailCampaign', summary: 'Get campaign' })
  getCampaign(@Param('id') id: string) {
    return this.emails.getCampaign(id);
  }

  @ApiBearerAuth()
  @Post('admin/emails/campaigns/:id/pause')
  @RequirePermissions({ action: Action.UPDATE, resource: Resource.EMAIL })
  @ApiOperation({
    operationId: 'pauseEmailCampaign',
    summary: 'Pause campaign',
  })
  pause(@Param('id') id: string) {
    return this.emails.pause(id);
  }

  @ApiBearerAuth()
  @Post('admin/emails/campaigns/:id/resume')
  @RequirePermissions({ action: Action.UPDATE, resource: Resource.EMAIL })
  @ApiOperation({
    operationId: 'resumeEmailCampaign',
    summary: 'Resume campaign',
  })
  resume(@Param('id') id: string) {
    return this.emails.resume(id);
  }

  @ApiBearerAuth()
  @Post('admin/emails/campaigns/:id/cancel')
  @RequirePermissions({ action: Action.UPDATE, resource: Resource.EMAIL })
  @ApiOperation({
    operationId: 'cancelEmailCampaign',
    summary: 'Cancel campaign',
  })
  cancel(@Param('id') id: string) {
    return this.emails.cancel(id);
  }

  @ApiBearerAuth()
  @Post('admin/emails/campaigns/:id/retry-failed')
  @RequirePermissions({ action: Action.UPDATE, resource: Resource.EMAIL })
  @ApiOperation({
    operationId: 'retryFailedEmailCampaign',
    summary: 'Retry failed messages',
  })
  retry(@Param('id') id: string) {
    return this.emails.retryFailed(id);
  }

  @ApiBearerAuth()
  @Get('admin/emails/messages')
  @RequirePermissions({ action: Action.LIST, resource: Resource.EMAIL })
  @ApiOperation({
    operationId: 'listEmailMessages',
    summary: 'List email messages',
  })
  messages(@Query('campaignId') campaignId?: string) {
    return this.emails.listMessages(campaignId);
  }

  @ApiBearerAuth()
  @Get('admin/emails/suppressions')
  @RequirePermissions({ action: Action.LIST, resource: Resource.EMAIL })
  @ApiOperation({
    operationId: 'listEmailSuppressions',
    summary: 'List suppressions',
  })
  suppressions() {
    return this.emails.listSuppressions();
  }

  @ApiBearerAuth()
  @Post('admin/emails/images')
  @RequirePermissions({ action: Action.CREATE, resource: Resource.EMAIL })
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: 5 * 1024 * 1024 } }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  @ApiOperation({
    operationId: 'uploadEmailImage',
    summary: 'Upload and compress an email image',
    description:
      'Validates type and size, resizes to at most 1600px, and stores the image on Cloudflare R2.',
  })
  uploadImage(
    @UploadedFile()
    file?: {
      buffer: Buffer;
      originalname: string;
      mimetype: string;
      size: number;
    },
  ) {
    return this.assets.uploadImage(file);
  }

  @ApiBearerAuth()
  @Post('admin/emails/attachments')
  @RequirePermissions({ action: Action.CREATE, resource: Resource.EMAIL })
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: 10 * 1024 * 1024 } }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  @ApiOperation({
    operationId: 'uploadEmailAttachment',
    summary: 'Upload an email attachment',
  })
  uploadAttachment(
    @UploadedFile()
    file?: {
      buffer: Buffer;
      originalname: string;
      mimetype: string;
      size: number;
    },
  ) {
    return this.assets.uploadAttachment(file);
  }

  @Public()
  @UseGuards(PublicEndpointThrottlerGuard)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Get('enter-first/unsubscribe')
  @ApiOperation({
    operationId: 'unsubscribeEnterFirstGet',
    summary: 'Unsubscribe (signed token)',
  })
  unsubscribeGet(@Query('token') token: string) {
    return this.emails.unsubscribe(token ?? '');
  }

  @Public()
  @UseGuards(PublicEndpointThrottlerGuard)
  @Post('enter-first/unsubscribe')
  @ApiOperation({
    operationId: 'unsubscribeEnterFirst',
    summary: 'Unsubscribe (signed token)',
  })
  unsubscribePost(
    @Body() body: { token?: string },
    @Query('token') token?: string,
  ) {
    return this.emails.unsubscribe(body?.token || token || '');
  }

  @Public()
  @Post('webhooks/resend')
  @ApiOperation({
    operationId: 'handleResendWebhook',
    summary: 'Resend webhook',
    description:
      'Verifies the Svix signature over the raw body, updates message delivery status, and suppresses hard bounces and complaints.',
  })
  resendWebhook(
    @Req() req: RawBodyRequest<Request>,
    @Headers() headers: Record<string, string>,
  ) {
    const secret = this.config.get('email.webhookSecret', { infer: true });
    const nodeEnv = this.config.get('nodeEnv', { infer: true });
    const valid = verifyResendWebhook({
      rawBody: req.rawBody ?? '',
      svixId: headers['svix-id'],
      svixTimestamp: headers['svix-timestamp'],
      svixSignature: headers['svix-signature'],
      secret,
    });
    if (!valid && (secret || nodeEnv === 'production')) {
      throw new UnauthorizedException('Invalid Resend webhook signature');
    }
    const body = (req.body ?? {}) as {
      type?: string;
      data?: {
        email_id?: string;
        to?: string[];
        bounce?: { type?: string };
      };
    };
    return this.emails.handleResendEvent({
      event: body.type ?? '',
      emailId: body.data?.email_id,
      email: body.data?.to?.[0],
      bounceType: body.data?.bounce?.type,
    });
  }
}
