import { describe, expect, it } from 'vitest';

import { getAppConfig } from './app-config.js';

const validEnvironment = {
  DATABASE_URL: 'postgresql://runtime:secret@127.0.0.1:5432/votaciones',
  VALKEY_HOST: '127.0.0.1',
  VOTACIONES_ENV: 'test',
};

describe('application configuration', () => {
  it('validates all runtime boundaries centrally', () => {
    expect(getAppConfig(validEnvironment)).toMatchObject({
      environment: 'test',
      http: { bodyLimitBytes: 262_144, host: '127.0.0.1', port: 3_000 },
      logging: { level: 'silent', service: 'votaciones-api' },
      openApi: { enabled: false, path: 'docs' },
    });
  });

  it('rejects unknown environments and wildcard CORS', () => {
    expect(() => getAppConfig({ ...validEnvironment, VOTACIONES_ENV: 'staging' })).toThrow(
      'VOTACIONES_ENV',
    );
    expect(() => getAppConfig({ ...validEnvironment, HTTP_CORS_ORIGINS: '*' })).toThrow('wildcard');
  });

  it('requires an explicit production CORS allowlist', () => {
    expect(() => getAppConfig({ ...validEnvironment, VOTACIONES_ENV: 'production' })).toThrow(
      'HTTP_CORS_ORIGINS',
    );
  });
});
