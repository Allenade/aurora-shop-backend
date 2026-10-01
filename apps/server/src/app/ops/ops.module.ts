import { Global, Module } from '@nestjs/common';
import { OpsHeartbeatService } from './ops-heartbeat.service';

@Global()
@Module({
  providers: [OpsHeartbeatService],
  exports: [OpsHeartbeatService],
})
export class OpsModule {}
