export interface ValkeyConfig {
  readonly commandTimeoutMs: number;
  readonly connectTimeoutMs: number;
  readonly database: number;
  readonly environment: string;
  readonly host: string;
  readonly maxReconnectAttempts: number;
  readonly password?: string;
  readonly port: number;
  readonly tls: boolean;
  readonly username?: string;
}

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

function optional(value: string | undefined): string | undefined {
  return value === undefined || value === '' ? undefined : value;
}

function parseUrl(value: string): Partial<ValkeyConfig> {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error('VALKEY_URL must be a valid URL');
  }

  if (!['redis:', 'rediss:'].includes(url.protocol)) {
    throw new Error('VALKEY_URL must use the redis or rediss protocol');
  }
  if (!url.hostname) {
    throw new Error('VALKEY_URL must include a host');
  }

  const databasePath = url.pathname.slice(1);
  if (databasePath && !/^\d+$/.test(databasePath)) {
    throw new Error('VALKEY_URL database must be a non-negative integer');
  }
  const database = databasePath ? Number(databasePath) : 0;
  if (!Number.isSafeInteger(database) || database > 15) {
    throw new Error('VALKEY_URL database must be between 0 and 15');
  }

  const password = optional(url.password ? decodeURIComponent(url.password) : undefined);
  const username = optional(url.username ? decodeURIComponent(url.username) : undefined);

  return {
    database,
    host: url.hostname,
    ...(password ? { password } : {}),
    port: url.port ? Number(url.port) : url.protocol === 'rediss:' ? 6380 : 6379,
    tls: url.protocol === 'rediss:',
    ...(username ? { username } : {}),
  };
}

export function getValkeyConfig(environment: NodeJS.ProcessEnv = process.env): ValkeyConfig {
  const name = environment['VOTACIONES_ENV'] ?? 'local';
  if (!/^[a-z0-9][a-z0-9_-]{0,31}$/.test(name)) {
    throw new Error('VOTACIONES_ENV is not safe for a Valkey namespace');
  }

  const fromUrl = environment['VALKEY_URL'] ? parseUrl(environment['VALKEY_URL']) : {};
  const host = fromUrl.host ?? environment['VALKEY_HOST'];
  if (!host) {
    throw new Error('VALKEY_URL or VALKEY_HOST is required');
  }
  const password = fromUrl.password ?? optional(environment['VALKEY_PASSWORD']);
  const username = fromUrl.username ?? optional(environment['VALKEY_USERNAME']);

  return {
    commandTimeoutMs: integer(environment, 'VALKEY_COMMAND_TIMEOUT_MS', 1_000, 1, 60_000),
    connectTimeoutMs: integer(environment, 'VALKEY_CONNECT_TIMEOUT_MS', 1_000, 1, 60_000),
    database: fromUrl.database ?? integer(environment, 'VALKEY_DB', 0, 0, 15),
    environment: name,
    host,
    maxReconnectAttempts: integer(environment, 'VALKEY_MAX_RECONNECT_ATTEMPTS', 3, 0, 10),
    ...(password ? { password } : {}),
    port: fromUrl.port ?? integer(environment, 'VALKEY_PORT', 6379, 1, 65_535),
    tls: fromUrl.tls ?? false,
    ...(username ? { username } : {}),
  };
}

export function redactValkeyUrl(value: string): string {
  try {
    const url = new URL(value);
    if (url.password) {
      url.password = 'REDACTED';
    }
    for (const parameter of ['password', 'token', 'secret']) {
      if (url.searchParams.has(parameter)) {
        url.searchParams.set(parameter, 'REDACTED');
      }
    }
    return url.toString();
  } catch {
    return '[invalid Valkey URL]';
  }
}
