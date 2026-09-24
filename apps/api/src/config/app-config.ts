import { getDatabaseConfig, type DatabaseConfig } from '../database/config/database-config.js';
import { getValkeyConfig, type ValkeyConfig } from '../valkey/valkey.config.js';

export type RuntimeEnvironment = 'local' | 'test' | 'devnet' | 'production';
export type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal' | 'silent';

export interface AppConfig {
  readonly database: DatabaseConfig;
  readonly environment: RuntimeEnvironment;
  readonly http: {
    readonly bodyLimitBytes: number;
    readonly corsOrigins: readonly string[];
    readonly host: string;
    readonly port: number;
    readonly requestTimeoutMs: number;
  };
  readonly logging: {
    readonly level: LogLevel;
    readonly service: string;
  };
  readonly openApi: {
    readonly enabled: boolean;
    readonly path: string;
  };
  readonly valkey: ValkeyConfig;
}

const environments = new Set<RuntimeEnvironment>(['local', 'test', 'devnet', 'production']);
const logLevels = new Set<LogLevel>(['trace', 'debug', 'info', 'warn', 'error', 'fatal', 'silent']);

function integer(
  environment: NodeJS.ProcessEnv,
  key: string,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  const rawValue = environment[key];
  if (rawValue === undefined || rawValue === '') {
    return fallback;
  }
  if (!/^\d+$/.test(rawValue)) {
    throw new Error(`${key} must be an integer`);
  }
  const value = Number(rawValue);
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new Error(`${key} must be between ${minimum} and ${maximum}`);
  }
  return value;
}

function boolean(environment: NodeJS.ProcessEnv, key: string, fallback: boolean): boolean {
  const value = environment[key];
  if (value === undefined || value === '') {
    return fallback;
  }
  if (value !== 'true' && value !== 'false') {
    throw new Error(`${key} must be true or false`);
  }
  return value === 'true';
}

function runtimeEnvironment(environment: NodeJS.ProcessEnv): RuntimeEnvironment {
  const value = environment['VOTACIONES_ENV'] ?? 'local';
  if (!environments.has(value as RuntimeEnvironment)) {
    throw new Error('VOTACIONES_ENV must be local, test, devnet, or production');
  }
  return value as RuntimeEnvironment;
}

function corsOrigins(environment: NodeJS.ProcessEnv, runtime: RuntimeEnvironment): string[] {
  const origins = (environment['HTTP_CORS_ORIGINS'] ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  for (const origin of origins) {
    if (origin === '*') {
      throw new Error('HTTP_CORS_ORIGINS cannot contain a wildcard');
    }
    let url: URL;
    try {
      url = new URL(origin);
    } catch {
      throw new Error('HTTP_CORS_ORIGINS must contain valid origins');
    }
    if (
      !['http:', 'https:'].includes(url.protocol) ||
      url.origin !== origin ||
      url.username ||
      url.password ||
      url.search ||
      url.hash
    ) {
      throw new Error('HTTP_CORS_ORIGINS entries must use scheme://host[:port]');
    }
  }

  if (runtime === 'production' && origins.length === 0) {
    throw new Error('HTTP_CORS_ORIGINS is required in production');
  }
  return origins;
}

function logLevel(environment: NodeJS.ProcessEnv, runtime: RuntimeEnvironment): LogLevel {
  const fallback: LogLevel = runtime === 'test' ? 'silent' : runtime === 'local' ? 'debug' : 'info';
  const value = environment['LOG_LEVEL'] ?? fallback;
  if (!logLevels.has(value as LogLevel)) {
    throw new Error('LOG_LEVEL is invalid');
  }
  return value as LogLevel;
}

export function getAppConfig(environment: NodeJS.ProcessEnv = process.env): AppConfig {
  const runtime = runtimeEnvironment(environment);
  const host = environment['APP_HOST'] ?? '127.0.0.1';
  if (!host || /\s/.test(host)) {
    throw new Error('APP_HOST is invalid');
  }

  return Object.freeze({
    database: getDatabaseConfig(environment),
    environment: runtime,
    http: Object.freeze({
      bodyLimitBytes: integer(
        environment,
        'HTTP_BODY_LIMIT_BYTES',
        256 * 1024,
        1_024,
        2 * 1024 * 1024,
      ),
      corsOrigins: Object.freeze(corsOrigins(environment, runtime)),
      host,
      port: integer(environment, 'APP_PORT', 3_000, 1, 65_535),
      requestTimeoutMs: integer(environment, 'HTTP_REQUEST_TIMEOUT_MS', 15_000, 1_000, 120_000),
    }),
    logging: Object.freeze({
      level: logLevel(environment, runtime),
      service: 'votaciones-api',
    }),
    openApi: Object.freeze({
      enabled: boolean(environment, 'OPENAPI_ENABLED', runtime === 'local' || runtime === 'devnet'),
      path: 'docs',
    }),
    valkey: getValkeyConfig(environment),
  });
}
