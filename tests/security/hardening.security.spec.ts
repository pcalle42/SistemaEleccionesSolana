import { readFile } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';

const root = new URL('../../', import.meta.url);
const source = (path: string) => readFile(new URL(path, root), 'utf8');

describe('repository security policy', () => {
  it('hardens frontend runtime containers and forbids dangerous Docker access', async () => {
    const [compose, adminDockerfile, voterDockerfile] = await Promise.all([
      source('infra/docker/compose.yml'),
      source('apps/admin-web/Dockerfile'),
      source('apps/voter-web/Dockerfile'),
    ]);

    expect(compose).not.toMatch(/^\s*privileged\s*:/mu);
    expect(compose).not.toContain('/var/run/docker.sock');
    expect(compose.match(/read_only: true/gu)).toHaveLength(2);
    expect(compose.match(/cap_drop:\n\s+- ALL/gu)).toHaveLength(2);
    expect(compose.match(/no-new-privileges:true/gu)).toHaveLength(4);
    for (const dockerfile of [adminDockerfile, voterDockerfile]) {
      expect(dockerfile).toMatch(/^USER node$/mu);
      expect(dockerfile.match(/@sha256:[a-f0-9]{64}/gu)).toHaveLength(2);
      expect(dockerfile).toContain('pnpm install --frozen-lockfile');
      expect(dockerfile).not.toMatch(
        /^\s*(?:ARG|ENV)\s+.*(?:PASSWORD|SECRET|TOKEN|PRIVATE_KEY)/imu,
      );
    }
  });

  it('publishes development data services only on loopback', async () => {
    const [local, devnet, test] = await Promise.all([
      source('infra/docker/compose.local.yml'),
      source('infra/docker/compose.devnet.yml'),
      source('infra/docker/compose.test.yml'),
    ]);
    for (const compose of [local, devnet, test]) {
      for (const port of compose.match(/^\s+- .*:\d+$/gmu) ?? []) {
        expect(port).toContain('127.0.0.1:');
      }
    }
  });

  it('keeps voter runtime CSP self-hosted and without third-party scripts', async () => {
    const server = await source('apps/voter-web/server.mjs');
    const csp = server.match(/'Content-Security-Policy': `([^`]+)`/u)?.[1];
    expect(csp).toBeDefined();
    expect(csp).toContain("script-src 'self' 'wasm-unsafe-eval'");
    expect(csp).toContain("worker-src 'self' blob:");
    expect(csp).not.toMatch(/https?:\/\//u);
    expect(server).not.toMatch(/(?:googletagmanager|google-analytics|segment|sentry)\./iu);
  });

  it('keeps CI read-only and prevents production secrets from reaching pull requests', async () => {
    const workflows = await Promise.all([
      source('.github/workflows/main.yml'),
      source('.github/workflows/pull-request.yml'),
      source('.github/workflows/security.yml'),
    ]);
    for (const workflow of workflows) {
      expect(workflow).toMatch(/permissions:\n\s+contents: read/u);
      expect(workflow).not.toContain('pull_request_target');
    }
  });
});
