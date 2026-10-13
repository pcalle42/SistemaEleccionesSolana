import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';

import {
  assertDigest,
  assertSemver,
  canonicalize,
  currentGitCommit,
  currentPnpmVersion,
  fileDigest,
  invariant,
  manifestPayload,
  migrationSet,
  objectDigest,
  parseArguments,
  readJson,
  repositoryRoot,
  validateSchema,
  verifiedZkRegistry,
} from './lib.mjs';

const arguments_ = parseArguments(process.argv.slice(2));
const version = arguments_['version'];
const classification = arguments_['classification'] ?? 'devnet';
const inputsPath = arguments_['inputs'];
const outputPath = resolve(arguments_['output'] ?? 'artifacts/release/release-manifest.json');
invariant(version, '--version is required.');
invariant(inputsPath, '--inputs is required.');
assertSemver(version);

const inputs = await readJson(resolve(inputsPath));
const migrations = await migrationSet();
const zk = await verifiedZkRegistry(classification);
const compatibilityMatrixDigest = `sha256:${await fileDigest(
  join(repositoryRoot, 'release/compatibility-matrix.json'),
)}`;
for (const [name, image] of Object.entries(inputs.images ?? {})) {
  assertDigest(image.digest, `${name} image digest`);
  invariant(
    image.reference.endsWith(`@${image.digest}`),
    `${name} image reference must be pinned to its digest.`,
  );
  invariant(!image.reference.includes(':latest'), `${name} image cannot use latest.`);
}

const gitCommit = arguments_['git-commit'] ?? process.env['GITHUB_SHA'] ?? currentGitCommit();
invariant(/^[a-f0-9]{40}$/u.test(gitCommit), 'gitCommit must be a full commit SHA.');
const buildTimestamp = arguments_['build-timestamp'] ?? new Date().toISOString();
invariant(!Number.isNaN(Date.parse(buildTimestamp)), 'buildTimestamp must be ISO-8601.');

const manifest = {
  buildTimestamp,
  classification,
  compatibilityMatrixDigest,
  gitCommit,
  images: inputs.images,
  lockfileDigest: `sha256:${await fileDigest(join(repositoryRoot, 'pnpm-lock.yaml'))}`,
  manifestDigest: '',
  migrations: {
    count: migrations.count,
    latest: migrations.latest,
    setDigest: migrations.setDigest,
  },
  protocols: zk.selected.map((entry) => ({
    artifactDigests: entry.artifactDigests,
    artifactManifestDigest: entry.artifactManifestDigest,
    circuitId: entry.circuitId,
    circuitVersion: entry.circuitVersion,
    classification: entry.classification,
    productionSafe: entry.productionSafe,
    protocolVersion: entry.protocolVersion,
    verificationKeyDigest: entry.verificationKeyDigest,
  })),
  provenance: inputs.provenance,
  releaseVersion: version,
  sbomRefs: inputs.sbomRefs,
  schemaVersion: 'ReleaseManifestV1',
  securityScanRefs: inputs.securityScanRefs,
  sourceRepository: 'https://github.com/pcalle42/SistemaEleccionesSolana',
  testEvidenceRefs: inputs.testEvidenceRefs,
  toolchain: {
    nodeVersion: process.version,
    pnpmVersion: currentPnpmVersion(),
  },
};
manifest.manifestDigest = objectDigest(manifestPayload(manifest));
await validateSchema(manifest, 'release/schemas/release-manifest-v1.schema.json');
await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${canonicalize(manifest)}\n`, { flag: 'wx', mode: 0o640 });
await writeFile(`${outputPath}.sha256`, `${manifest.manifestDigest.slice('sha256:'.length)}\n`, {
  flag: 'wx',
  mode: 0o640,
});
process.stdout.write(`${outputPath}\n${manifest.manifestDigest}\n`);
