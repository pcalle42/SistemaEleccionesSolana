import { randomUUID } from 'node:crypto';

import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createDatabase } from './client.js';
import { checkDatabaseHealth } from './health.js';
import { createDatabasePool } from './pool.js';

const runtimePool = createDatabasePool('runtime');
const migrationPool = createDatabasePool('migration');
const database = createDatabase(runtimePool);

beforeAll(async () => {
  await migrationPool.query(`
    CREATE TABLE IF NOT EXISTS app.persistence_integration_probe (
      id uuid PRIMARY KEY,
      value text NOT NULL
    );
    GRANT SELECT, INSERT ON app.persistence_integration_probe TO votaciones_runtime
  `);
});

afterAll(async () => {
  await migrationPool.query('DROP TABLE IF EXISTS app.persistence_integration_probe');
  await runtimePool.end();
  await migrationPool.end();
});

describe('PostgreSQL persistence', () => {
  it('writes and reads through Drizzle using the runtime role', async () => {
    const id = randomUUID();

    await database.transaction(async (transaction) => {
      await transaction.execute(
        sql`INSERT INTO app.persistence_integration_probe (id, value) VALUES (${id}, ${'committed'})`,
      );
    });

    const result = await database.execute<{ value: string }>(
      sql`SELECT value FROM app.persistence_integration_probe WHERE id = ${id}`,
    );
    expect(result.rows).toEqual([{ value: 'committed' }]);
  });

  it('rolls back the full transaction when work fails', async () => {
    const id = randomUUID();

    await expect(
      database.transaction(async (transaction) => {
        await transaction.execute(
          sql`INSERT INTO app.persistence_integration_probe (id, value) VALUES (${id}, ${'rolled-back'})`,
        );
        throw new Error('force rollback');
      }),
    ).rejects.toThrow('force rollback');

    const result = await database.execute<{ count: string }>(
      sql`SELECT count(*)::text AS count FROM app.persistence_integration_probe WHERE id = ${id}`,
    );
    expect(result.rows[0]?.count).toBe('0');
  });

  it('keeps the runtime role non-privileged and healthy', async () => {
    await checkDatabaseHealth(runtimePool);
    const result = await runtimePool.query<{
      can_create_in_app: boolean;
      rolcreatedb: boolean;
      rolcreaterole: boolean;
      rolsuper: boolean;
    }>(
      `SELECT
         rolsuper,
         rolcreatedb,
         rolcreaterole,
         has_schema_privilege(current_user, 'app', 'CREATE') AS can_create_in_app
       FROM pg_roles
       WHERE rolname = current_user`,
    );

    expect(result.rows[0]).toEqual({
      can_create_in_app: false,
      rolcreatedb: false,
      rolcreaterole: false,
      rolsuper: false,
    });
  });
});
