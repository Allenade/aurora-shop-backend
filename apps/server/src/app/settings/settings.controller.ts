import { Body, Controller, Get, Patch } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Action, Resource } from '@app/shared';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { AuthService } from '../auth/auth.service';
import { ChangePasswordDto } from '../auth/dto/register.dto';
import { UserRepository } from '../user/repositories/user.repository';
import { OrderService } from '../order/order.service';
import type { JwtPayload } from '../auth/dto/auth.types';
import { UserType } from '@app/shared';

@ApiTags('Settings')
@ApiBearerAuth()
@Controller('settings')
export class SettingsController {
  constructor(
    private readonly users: UserRepository,
    private readonly auth: AuthService,
    private readonly orders: OrderService,
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
    const initials = `${user?.firstName?.[0] ?? ''}${user?.lastName?.[0] ?? ''}`.toUpperCase();
    return {
      fullName,
      email: user?.email,
      phone: user?.phone ?? '',
      companyName: user?.companyName ?? '',
      address: user?.state ?? '',
      initials: initials || 'AU',
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

  @Get('billing')
  @RequirePermissions({ action: Action.READ, resource: Resource.SETTINGS })
  @ApiOperation({
    operationId: 'getBillingSettings',
    summary: 'Get Billing',
    description: 'Paid invoices from the order ledger. No raw cards stored.',
  })
  async billing(@CurrentUser() user: JwtPayload) {
    const orders = await this.orders.listForUser(
      user.sub,
      user.type === UserType.ADMIN,
    );
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
