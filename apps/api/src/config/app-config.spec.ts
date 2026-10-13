import { describe, expect, it } from 'vitest';

import { getAppConfig } from './app-config.js';

const validEnvironment = {
  DATABASE_URL: 'postgresql://runtime:secret@127.0.0.1:5432/votaciones',
  VALKEY_HOST: '127.0.0.1',
  VOTACIONES_ENV: 'test',
};

describe('application configuration', () => {
  it('validates all runtime boundaries centrally', () => {
    const config = getAppConfig(validEnvironment);
    expect(config).toMatchObject({
      environment: 'test',
      http: {
        bodyLimitBytes: 262_144,
        host: '127.0.0.1',
        port: 3_000,
        trustedProxyAddresses: [],
      },
      logging: { level: 'silent', service: 'votaciones-api' },
      openApi: { enabled: false, path: 'docs' },
      observability: { metricsEnabled: false, metricsToken: '' },
      release: {
        appVersion: '0.1.0-dev',
        gitCommit: 'unknown',
        manifestDigest: 'unreleased',
      },
      voting: {
        maximumConcurrentProofs: 2,
        rateLimitMaximum: 30,
        rateLimitWindowSeconds: 60,
      },
    });
    expect(config.verification.artifactDirectory).toContain('.artifacts/verification-packages');
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

  it('requires secure administrative cookies in production', () => {
    expect(() =>
      getAppConfig({
        ...validEnvironment,
        ADMIN_COOKIE_SECURE: 'false',
        HTTP_CORS_ORIGINS: 'https://admin.example.test',
        VOTACIONES_ENV: 'production',
      }),
    ).toThrow('ADMIN_COOKIE_SECURE');
  });

  it('rejects devnet administrative credentials in production', () => {
    expect(() =>
      getAppConfig({
        ...validEnvironment,
        ADMIN_COOKIE_SECURE: 'true',
        DEVNET_ADMIN_PASSWORD: 'devnet-only-password-change-before-production',
        HTTP_CORS_ORIGINS: 'https://admin.example.test',
        VOTACIONES_ENV: 'production',
      }),
    ).toThrow('DEVNET_ADMIN');
  });

  it('requires immutable release identity in production', () => {
    expect(() =>
      getAppConfig({
        ...validEnvironment,
        ADMIN_COOKIE_SECURE: 'true',
        HTTP_CORS_ORIGINS: 'https://admin.example.test',
        VOTACIONES_ENV: 'production',
      }),
    ).toThrow('immutable release identity');
    expect(
      getAppConfig({
        ...validEnvironment,
        ADMIN_COOKIE_SECURE: 'true',
        APP_VERSION: '1.0.0-rc.1',
        GIT_COMMIT: 'a'.repeat(40),
        HTTP_CORS_ORIGINS: 'https://admin.example.test',
        RELEASE_MANIFEST_DIGEST: `sha256:${'b'.repeat(64)}`,
        VOTACIONES_ENV: 'production',
      }).release,
    ).toEqual({
      appVersion: '1.0.0-rc.1',
      gitCommit: 'a'.repeat(40),
      manifestDigest: `sha256:${'b'.repeat(64)}`,
    });
  });

  it('validates administrative session and Argon2 bounds', () => {
    expect(() =>
      getAppConfig({
        ...validEnvironment,
        ADMIN_SESSION_ABSOLUTE_SECONDS: '300',
        ADMIN_SESSION_IDLE_SECONDS: '300',
      }),
    ).toThrow('must exceed');
    expect(() => getAppConfig({ ...validEnvironment, ADMIN_ARGON2_MEMORY_KIB: '1024' })).toThrow(
      'ADMIN_ARGON2_MEMORY_KIB',
    );
  });

  it('validates public voting operational limits', () => {
    expect(() =>
      getAppConfig({ ...validEnvironment, VOTE_MAXIMUM_CONCURRENT_PROOFS: '0' }),
    ).toThrow('VOTE_MAXIMUM_CONCURRENT_PROOFS');
    expect(() => getAppConfig({ ...validEnvironment, VOTE_RATE_LIMIT_MAXIMUM: '0' })).toThrow(
      'VOTE_RATE_LIMIT_MAXIMUM',
    );
  });

  it('requires a strong metrics credential when the private endpoint is enabled', () => {
    expect(() =>
      getAppConfig({ ...validEnvironment, METRICS_AUTH_TOKEN: 'short', METRICS_ENABLED: 'true' }),
    ).toThrow('METRICS_AUTH_TOKEN');
    expect(
      getAppConfig({
        ...validEnvironment,
        METRICS_AUTH_TOKEN: 'a'.repeat(32),
        METRICS_ENABLED: 'true',
      }).observability,
    ).toEqual({ metricsEnabled: true, metricsToken: 'a'.repeat(32) });
  });

  it('accepts only explicit IP/CIDR proxy boundaries', () => {
    expect(
      getAppConfig({
        ...validEnvironment,
        HTTP_TRUST_PROXY_ADDRESSES: '127.0.0.1,10.20.0.0/16,::1',
      }).http.trustedProxyAddresses,
    ).toEqual(['127.0.0.1', '10.20.0.0/16', '::1']);
    expect(() =>
      getAppConfig({ ...validEnvironment, HTTP_TRUST_PROXY_ADDRESSES: 'loopback' }),
    ).toThrow('HTTP_TRUST_PROXY_ADDRESSES');
    expect(() =>
      getAppConfig({ ...validEnvironment, HTTP_TRUST_PROXY_ADDRESSES: '10.0.0.0/99' }),
    ).toThrow('HTTP_TRUST_PROXY_ADDRESSES');
  });
});
