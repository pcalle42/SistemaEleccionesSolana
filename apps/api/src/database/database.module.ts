import { Global, Module } from '@nestjs/common';
import pg from 'pg';

import { APP_CONFIG } from '../config/config.tokens.js';
import type { AppConfig } from '../config/app-config.js';
import { createDatabase } from './client.js';
import { toPoolConfig } from './config/database-config.js';
import { DatabaseLifecycleService } from './database-lifecycle.service.js';
import { DATABASE_CLIENT, DATABASE_POOL } from './database.tokens.js';

const { Pool } = pg;

@Global()
@Module({
  exports: [DATABASE_CLIENT, DATABASE_POOL, DatabaseLifecycleService],
  providers: [
    {
      inject: [APP_CONFIG],
      provide: DATABASE_POOL,
      useFactory: (config: AppConfig) => new Pool(toPoolConfig(config.database)),
    },
    {
      inject: [DATABASE_POOL],
      provide: DATABASE_CLIENT,
      useFactory: (pool: pg.Pool) => createDatabase(pool),
    },
    DatabaseLifecycleService,
  ],
})
export class DatabaseModule {}
