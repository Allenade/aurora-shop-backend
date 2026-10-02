import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import {
  Action,
  Resource,
  UserStatus,
  UserType,
  type EnvTypes,
} from '@app/shared';
import * as bcrypt from 'bcrypt';
import { Repository } from 'typeorm';
import {
  ADMIN_GRANTS,
  COMPLIANCE_MANAGER_GRANTS,
  COMPLIANCE_VIEWER_GRANTS,
  PROCUREMENT_GRANTS,
} from '../auth/grants';
import { RolePermissionEntity } from '../role/entities/role-permission.entity';
import { RoleEntity } from '../role/entities/role.entity';
import { UserRoleEntity } from '../role/entities/user-role.entity';
import { UserEntity } from '../user/entities/user.entity';

@Injectable()
export class SeedService implements OnApplicationBootstrap {
  private readonly logger = new Logger(SeedService.name);

  constructor(
    @InjectRepository(RoleEntity)
    private readonly roles: Repository<RoleEntity>,
    @InjectRepository(RolePermissionEntity)
    private readonly grants: Repository<RolePermissionEntity>,
    @InjectRepository(UserEntity)
    private readonly users: Repository<UserEntity>,
    @InjectRepository(UserRoleEntity)
    private readonly assignments: Repository<UserRoleEntity>,
    private readonly config: ConfigService<EnvTypes, true>,
  ) {}

  async onApplicationBootstrap() {
    await this.ensureAvatarColumn();
    await this.ensureDefaultShippingColumn();
    try {
      await this.seedRoles();
      await this.seedSuperAdmin();
    } catch (err) {
      this.logger.error(
        `Super admin seed failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  /** Safe for prod: add avatar_url if missing (synchronize is off in production). */
  private async ensureAvatarColumn() {
    try {
      await this.users.query(
        `ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "avatar_url" character varying`,
      );
    } catch (err) {
      this.logger.warn(
        `Could not ensure avatar_url column: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }

  /** Safe for prod: add default_shipping jsonb if missing. */
  private async ensureDefaultShippingColumn() {
    try {
      await this.users.query(
        `ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "default_shipping" jsonb`,
      );
    } catch (err) {
      this.logger.warn(
        `Could not ensure default_shipping column: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }

  private async seedRoles() {
    await this.ensureRole(
      'procurement',
      'Procurement Buyer',
      PROCUREMENT_GRANTS,
    );
    await this.ensureRole('super_admin', 'Super Admin', [
      ...ADMIN_GRANTS,
      { action: Action.MANAGE, resource: Resource.ALL },
    ]);
    await this.ensureRole(
      'compliance_viewer',
      'Compliance Viewer',
      COMPLIANCE_VIEWER_GRANTS,
    );
    await this.ensureRole(
      'compliance_manager',
      'Compliance Manager',
      COMPLIANCE_MANAGER_GRANTS,
    );
  }

  private async ensureRole(
    slug: string,
    name: string,
    grants: Array<{ action: Action; resource: Resource }>,
  ) {
    let role = await this.roles.findOne({ where: { slug } });
    if (!role) role = await this.roles.save(this.roles.create({ slug, name }));
    const existing = await this.grants.find({ where: { roleId: role.id } });
    const key = (grant: { action: Action; resource: Resource }) =>
      `${grant.action}:${grant.resource}`;
    const have = new Set(existing.map((grant) => key(grant)));
    const missing = grants.filter((grant) => !have.has(key(grant)));
    if (missing.length > 0) {
      await this.grants.save(
        missing.map((grant) =>
          this.grants.create({ roleId: role.id, ...grant }),
        ),
      );
    }
    return role;
  }

  /**
   * Creates one super admin when SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD
   * are set and that email is not already a user. Never replaces a password.
   */
  private async seedSuperAdmin() {
    const email = this.config.get('seed.adminEmail', { infer: true });
    const password = this.config.get('seed.adminPassword', { infer: true });
    if (!email || !password) {
      this.logger.warn(
        'Super admin seed skipped. Set SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD.',
      );
      return;
    }
    const existing = await this.users.findOne({ where: { email } });
    if (existing) {
      this.logger.log('Super admin already exists; password left unchanged.');
      return;
    }
    const role = await this.roles.findOne({ where: { slug: 'super_admin' } });
    if (!role) {
      this.logger.error('super_admin role is missing; admin was not created.');
      return;
    }
    const passwordHash = await bcrypt.hash(
      password,
      this.config.get('auth.saltRounds', { infer: true }),
    );
    const user = await this.users.save(
      this.users.create({
        email,
        firstName: 'Super',
        lastName: 'Admin',
        type: UserType.ADMIN,
        status: UserStatus.ACTIVE,
        emailVerified: true,
        passwordHash,
      }),
    );
    await this.assignments.save(
      this.assignments.create({ userId: user.id, roleId: role.id }),
    );
    this.logger.log('Super admin created.');
  }
}
