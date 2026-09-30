import { Module } from '@nestjs/common';

import { ApplicationLoggingModule } from './common/logging/logging.module.js';
import { RuntimeConfigModule } from './config/config.module.js';
import { DatabaseModule } from './database/database.module.js';
import { HealthModule } from './health/health.module.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { ElectionsModule } from './modules/elections/elections.module.js';
import { EligibilityModule } from './modules/eligibility/eligibility.module.js';
import { ValkeyNestModule } from './valkey/valkey-nest.module.js';

@Module({
  imports: [
    RuntimeConfigModule,
    ApplicationLoggingModule,
    DatabaseModule,
    ValkeyNestModule,
    HealthModule,
    AuthModule,
    ElectionsModule,
    EligibilityModule,
  ],
})
export class AppModule {}
