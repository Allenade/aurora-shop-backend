import { Injectable } from '@nestjs/common';
import { BaseRepository } from '@app/shared';
import { RefreshTokenEntity } from '../entities/refresh-token.entity';

@Injectable()
export class RefreshTokenRepository extends BaseRepository<RefreshTokenEntity> {
  constructor() {
    super(RefreshTokenEntity);
  }
}
