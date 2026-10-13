import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readdir, readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import Ajv2020 from 'ajv/dist/2020.js';

export const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const sha256Pattern = /^[a-f0-9]{64}$/u;
const digestPattern = /^sha256:[a-f0-9]{64}$/u;
const semverPattern =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/u;

export function invariant(condition, message) {
  if (!condition) throw new Error(message);
}

export async function readJson(path) {
  return JSON.parse(await readFile(path, 'utf8'));
}

export function parseArguments(argv) {
  const result = {};
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    if (key === '--') continue;
    invariant(key?.startsWith('--'), `Unexpected argument: ${key ?? ''}`);
    const value = argv[index + 1];
    invariant(value && !value.startsWith('--'), `Missing value for ${key}`);
    result[key.slice(2)] = value;
    index += 1;
  }
  return result;
}

export function canonicalize(value) {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') {
    return JSON.stringify(value);
  }
  if (typeof value === 'number') {
    invariant(Number.isFinite(value), 'Canonical JSON does not support non-finite numbers.');
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(',')}]`;
  invariant(typeof value === 'object', 'Canonical JSON contains an unsupported value.');
  const entries = Object.entries(value)
    .filter(([, child]) => child !== undefined)
    .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0));
  return `{${entries
    .map(([key, child]) => `${JSON.stringify(key)}:${canonicalize(child)}`)
    .join(',')}}`;
}

export function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

export async function fileDigest(path) {
  return sha256(await readFile(path));
}

export function objectDigest(value) {
  return `sha256:${sha256(canonicalize(value))}`;
}

export function manifestPayload(manifest) {
  const payload = { ...manifest };
  delete payload.manifestDigest;
  return payload;
}

export function assertSemver(version) {
  invariant(semverPattern.test(version), `Invalid SemVer release version: ${version}`);
}

export function assertDigest(digest, label) {
  invariant(digestPattern.test(digest), `${label} must be a sha256 digest.`);
}

export function currentGitCommit() {
  return execFileSync('git', ['rev-parse', 'HEAD'], {
    cwd: repositoryRoot,
    encoding: 'utf8',
  }).trim();
}

export function currentPnpmVersion() {
  return execFileSync('pnpm', ['--version'], { encoding: 'utf8' }).trim();
}

export async function migrationSet() {
  const registryPath = join(repositoryRoot, 'release/migrations/registry.v1.json');
  const migrationDirectory = join(repositoryRoot, 'apps/api/drizzle');
  const registry = await readJson(registryPath);
  invariant(
    registry.schemaVersion === 'MigrationRegistryV1',
    'Invalid migration registry version.',
  );
  const actualFiles = (await readdir(migrationDirectory))
    .filter((file) => file.endsWith('.sql'))
    .sort();
  const registeredFiles = registry.migrations.map((migration) => migration.file);
  invariant(
    JSON.stringify(actualFiles) === JSON.stringify(registeredFiles),
    'Migration registry does not exactly match committed SQL migrations.',
  );
  const allowedRisks = new Set([
    'safe-additive',
    'requires-coordination',
    'data-migration',
    'destructive',
  ]);
  const entries = [];
  for (const migration of registry.migrations) {
    invariant(allowedRisks.has(migration.risk), `Invalid migration risk: ${migration.file}`);
    invariant(sha256Pattern.test(migration.sha256), `Invalid migration digest: ${migration.file}`);
    const actualDigest = await fileDigest(join(migrationDirectory, migration.file));
    invariant(actualDigest === migration.sha256, `Migration digest mismatch: ${migration.file}`);
    entries.push({ file: migration.file, sha256: actualDigest });
  }
  return {
    count: entries.length,
    latest: entries.at(-1)?.file,
    registry,
    setDigest: objectDigest(entries),
  };
}

export async function verifiedZkRegistry(classification) {
  invariant(['devnet', 'production'].includes(classification), 'Invalid ZK classification.');
  const registry = await readJson(join(repositoryRoot, 'release/zk/registry.v1.json'));
  invariant(registry.schemaVersion === 'ZkArtifactRegistryV1', 'Invalid ZK registry version.');
  const selected = registry.entries.filter((entry) => entry.classification === classification);
  invariant(selected.length > 0, `No ${classification} ZK artifacts are registered.`);
  for (const entry of selected) {
    if (classification === 'production') {
      invariant(
        entry.productionSafe === true,
        'Production release references unsafe ZK artifacts.',
      );
    } else {
      invariant(
        entry.productionSafe === false,
        'Devnet artifacts must remain productionSafe=false.',
      );
    }
    const manifestPath = join(repositoryRoot, entry.manifestPath);
    const manifest = await readJson(manifestPath);
    invariant(manifest.protocolVersion === entry.protocolVersion, 'ZK protocol version mismatch.');
    invariant(manifest.circuitVersion === entry.circuitVersion, 'ZK circuit version mismatch.');
    invariant(manifest.circuitId === entry.circuitId, 'ZK circuit ID mismatch.');
    invariant(
      `sha256:${await fileDigest(manifestPath)}` === entry.artifactManifestDigest,
      'ZK artifact manifest digest mismatch.',
    );
    invariant(
      canonicalize(manifest.artifactDigests) === canonicalize(entry.artifactDigests),
      'ZK artifact registry digests differ from the protocol manifest.',
    );
    const artifactDirectory = join(
      repositoryRoot,
      'packages/zk-protocol/artifacts/anonymous-single-choice-v1',
    );
    const artifactFiles = {
      powersOfTauSha256: 'devnet-pot14-final.ptau',
      r1csSha256: 'anonymous-single-choice-v1.r1cs',
      setupTranscriptSha256: 'setup-transcript.json',
      verificationKeySha256: 'verification_key.json',
      wasmSha256: 'anonymous-single-choice-v1.wasm',
      zkeySha256: 'devnet-final.zkey',
    };
    for (const [name, file] of Object.entries(artifactFiles)) {
      invariant(
        (await fileDigest(join(artifactDirectory, file))) === entry.artifactDigests[name],
        `ZK artifact digest mismatch: ${file}`,
      );
    }
    invariant(
      entry.verificationKeyDigest === `sha256:${entry.artifactDigests.verificationKeySha256}`,
      'Verification key digest mismatch.',
    );
  }
  return { registry, selected };
}

export async function validateSchema(document, schemaRelativePath) {
  const schema = await readJson(join(repositoryRoot, schemaRelativePath));
  const ajv = new Ajv2020({
    allErrors: true,
    formats: { 'date-time': true, uri: true },
    strict: true,
  });
  const validate = ajv.compile(schema);
  invariant(validate(document), `Schema validation failed: ${ajv.errorsText(validate.errors)}`);
}
