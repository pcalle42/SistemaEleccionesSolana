import { Inject, Injectable, type OnApplicationShutdown } from '@nestjs/common';
import type pg from 'pg';

import { checkDatabaseHealth } from './health.js';
import { DATABASE_POOL } from './database.tokens.js';

@Injectable()
export class DatabaseLifecycleService implements OnApplicationShutdown {
  #closed = false;

  constructor(@Inject(DATABASE_POOL) private readonly pool: pg.Pool) {}

  async health(): Promise<void> {
    await checkDatabaseHealth(this.pool);
  }

  async onApplicationShutdown(): Promise<void> {
    if (!this.#closed) {
      this.#closed = true;
      await this.pool.end();
    }
  }
}
