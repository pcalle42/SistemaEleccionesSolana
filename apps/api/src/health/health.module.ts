import { Module } from '@nestjs/common';

import { ZkModule } from '../modules/zk/zk.module.js';
import { HealthController } from './health.controller.js';
import { HealthService } from './health.service.js';

@Module({
  controllers: [HealthController],
  imports: [ZkModule],
  providers: [HealthService],
})
export class HealthModule {}
