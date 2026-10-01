import { Injectable } from '@nestjs/common';
import { Action, Resource } from '@app/shared';
import { AbilityFactoryService } from '../auth/ability/ability-factory.service';
import { UserRepository } from '../user/repositories/user.repository';

@Injectable()
export class AccessService {
  constructor(
    private readonly users: UserRepository,
    private readonly abilities: AbilityFactoryService,
  ) {}

  async allows(userId: string, action: Action, resource: Resource) {
    const user = await this.users.findByIdWithRoles(userId);
    if (!user) return false;
    return this.abilities.can(
      this.abilities.toSessionUser(user),
      action,
      resource,
    );
  }

  /** compliance_viewer is read-only and must not see raw PII. */
  async canViewPii(userId: string) {
    return this.allows(userId, Action.READ, Resource.PII);
  }
}
