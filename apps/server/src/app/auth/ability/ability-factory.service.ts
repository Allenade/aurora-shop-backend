import { Injectable } from '@nestjs/common';
import { Action, Resource } from '@app/shared';
import { UserEntity } from '../../user/entities/user.entity';
import { permissionAllows } from './permission-allows';
import { buildSessionUser } from './session-user';
import type { SessionUser } from '../dto/auth.types';

@Injectable()
export class AbilityFactoryService {
  toSessionUser(user: UserEntity): SessionUser {
    return buildSessionUser(user);
  }

  can(user: SessionUser, action: Action, resource: Resource) {
    return permissionAllows(user.permissions, action, resource);
  }
}
