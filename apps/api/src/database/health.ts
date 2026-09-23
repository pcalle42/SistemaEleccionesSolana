import type pg from 'pg';

export async function checkDatabaseHealth(pool: pg.Pool): Promise<void> {
  const result = await pool.query<{ healthy: number }>('SELECT 1 AS healthy');
  if (result.rows[0]?.healthy !== 1) {
    throw new Error('PostgreSQL health check returned an unexpected result');
  }
}
