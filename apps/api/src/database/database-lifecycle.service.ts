import { Inject, Injectable, type OnApplicationShutdown } from '@nestjs/common';
import type pg from 'pg';

import { checkDatabaseHealth } from './health.js';
import { DATABASE_POOL } from './database.tokens.js';

const REQUIRED_MIGRATION_VERSION = '0011_release_schema_compatibility.sql';

@Injectable()
export class DatabaseLifecycleService implements OnApplicationShutdown {
  #closed = false;

  constructor(@Inject(DATABASE_POOL) private readonly pool: pg.Pool) {}

  async health(): Promise<void> {
    await checkDatabaseHealth(this.pool);
  }

  async readiness(): Promise<void> {
    await checkDatabaseHealth(this.pool);
    const result = await this.pool.query<{ migrationVersion: string | null; ready: boolean }>(
      `SELECT to_regclass('election.elections') IS NOT NULL
              AND to_regclass('eligibility.eligibility_snapshots') IS NOT NULL
              AND to_regclass('voting.accepted_votes') IS NOT NULL
              AND to_regclass('result.verification_packages') IS NOT NULL
              AND to_regclass('app.schema_compatibility') IS NOT NULL AS ready,
              CASE
                WHEN to_regclass('app.schema_compatibility') IS NULL THEN NULL
                ELSE (SELECT migration_version FROM app.schema_compatibility WHERE singleton = true)
              END AS "migrationVersion"`,
    );
    if (
      result.rows[0]?.ready !== true ||
      result.rows[0]?.migrationVersion !== REQUIRED_MIGRATION_VERSION
    ) {
      throw new Error('Database schema is incompatible with this release');
    }
  }

  async onApplicationShutdown(): Promise<void> {
    if (!this.#closed) {
      this.#closed = true;
      await this.pool.end();
    }
  }
}
