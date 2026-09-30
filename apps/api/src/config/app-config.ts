import { getDatabaseConfig, type DatabaseConfig } from '../database/config/database-config.js';
import { getValkeyConfig, type ValkeyConfig } from '../valkey/valkey.config.js';

export type RuntimeEnvironment = 'local' | 'test' | 'devnet' | 'production';
export type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal' | 'silent';

export interface AppConfig {
  readonly auth: {
    readonly argon2: {
      readonly memoryCostKiB: number;
      readonly parallelism: number;
      readonly timeCost: number;
    };
    readonly cookieName: string;
    readonly cookieSecure: boolean;
    readonly csrfHeaderName: string;
    readonly passwordMaximumLength: number;
    readonly passwordMinimumLength: number;
    readonly rateLimit: {
      readonly networkMaximum: number;
      readonly userMaximum: number;
      readonly windowSeconds: number;
    };
    readonly sessionAbsoluteSeconds: number;
    readonly sessionIdleSeconds: number;
  };
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
  const cookieSecure = boolean(environment, 'ADMIN_COOKIE_SECURE', runtime === 'production');
  if (runtime === 'production' && !cookieSecure) {
    throw new Error('ADMIN_COOKIE_SECURE must be true in production');
  }
  const sessionIdleSeconds = integer(
    environment,
    'ADMIN_SESSION_IDLE_SECONDS',
    15 * 60,
    60,
    60 * 60,
  );
  const sessionAbsoluteSeconds = integer(
    environment,
    'ADMIN_SESSION_ABSOLUTE_SECONDS',
    8 * 60 * 60,
    5 * 60,
    24 * 60 * 60,
  );
  if (sessionAbsoluteSeconds <= sessionIdleSeconds) {
    throw new Error('ADMIN_SESSION_ABSOLUTE_SECONDS must exceed ADMIN_SESSION_IDLE_SECONDS');
  }

  return Object.freeze({
    auth: Object.freeze({
      argon2: Object.freeze({
        memoryCostKiB: integer(environment, 'ADMIN_ARGON2_MEMORY_KIB', 19_456, 19_456, 262_144),
        parallelism: integer(environment, 'ADMIN_ARGON2_PARALLELISM', 1, 1, 4),
        timeCost: integer(environment, 'ADMIN_ARGON2_TIME_COST', 2, 2, 10),
      }),
      cookieName: cookieSecure ? '__Host-votaciones_admin_session' : 'votaciones_admin_session',
      cookieSecure,
      csrfHeaderName: 'x-csrf-token',
      passwordMaximumLength: 256,
      passwordMinimumLength: 16,
      rateLimit: Object.freeze({
        networkMaximum: integer(environment, 'ADMIN_LOGIN_NETWORK_MAXIMUM', 20, 5, 100),
        userMaximum: integer(environment, 'ADMIN_LOGIN_USER_MAXIMUM', 5, 2, 20),
        windowSeconds: integer(environment, 'ADMIN_LOGIN_WINDOW_SECONDS', 300, 60, 3_600),
      }),
      sessionAbsoluteSeconds,
      sessionIdleSeconds,
    }),
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
