import { describe, expect, it } from 'vitest';

import { getValkeyConfig, redactValkeyUrl } from './valkey.config.js';

describe('Valkey configuration', () => {
  it('validates host configuration and bounded defaults', () => {
    expect(getValkeyConfig({ VALKEY_HOST: '127.0.0.1', VOTACIONES_ENV: 'test' })).toMatchObject({
      commandTimeoutMs: 1_000,
      connectTimeoutMs: 1_000,
      database: 0,
      environment: 'test',
      host: '127.0.0.1',
      maxReconnectAttempts: 3,
      port: 6379,
      tls: false,
    });
  });

  it('parses authenticated TLS URLs without logging their password', () => {
    const url = 'rediss://service:secret@example.test:6380/2?token=also-secret';
    expect(getValkeyConfig({ VALKEY_URL: url, VOTACIONES_ENV: 'production' })).toMatchObject({
      database: 2,
      host: 'example.test',
      password: 'secret',
      port: 6380,
      tls: true,
      username: 'service',
    });
    expect(redactValkeyUrl(url)).not.toContain('secret');
  });

  it('rejects unsafe namespaces and unbounded reconnects', () => {
    expect(() =>
      getValkeyConfig({ VALKEY_HOST: 'localhost', VOTACIONES_ENV: 'bad:environment' }),
    ).toThrow('VOTACIONES_ENV');
    expect(() =>
      getValkeyConfig({ VALKEY_HOST: 'localhost', VALKEY_MAX_RECONNECT_ATTEMPTS: '99' }),
    ).toThrow('VALKEY_MAX_RECONNECT_ATTEMPTS');
  });
});
