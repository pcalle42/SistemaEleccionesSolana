import { describe, expect, it } from 'vitest';

import { getAppConfig } from './app-config.js';

const validEnvironment = {
  DATABASE_URL: 'postgresql://runtime:secret@127.0.0.1:5432/votaciones',
  VALKEY_HOST: '127.0.0.1',
  VOTACIONES_ENV: 'test',
};

const validProductionEnvironment = {
  ADMIN_COOKIE_SECURE: 'true',
  APP_VERSION: '1.0.0-rc.1',
  DATABASE_URL: 'postgresql://votaciones_runtime:secret@postgres.internal/votaciones',
  GIT_COMMIT: 'a'.repeat(40),
  HTTP_CORS_ORIGINS: 'https://admin.example.test,https://vote.example.test',
  HTTP_TRUST_PROXY_ADDRESSES: '10.20.0.0/16',
  METRICS_AUTH_TOKEN: 'm'.repeat(32),
  METRICS_ENABLED: 'true',
  NODE_ENV: 'production',
  PUBLIC_API_ORIGIN: 'https://api.example.test',
  RELEASE_MANIFEST_DIGEST: `sha256:${'b'.repeat(64)}`,
  VALKEY_HOST: 'valkey.internal',
  VALKEY_PASSWORD: 'production-valkey-secret',
  VERIFICATION_ARTIFACT_DIRECTORY: '/mnt/verification-packages',
  VOTACIONES_ENV: 'production',
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
        ...validProductionEnvironment,
      }).release,
    ).toEqual({
      appVersion: '1.0.0-rc.1',
      gitCommit: 'a'.repeat(40),
      manifestDigest: `sha256:${'b'.repeat(64)}`,
    });
  });

  it('accepts only an explicit hardened production runtime profile', () => {
    const config = getAppConfig(validProductionEnvironment);
    expect(config.deployment).toMatchObject({
      artifactStorageProfile: 'durable-immutable',
      protocolArtifactClassification: 'production',
      publicApiOrigin: 'https://api.example.test',
      shutdownGraceMs: 30_000,
    });
    expect(config.openApi.enabled).toBe(false);
    expect(config.observability.metricsEnabled).toBe(true);
  });

  it('rejects dev/test boundaries and migration credentials in the production API', () => {
    for (const environment of [
      { ...validProductionEnvironment, NODE_ENV: 'development' },
      { ...validProductionEnvironment, PUBLIC_API_ORIGIN: 'http://api.example.test' },
      { ...validProductionEnvironment, HTTP_TRUST_PROXY_ADDRESSES: '' },
      { ...validProductionEnvironment, OPENAPI_ENABLED: 'true' },
      { ...validProductionEnvironment, METRICS_ENABLED: 'false' },
      { ...validProductionEnvironment, PROTOCOL_ARTIFACT_CLASSIFICATION: 'devnet' },
      { ...validProductionEnvironment, VERIFICATION_ARTIFACT_STORAGE_PROFILE: 'ephemeral' },
      { ...validProductionEnvironment, VERIFICATION_ARTIFACT_DIRECTORY: 'relative/path' },
      { ...validProductionEnvironment, VALKEY_PASSWORD: '' },
      {
        ...validProductionEnvironment,
        DATABASE_MIGRATION_URL: 'postgresql://admin:secret@postgres.internal/votaciones',
      },
    ]) {
      expect(() => getAppConfig(environment)).toThrow();
    }
  });

  it('enforces explicit TLS transport policies', () => {
    expect(() =>
      getAppConfig({ ...validProductionEnvironment, DATABASE_TRANSPORT_POLICY: 'tls-required' }),
    ).toThrow('sslmode=verify-full');
    expect(() =>
      getAppConfig({ ...validProductionEnvironment, VALKEY_TRANSPORT_POLICY: 'tls-required' }),
    ).toThrow('rediss');
    expect(
      getAppConfig({
        ...validProductionEnvironment,
        DATABASE_TRANSPORT_POLICY: 'tls-required',
        DATABASE_URL:
          'postgresql://votaciones_runtime:secret@postgres.internal/votaciones?sslmode=verify-full',
        VALKEY_TRANSPORT_POLICY: 'tls-required',
        VALKEY_URL: 'rediss://runtime:secret@valkey.internal:6380/0',
      }).deployment,
    ).toMatchObject({
      databaseTransportPolicy: 'tls-required',
      valkeyTransportPolicy: 'tls-required',
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
