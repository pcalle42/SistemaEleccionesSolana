import { Module } from '@nestjs/common';

import { ApplicationLoggingModule } from './common/logging/logging.module.js';
import { RuntimeConfigModule } from './config/config.module.js';
import { DatabaseModule } from './database/database.module.js';
import { HealthModule } from './health/health.module.js';
import { ValkeyNestModule } from './valkey/valkey-nest.module.js';

@Module({
  imports: [
    RuntimeConfigModule,
    ApplicationLoggingModule,
    DatabaseModule,
    ValkeyNestModule,
    HealthModule,
  ],
})
export class AppModule {}
