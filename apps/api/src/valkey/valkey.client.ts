import { Redis, type RedisOptions } from 'ioredis';

import type { ValkeyConfig } from './valkey.config.js';

export type ValkeyConnectionState = 'connect' | 'ready' | 'close' | 'reconnecting' | 'end';

export interface ValkeyObserver {
  connectionState?(state: ValkeyConnectionState): void;
  operation?(operation: string, outcome: string, latencyMs: number): void;
}

export function createValkeyClient(config: ValkeyConfig, observer: ValkeyObserver = {}): Redis {
  const options = {
    autoResendUnfulfilledCommands: false,
    autoResubscribe: false,
    commandTimeout: config.commandTimeoutMs,
    connectTimeout: config.connectTimeoutMs,
    connectionName: `votaciones-api-${config.environment}`,
    db: config.database,
    enableOfflineQueue: false,
    host: config.host,
    lazyConnect: true,
    maxRetriesPerRequest: 1,
    port: config.port,
    protocol: 2,
    retryStrategy: (attempt) =>
      attempt <= config.maxReconnectAttempts ? Math.min(50 * 2 ** (attempt - 1), 500) : null,
    ...(config.password ? { password: config.password } : {}),
    ...(config.tls ? { tls: {} } : {}),
    ...(config.username ? { username: config.username } : {}),
  } satisfies RedisOptions;
  const client = new Redis(options);

  client.on('error', () => {
    // The caller observes aggregate outcomes; endpoints and credentials are never logged here.
  });
  for (const state of ['connect', 'ready', 'close', 'reconnecting', 'end'] as const) {
    client.on(state, () => observer.connectionState?.(state));
  }

  return client;
}
