import { type EnvTypes } from '@app/shared';
import {
  ADMIN_GRANTS,
  COMPLIANCE_MANAGER_GRANTS,
  COMPLIANCE_VIEWER_GRANTS,
  PROCUREMENT_GRANTS,
} from './grants';
import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RolePermissionEntity } from '../role/entities/role-permission.entity';
import { RoleEntity } from '../role/entities/role.entity';
import { UserRoleEntity } from '../role/entities/user-role.entity';
import { RoleRepository } from '../role/repositories/role.repository';
import { UserEntity } from '../user/entities/user.entity';
import { UserRepository } from '../user/repositories/user.repository';
import { AbilityFactoryService } from './ability/ability-factory.service';
import { PiiAccessService } from './pii-access.service';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { RefreshTokenEntity } from './entities/refresh-token.entity';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { PermissionsGuard } from './guards/permissions.guard';
import { OtpStore } from './otp/otp.store';
import { RefreshTokenRepository } from './repositories/refresh-token.repository';
import { JwtStrategy } from './strategies/jwt.strategy';
import { TokenService } from './token/token.service';

@Module({
  imports: [
    PassportModule,
    TypeOrmModule.forFeature([
      UserEntity,
      RoleEntity,
      RolePermissionEntity,
      UserRoleEntity,
      RefreshTokenEntity,
    ]),
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<EnvTypes, true>) => ({
        secret: config.get('auth.jwtSecret', { infer: true }),
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    TokenService,
    AbilityFactoryService,
    PiiAccessService,
    OtpStore,
    JwtStrategy,
    UserRepository,
    RoleRepository,
    RefreshTokenRepository,
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
  ],
  exports: [
    AuthService,
    AbilityFactoryService,
    PiiAccessService,
    TokenService,
    UserRepository,
  ],
})
export class AuthModule {}

export {
  ADMIN_GRANTS,
  COMPLIANCE_MANAGER_GRANTS,
  COMPLIANCE_VIEWER_GRANTS,
  PROCUREMENT_GRANTS,
};
