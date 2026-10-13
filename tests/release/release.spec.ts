import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  canonicalize,
  migrationSet,
  objectDigest,
  parseArguments,
} from '../../scripts/release/lib.mjs';

const repositoryRoot = resolve(import.meta.dirname, '../..');
let temporaryDirectory: string;
let manifestPath: string;

interface AppVersionDocument {
  appVersion: string;
  schemaVersion: string;
}

interface PackageMetadata {
  version: string;
}

interface ReleaseManifest {
  classification: string;
  manifestDigest: string;
  releaseVersion: string;
  schemaVersion: string;
}

describe('release contracts', () => {
  beforeAll(async () => {
    temporaryDirectory = await mkdtemp(join(tmpdir(), 'votaciones-release-test-'));
    manifestPath = join(temporaryDirectory, 'release-manifest.json');
    execFileSync(
      process.execPath,
      [
        'scripts/release/generate-manifest.mjs',
        '--version',
        '0.1.0-rc.1',
        '--classification',
        'devnet',
        '--inputs',
        'release/fixtures/devnet-inputs.json',
        '--output',
        manifestPath,
      ],
      { cwd: repositoryRoot, stdio: 'pipe' },
    );
  });

  afterAll(async () => {
    await rm(temporaryDirectory, { force: true, recursive: true });
  });

  it('canonicalizes keys and hashes deterministic content', () => {
    expect(canonicalize({ z: 1, a: { y: 2, b: 3 } })).toBe('{"a":{"b":3,"y":2},"z":1}');
    expect(objectDigest({ b: 2, a: 1 })).toBe(objectDigest({ a: 1, b: 2 }));
  });

  it('accepts the pnpm argument separator used by canonical commands', () => {
    expect(parseArguments(['--', '--classification', 'devnet'])).toEqual({
      classification: 'devnet',
    });
  });

  it('keeps the product SemVer separate and consistent', async () => {
    const appVersion = JSON.parse(
      await readFile(join(repositoryRoot, 'release/app-version.json'), 'utf8'),
    ) as AppVersionDocument;
    const packageMetadata = JSON.parse(
      await readFile(join(repositoryRoot, 'package.json'), 'utf8'),
    ) as PackageMetadata;
    expect(appVersion.schemaVersion).toBe('AppVersionV1');
    expect(appVersion.appVersion).toBe(packageMetadata.version);
    expect(appVersion.appVersion).not.toBe('anonymous-single-choice-v1');
  });

  it('identifies the exact reviewed migration set', async () => {
    await expect(migrationSet()).resolves.toMatchObject({
      count: 12,
      latest: '0011_release_schema_compatibility.sql',
    });
  });

  it('generates and independently verifies ReleaseManifestV1', async () => {
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as ReleaseManifest;
    expect(manifest).toMatchObject({
      classification: 'devnet',
      releaseVersion: '0.1.0-rc.1',
      schemaVersion: 'ReleaseManifestV1',
    });
    expect(manifest.manifestDigest).toMatch(/^sha256:[a-f0-9]{64}$/u);
    expect(() =>
      execFileSync(
        process.execPath,
        ['scripts/release/verify-manifest.mjs', '--manifest', manifestPath],
        { cwd: repositoryRoot, stdio: 'pipe' },
      ),
    ).not.toThrow();
  });

  it('fails closed because no production-safe ZK registry exists yet', () => {
    const result = spawnSync(
      process.execPath,
      ['scripts/release/verify-zk-registry.mjs', '--classification', 'production'],
      { cwd: repositoryRoot, encoding: 'utf8' },
    );
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('No production ZK artifacts are registered');
  });
});
