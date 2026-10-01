import { Injectable } from '@nestjs/common';
import { Action, Resource } from '@app/shared';
import { UserRepository } from '../user/repositories/user.repository';
import { AbilityFactoryService } from './ability/ability-factory.service';

@Injectable()
export class PiiAccessService {
  constructor(
    private readonly users: UserRepository,
    private readonly abilities: AbilityFactoryService,
  ) {}

  /**
   * compliance_viewer can read enrollments but cannot update them, so PII stays masked.
   * compliance_manager (UPDATE) and super_admin (MANAGE) see full values.
   */
  async shouldMaskPii(userId: string): Promise<boolean> {
    const user = await this.users.findByIdWithRoles(userId);
    if (!user) return true;
    const session = this.abilities.toSessionUser(user);
    const revealed =
      this.abilities.can(session, Action.UPDATE, Resource.ENTER_FIRST) ||
      this.abilities.can(session, Action.MANAGE, Resource.ENTER_FIRST);
    return !revealed;
  }
}
