import type { PoolConfig } from 'pg';

export type DatabaseTarget = 'runtime' | 'migration';

export interface DatabaseConfig {
  readonly connectionString: string;
  readonly connectionTimeoutMillis: number;
  readonly idleTimeoutMillis: number;
  readonly max: number;
  readonly statementTimeout: number;
}

const defaults = {
  connectionTimeoutMillis: 5_000,
  idleTimeoutMillis: 10_000,
  max: 10,
  statementTimeout: 5_000,
} as const;

function positiveInteger(environment: NodeJS.ProcessEnv, key: string, fallback: number): number {
  const rawValue = environment[key];
  if (rawValue === undefined) {
    return fallback;
  }

  if (!/^[1-9]\d*$/.test(rawValue)) {
    throw new Error(`${key} must be a positive integer`);
  }

  const value = Number(rawValue);
  if (!Number.isSafeInteger(value)) {
    throw new Error(`${key} is outside the supported range`);
  }

  return value;
}

export function parseDatabaseUrl(value: string | undefined, key: string): URL {
  if (!value) {
    throw new Error(`${key} is required`);
  }

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${key} must be a valid PostgreSQL URL`);
  }

  if (!['postgres:', 'postgresql:'].includes(url.protocol)) {
    throw new Error(`${key} must use the postgresql protocol`);
  }

  if (!url.username || !url.password || !url.hostname || !url.pathname || url.pathname === '/') {
    throw new Error(`${key} must include credentials, host, and database name`);
  }

  return url;
}

export function redactDatabaseUrl(value: string): string {
  try {
    const url = new URL(value);
    if (url.password) {
      url.password = 'REDACTED';
    }
    return url.toString();
  } catch {
    return '[invalid database URL]';
  }
}

export function getDatabaseConfig(
  environment: NodeJS.ProcessEnv = process.env,
  target: DatabaseTarget = 'runtime',
): DatabaseConfig {
  const key = target === 'migration' ? 'DATABASE_MIGRATION_URL' : 'DATABASE_URL';
  const url = parseDatabaseUrl(environment[key], key);

  return {
    connectionString: url.toString(),
    connectionTimeoutMillis: positiveInteger(
      environment,
      'DB_CONNECTION_TIMEOUT_MS',
      defaults.connectionTimeoutMillis,
    ),
    idleTimeoutMillis: positiveInteger(
      environment,
      'DB_IDLE_TIMEOUT_MS',
      defaults.idleTimeoutMillis,
    ),
    max: positiveInteger(environment, 'DB_POOL_MAX', defaults.max),
    statementTimeout: positiveInteger(
      environment,
      'DB_STATEMENT_TIMEOUT_MS',
      defaults.statementTimeout,
    ),
  };
}

export function toPoolConfig(config: DatabaseConfig): PoolConfig {
  return {
    application_name: 'votaciones-api',
    connectionString: config.connectionString,
    connectionTimeoutMillis: config.connectionTimeoutMillis,
    idleTimeoutMillis: config.idleTimeoutMillis,
    max: config.max,
    statement_timeout: config.statementTimeout,
  };
}
