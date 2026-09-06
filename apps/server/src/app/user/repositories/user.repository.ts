import { Injectable } from '@nestjs/common';
import { BaseRepository } from '@app/shared';
import { UserEntity } from '../entities/user.entity';

@Injectable()
export class UserRepository extends BaseRepository<UserEntity> {
  constructor() {
    super(UserEntity);
  }

  findByEmail(email: string) {
    return this.findOne({
      where: { email: email.toLowerCase() },
      relations: {
        roleAssignments: { role: { permissions: true } },
      },
    });
  }

  findByIdWithRoles(id: string) {
    return this.findOne({
      where: { id },
      relations: {
        roleAssignments: { role: { permissions: true } },
      },
    });
  }
}
