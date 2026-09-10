import { Body, Controller, Delete, Get, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Action, Resource, UserType } from '@app/shared';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { AuthService } from '../auth/auth.service';
import { ChangePasswordDto } from '../auth/dto/register.dto';
import { UserRepository } from '../user/repositories/user.repository';
import { OrderService } from '../order/order.service';
import type { JwtPayload } from '../auth/dto/auth.types';
import { StorageService } from '../storage/storage.service';
import { CreateUploadUrlDto } from '../storage/dto/upload.dto';
import { ShippingAddressDto } from './dto/shipping.dto';

@ApiTags('Settings')
@ApiBearerAuth()
@Controller('settings')
export class SettingsController {
  constructor(
    private readonly users: UserRepository,
    private readonly auth: AuthService,
    private readonly orders: OrderService,
    private readonly storage: StorageService,
  ) {}

  @Get('profile')
  @RequirePermissions({ action: Action.READ, resource: Resource.SETTINGS })
  @ApiOperation({
    operationId: 'getProfileSettings',
    summary: 'Get Profile',
    description: 'Current profile fields for settings.',
  })
  async profile(@CurrentUser('sub') userId: string) {
    const user = await this.users.findById(userId);
    const fullName = `${user?.firstName ?? ''} ${user?.lastName ?? ''}`.trim();
    const initials =
      `${user?.firstName?.[0] ?? ''}${user?.lastName?.[0] ?? ''}`.toUpperCase();
    return {
      fullName,
      email: user?.email,
      phone: user?.phone ?? '',
      companyName: user?.companyName ?? '',
      address: user?.state ?? '',
      initials: initials || 'AU',
      avatarUrl: user?.avatarUrl ?? null,
    };
  }

  @Patch('profile')
  @RequirePermissions({ action: Action.UPDATE, resource: Resource.SETTINGS })
  @ApiOperation({
    operationId: 'updateProfileSettings',
    summary: 'Update Profile',
    description: 'Update name, phone, and company.',
  })
  async updateProfile(
    @CurrentUser('sub') userId: string,
    @Body()
    body: {
      fullName?: string;
      phone?: string;
      companyName?: string;
      address?: string;
    },
  ) {
    const user = await this.users.findById(userId);
    if (!user) return { ok: false };
    if (body.fullName) {
      const [first, ...rest] = body.fullName.trim().split(' ');
      user.firstName = first ?? user.firstName;
      user.lastName = rest.join(' ') || user.lastName;
    }
    if (body.phone !== undefined) user.phone = body.phone;
    if (body.companyName !== undefined) user.companyName = body.companyName;
    if (body.address !== undefined) user.state = body.address;
    await this.users.save(user);
    return { ok: true };
  }

  @Post('profile/avatar/upload-url')
  @RequirePermissions({ action: Action.UPDATE, resource: Resource.SETTINGS })
  @ApiOperation({
    operationId: 'getProfileAvatarUploadUrl',
    summary: 'Get Profile Avatar Upload URL',
    description: 'Presigned R2 upload URL for profile photos (avatars folder).',
  })
  getAvatarUploadUrl(@Body() dto: CreateUploadUrlDto) {
    return this.storage.getPresignedUploadUrl({
      ...dto,
      folder: 'avatars',
    });
  }

  @Patch('profile/avatar')
  @RequirePermissions({ action: Action.UPDATE, resource: Resource.SETTINGS })
  @ApiOperation({
    operationId: 'updateProfileAvatar',
    summary: 'Update Profile Avatar',
    description:
      'Set avatar URL after upload. Deletes the previous R2 object when replacing.',
  })
  async updateAvatar(
    @CurrentUser('sub') userId: string,
    @Body() body: { avatarUrl: string },
  ) {
    const user = await this.users.findById(userId);
    if (!user) return { ok: false, avatarUrl: null };
    const nextUrl = body.avatarUrl?.trim();
    if (!nextUrl) return { ok: false, avatarUrl: user.avatarUrl ?? null };

    const previous = user.avatarUrl;
    if (previous && previous !== nextUrl) {
      await this.storage.deleteByPublicUrl(previous);
    }
    user.avatarUrl = nextUrl;
    await this.users.save(user);
    return { ok: true, avatarUrl: user.avatarUrl };
  }

  @Delete('profile/avatar')
  @RequirePermissions({ action: Action.UPDATE, resource: Resource.SETTINGS })
  @ApiOperation({
    operationId: 'deleteProfileAvatar',
    summary: 'Delete Profile Avatar',
    description:
      'Remove avatar image from storage and clear the profile photo.',
  })
  async deleteAvatar(@CurrentUser('sub') userId: string) {
    const user = await this.users.findById(userId);
    if (!user) return { ok: false };
    if (user.avatarUrl) {
      await this.storage.deleteByPublicUrl(user.avatarUrl);
      user.avatarUrl = null;
      await this.users.save(user);
    }
    return { ok: true, avatarUrl: null };
  }

  @Patch('password')
  @RequirePermissions({ action: Action.UPDATE, resource: Resource.SETTINGS })
  @ApiOperation({
    operationId: 'updateSettingsPassword',
    summary: 'Update Password',
    description: 'Change password from settings.',
  })
  updatePassword(
    @CurrentUser('sub') userId: string,
    @Body() dto: ChangePasswordDto,
  ) {
    return this.auth.changePassword(userId, dto);
  }

  @Get('notifications')
  @RequirePermissions({ action: Action.READ, resource: Resource.SETTINGS })
  @ApiOperation({
    operationId: 'getNotificationSettings',
    summary: 'Get Notifications',
    description: 'Notification preference flags.',
  })
  async notifications(@CurrentUser('sub') userId: string) {
    const user = await this.users.findById(userId);
    return (
      user?.notifications ?? {
        orderUpdates: true,
        promotionalEmails: false,
        priceAlerts: true,
        stockAlerts: true,
        newsletter: false,
      }
    );
  }

  @Patch('notifications')
  @RequirePermissions({ action: Action.UPDATE, resource: Resource.SETTINGS })
  @ApiOperation({
    operationId: 'updateNotificationSettings',
    summary: 'Update Notifications',
    description: 'Save notification preference flags.',
  })
  async updateNotifications(
    @CurrentUser('sub') userId: string,
    @Body() body: Record<string, boolean>,
  ) {
    const user = await this.users.findById(userId);
    if (!user) return { ok: false };
    user.notifications = body;
    await this.users.save(user);
    return { ok: true };
  }

  @Get('shipping')
  @RequirePermissions({ action: Action.READ, resource: Resource.SETTINGS })
  @ApiOperation({
    operationId: 'getShippingSettings',
    summary: 'Get Shipping Defaults',
    description:
      'Saved delivery address for checkout prefill. Falls back to profile name/email/phone when empty.',
  })
  async shipping(@CurrentUser('sub') userId: string) {
    const user = await this.users.findById(userId);
    const saved = user?.defaultShipping;
    const fullName =
      saved?.fullName?.trim() ||
      `${user?.firstName ?? ''} ${user?.lastName ?? ''}`.trim();
    return {
      fullName,
      email: saved?.email?.trim() || user?.email || '',
      phone: saved?.phone?.trim() || user?.phone || '',
      streetAddress: saved?.streetAddress ?? '',
      city: saved?.city ?? '',
      state: saved?.state?.trim() || user?.state || '',
      note: saved?.note ?? '',
    };
  }

  @Patch('shipping')
  @RequirePermissions({ action: Action.UPDATE, resource: Resource.SETTINGS })
  @ApiOperation({
    operationId: 'updateShippingSettings',
    summary: 'Update Shipping Defaults',
    description: 'Save default delivery fields used to prefill checkout.',
  })
  async updateShipping(
    @CurrentUser('sub') userId: string,
    @Body() body: ShippingAddressDto,
  ) {
    const user = await this.users.findById(userId);
    if (!user) return { ok: false };
    user.defaultShipping = {
      fullName: body.fullName.trim(),
      email: body.email.trim().toLowerCase(),
      phone: body.phone.trim(),
      streetAddress: body.streetAddress.trim(),
      city: body.city.trim(),
      state: body.state.trim(),
      note: body.note?.trim() || undefined,
    };
    await this.users.save(user);
    return { ok: true, shipping: user.defaultShipping };
  }

  @Get('billing')
  @RequirePermissions({ action: Action.READ, resource: Resource.SETTINGS })
  @ApiOperation({
    operationId: 'getBillingSettings',
    summary: 'Get Billing',
    description: 'Paid invoices from the order ledger. No raw cards stored.',
  })
  async billing(@CurrentUser() user: JwtPayload) {
    const result = await this.orders.listForUser(
      user.sub,
      user.type === UserType.ADMIN,
    );
    const orders = Array.isArray(result) ? result : result.items;
    return {
      methods: [],
      invoices: orders
        .filter((order) => order.paymentStatus === 'Paid')
        .map((order) => ({
          id: order.id,
          date: order.date,
          amount: order.total,
          status: 'Paid',
        })),
    };
  }
}
