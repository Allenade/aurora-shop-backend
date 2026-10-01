import { Module } from '@nestjs/common';
import { AbilityFactoryService } from '../auth/ability/ability-factory.service';
import { UserModule } from '../user/user.module';
import { AccessService } from './access.service';

@Module({
  imports: [UserModule],
  providers: [AbilityFactoryService, AccessService],
  exports: [AccessService],
})
export class AccessModule {}
