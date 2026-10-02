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
  SendEmailDto,
  TestSendDto,
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
