import { describe, expect, it } from 'vitest';

import { getDatabaseConfig, redactDatabaseUrl } from './database-config.js';

const validEnvironment = {
  DATABASE_MIGRATION_URL: 'postgresql://admin:secret@127.0.0.1:5432/elections',
  DATABASE_URL: 'postgresql://runtime:secret@127.0.0.1:5432/elections',
};

describe('database configuration', () => {
  it('validates URLs and applies bounded defaults', () => {
    expect(getDatabaseConfig(validEnvironment)).toMatchObject({
      connectionTimeoutMillis: 5_000,
      idleTimeoutMillis: 10_000,
      max: 10,
      statementTimeout: 5_000,
    });
  });

  it('rejects invalid pool configuration without exposing credentials', () => {
    expect(() => getDatabaseConfig({ ...validEnvironment, DB_POOL_MAX: '0' })).toThrow(
      'DB_POOL_MAX must be a positive integer',
    );
  });

  it('redacts passwords from diagnostic URLs', () => {
    const redacted = redactDatabaseUrl(validEnvironment.DATABASE_URL);
    expect(redacted).toContain('runtime:REDACTED@');
    expect(redacted).not.toContain('secret');
  });
});
