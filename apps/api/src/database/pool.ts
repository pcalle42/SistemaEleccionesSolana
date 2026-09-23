import pg from 'pg';

import { getDatabaseConfig, toPoolConfig, type DatabaseTarget } from './config/database-config.js';

const { Pool } = pg;

export function createDatabasePool(
  target: DatabaseTarget = 'runtime',
  environment: NodeJS.ProcessEnv = process.env,
): pg.Pool {
  return new Pool(toPoolConfig(getDatabaseConfig(environment, target)));
}
