import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import {
  AccessAuditAction,
  AuditLogType,
  type EnvTypes,
} from '@app/shared';
import { createHash, randomBytes, randomUUID } from 'crypto';
import { IsNull } from 'typeorm';
import { AuditLogService } from '../../audit-log/audit-log.service';
import { UserEntity } from '../../user/entities/user.entity';
import type { JwtPayload } from '../dto/auth.types';
import { RefreshTokenRepository } from '../repositories/refresh-token.repository';

@Injectable()
export class TokenService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService<EnvTypes, true>,
    private readonly refreshTokenRepository: RefreshTokenRepository,
    private readonly auditLogService: AuditLogService,
  ) {}

  generateAccessToken(user: UserEntity): string {
    const payload: Omit<JwtPayload, 'iat' | 'exp'> = {
      sub: user.id,
      email: user.email,
      type: user.type,
    };
    const expiresInMs = this.configService.get('auth.jwtExpiresIn', {
      infer: true,
    });
    return this.jwtService.sign(payload, {
      expiresIn: Math.floor(expiresInMs / 1000),
    });
  }

  async generateRefreshToken(userId: string, familyId?: string, rememberMe?: boolean) {
    const rawToken = randomBytes(64).toString('hex');
    const family = familyId ?? randomUUID();
    const expiresInMs = rememberMe
      ? this.configService.get('auth.jwtRefreshRememberExpiresIn', { infer: true })
      : this.configService.get('auth.jwtRefreshExpiresIn', { infer: true });

    await this.refreshTokenRepository.create({
      userId,
      tokenHash: this.hashToken(rawToken),
      familyId: family,
      expiresAt: new Date(Date.now() + expiresInMs),
    });

    return { rawToken, familyId: family };
  }

  async issueSession(user: UserEntity, rememberMe?: boolean) {
    const accessToken = this.generateAccessToken(user);
    const { rawToken: refreshToken } = await this.generateRefreshToken(
      user.id,
      undefined,
      rememberMe,
    );
    return { accessToken, refreshToken };
  }

  async refreshTokens(rawRefreshToken: string) {
    const tokenHash = this.hashToken(rawRefreshToken);
    const existing = await this.refreshTokenRepository.findOne({
      where: { tokenHash },
      relations: ['user'],
    });

    if (!existing) {
      this.auditLogService.log({
        type: AuditLogType.ACCESS,
        action: AccessAuditAction.REFRESH,
        resourceType: 'auth:token',
        decision: 'deny',
        reason: 'Invalid refresh token',
      });
      throw new UnauthorizedException('Invalid refresh token');
    }

    if (existing.revokedAt) {
      await this.revokeTokenFamily(existing.familyId);
      this.auditLogService.log({
        type: AuditLogType.ACCESS,
        action: AccessAuditAction.REFRESH,
        userId: existing.userId,
        resourceType: 'auth:token',
        decision: 'deny',
        reason: 'Token replay detected',
      });
      throw new UnauthorizedException('Token reuse detected');
    }

    if (existing.expiresAt < new Date()) {
      throw new UnauthorizedException('Refresh token has expired');
    }

    await this.refreshTokenRepository.updateWhere(
      { id: existing.id } as any,
      { revokedAt: new Date() } as any,
    );

    const accessToken = this.generateAccessToken(existing.user);
    const { rawToken } = await this.generateRefreshToken(
      existing.user.id,
      existing.familyId,
    );

    this.auditLogService.log({
      type: AuditLogType.ACCESS,
      action: AccessAuditAction.REFRESH,
      userId: existing.user.id,
      resourceType: 'auth:token',
      decision: 'allow',
    });

    return { accessToken, refreshToken: rawToken };
  }

  async revokeAllUserTokens(userId: string) {
    await this.refreshTokenRepository.updateWhere(
      { userId, revokedAt: IsNull() } as any,
      { revokedAt: new Date() } as any,
    );
  }

  async revokeTokenFamily(familyId: string) {
    await this.refreshTokenRepository.updateWhere(
      { familyId, revokedAt: IsNull() } as any,
      { revokedAt: new Date() } as any,
    );
  }

  private hashToken(token: string) {
    return createHash('sha256').update(token).digest('hex');
  }
}
