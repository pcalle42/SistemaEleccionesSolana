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

  async readiness(): Promise<void> {
    await checkDatabaseHealth(this.pool);
    const result = await this.pool.query<{ ready: boolean }>(
      `SELECT to_regclass('election.elections') IS NOT NULL
              AND to_regclass('eligibility.eligibility_snapshots') IS NOT NULL
              AND to_regclass('voting.accepted_votes') IS NOT NULL
              AND to_regclass('result.verification_packages') IS NOT NULL AS ready`,
    );
    if (result.rows[0]?.ready !== true) {
      throw new Error('Required database migrations are not applied');
    }
  }

  async onApplicationShutdown(): Promise<void> {
    if (!this.#closed) {
      this.#closed = true;
      await this.pool.end();
    }
  }
}
