import { Injectable } from '@nestjs/common';
import { BaseRepository } from '@app/shared';
import { RoleEntity } from '../entities/role.entity';

@Injectable()
export class RoleRepository extends BaseRepository<RoleEntity> {
  constructor() {
    super(RoleEntity);
  }

  findBySlug(slug: string) {
    return this.findOne({
      where: { slug },
      relations: { permissions: true },
    });
  }
}
