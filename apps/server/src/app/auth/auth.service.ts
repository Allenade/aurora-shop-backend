import {
  BadRequestException,
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  AccessAuditAction,
  AuditLogType,
  UserStatus,
  UserType,
  type EnvTypes,
} from '@app/shared';
import * as bcrypt from 'bcrypt';
import { AuditLogService } from '../audit-log/audit-log.service';
import { RoleRepository } from '../role/repositories/role.repository';
import { UserRepository } from '../user/repositories/user.repository';
import { AbilityFactoryService } from './ability/ability-factory.service';
import type { ChangePasswordDto, RegisterDto } from './dto/register.dto';
import { OtpStore } from './otp/otp.store';
import { TokenService } from './token/token.service';

@Injectable()
export class AuthService {
  constructor(
    private readonly users: UserRepository,
    private readonly roles: RoleRepository,
    private readonly tokens: TokenService,
    private readonly abilities: AbilityFactoryService,
    private readonly otp: OtpStore,
    private readonly audit: AuditLogService,
    private readonly config: ConfigService<EnvTypes, true>,
  ) {}

  redirectFor(type: UserType) {
    return type === UserType.ADMIN ? '/admin/overview' : '/dashboard';
  }

  async login(email: string, password: string, rememberMe?: boolean) {
    const user = await this.users.findByEmail(email);
    if (!user?.passwordHash || user.status === UserStatus.SUSPENDED) {
      this.audit.log({
        type: AuditLogType.ACCESS,
        action: AccessAuditAction.LOGIN_DENIED,
        reason: 'Invalid credentials',
      });
      throw new UnauthorizedException('Invalid email or password');
    }
    if (!user.emailVerified) {
      throw new UnauthorizedException('Verify your email before signing in');
    }
    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) {
      this.audit.log({
        type: AuditLogType.ACCESS,
        action: AccessAuditAction.LOGIN_DENIED,
        userId: user.id,
      });
      throw new UnauthorizedException('Invalid email or password');
    }
    const session = await this.tokens.issueSession(user, rememberMe);
    this.audit.log({
      type: AuditLogType.ACCESS,
      action: AccessAuditAction.LOGIN,
      userId: user.id,
      decision: 'allow',
    });
    return {
      user: this.abilities.toSessionUser(user),
      redirectTo: this.redirectFor(user.type),
      ...session,
    };
  }

  async register(dto: RegisterDto) {
    if (!dto.agreeToTerms) {
      throw new BadRequestException('You must accept the terms');
    }
    const email = dto.email.trim().toLowerCase();
    const existing = await this.users.findByEmail(email);
    if (existing?.emailVerified) {
      throw new ConflictException('Email already in use');
    }
    const passwordHash = await bcrypt.hash(
      dto.password,
      this.config.get('auth.saltRounds', { infer: true }),
    );
    const code = await this.otp.issue(email, {
      ...dto,
      email,
      passwordHash,
    });
    this.audit.log({
      type: AuditLogType.ACCESS,
      action: AccessAuditAction.OTP_REQUEST,
      resourceType: 'auth:otp',
    });
    this.emitOtp(email, code);
    return { ok: true, email };
  }

  async verifyOtp(email: string, code: string) {
    const rawPayload = await this.otp.verify(email, code);
    if (!rawPayload) {
      throw new UnauthorizedException('Invalid or expired code');
    }
    const payload = rawPayload as {
      email?: string;
      passwordHash?: string;
      firstName?: string;
      lastName?: string;
      phone?: string;
      companyName?: string;
      industry?: string;
      state?: string;
    };
    const normalized = (payload.email ?? email).toLowerCase();
    let user = await this.users.findByEmail(normalized);
    if (!user) {
      user = await this.createVerifiedUser(payload);
    } else {
      user.emailVerified = true;
      await this.users.save(user);
      user = (await this.users.findByIdWithRoles(user.id))!;
    }
    const session = await this.tokens.issueSession(user);
    return {
      user: this.abilities.toSessionUser(user),
      redirectTo: this.redirectFor(user.type),
      ...session,
    };
  }

  async me(userId: string) {
    const user = await this.users.findByIdWithRoles(userId);
    if (!user) throw new UnauthorizedException('Authentication required.');
    return this.abilities.toSessionUser(user);
  }

  async changePassword(userId: string, dto: ChangePasswordDto) {
    const user = await this.users.findById(userId);
    if (!user?.passwordHash) throw new UnauthorizedException();
    const ok = await bcrypt.compare(dto.currentPassword, user.passwordHash);
    if (!ok) throw new UnauthorizedException('Current password is incorrect');
    user.passwordHash = await bcrypt.hash(
      dto.newPassword,
      this.config.get('auth.saltRounds', { infer: true }),
    );
    await this.users.save(user);
    await this.tokens.revokeAllUserTokens(user.id);
    this.audit.log({
      type: AuditLogType.ACCESS,
      action: AccessAuditAction.PASSWORD_CHANGE,
      userId: user.id,
    });
    return { ok: true };
  }

  async logout(userId: string) {
    await this.tokens.revokeAllUserTokens(userId);
    this.audit.log({
      type: AuditLogType.ACCESS,
      action: AccessAuditAction.LOGOUT,
      userId,
    });
    return { ok: true };
  }

  private async createVerifiedUser(payload: {
    email?: string;
    passwordHash?: string;
    firstName?: string;
    lastName?: string;
    phone?: string;
    companyName?: string;
    industry?: string;
    state?: string;
  }) {
    const role = await this.roles.findBySlug('procurement');
    const user = await this.users.create({
      email: payload.email ?? '',
      passwordHash: payload.passwordHash ?? '',
      firstName: payload.firstName ?? 'Buyer',
      lastName: payload.lastName ?? 'User',
      phone: payload.phone,
      companyName: payload.companyName,
      industry: payload.industry,
      state: payload.state,
      type: UserType.PROCUREMENT,
      status: UserStatus.ACTIVE,
      emailVerified: true,
      roleAssignments: role ? [{ roleId: role.id }] : [],
    });
    if (role) {
      user.roleAssignments = [
        { roleId: role.id, userId: user.id, role } as never,
      ];
      await this.users.save(user);
    }
    return (await this.users.findByIdWithRoles(user.id))!;
  }

  private emitOtp(email: string, code: string) {
    const nodeEnv = this.config.get('nodeEnv', { infer: true });
    if (nodeEnv !== 'production') {
      console.log(`[aurora-otp] ${email} → ${code}`);
    }
  }
}
