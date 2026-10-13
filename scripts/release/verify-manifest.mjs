import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

import {
  assertSemver,
  canonicalize,
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
const manifestPath = arguments_['manifest'];
invariant(manifestPath, '--manifest is required.');
const resolvedManifestPath = resolve(manifestPath);
const manifest = await readJson(resolvedManifestPath);
await validateSchema(manifest, 'release/schemas/release-manifest-v1.schema.json');
assertSemver(manifest.releaseVersion);
invariant(
  manifest.manifestDigest === objectDigest(manifestPayload(manifest)),
  'Release manifest canonical digest mismatch.',
);
const sidecar = (await readFile(`${resolvedManifestPath}.sha256`, 'utf8')).trim();
invariant(sidecar === manifest.manifestDigest.slice('sha256:'.length), 'Digest sidecar mismatch.');
if (arguments_['source-commit']) {
  invariant(manifest.gitCommit === arguments_['source-commit'], 'Source commit mismatch.');
}
invariant(
  manifest.lockfileDigest === `sha256:${await fileDigest(join(repositoryRoot, 'pnpm-lock.yaml'))}`,
  'Lockfile digest mismatch.',
);
invariant(
  manifest.compatibilityMatrixDigest ===
    `sha256:${await fileDigest(join(repositoryRoot, 'release/compatibility-matrix.json'))}`,
  'Compatibility matrix digest mismatch.',
);
const migrations = await migrationSet();
invariant(manifest.migrations.setDigest === migrations.setDigest, 'Migration set digest mismatch.');
invariant(manifest.migrations.count === migrations.count, 'Migration count mismatch.');
invariant(manifest.migrations.latest === migrations.latest, 'Latest migration mismatch.');

const zk = await verifiedZkRegistry(manifest.classification);
invariant(
  canonicalize(manifest.protocols) ===
    canonicalize(
      zk.selected.map((entry) => ({
        artifactDigests: entry.artifactDigests,
        artifactManifestDigest: entry.artifactManifestDigest,
        circuitId: entry.circuitId,
        circuitVersion: entry.circuitVersion,
        classification: entry.classification,
        productionSafe: entry.productionSafe,
        protocolVersion: entry.protocolVersion,
        verificationKeyDigest: entry.verificationKeyDigest,
      })),
    ),
  'Release protocol registry differs from trusted source.',
);
for (const [name, image] of Object.entries(manifest.images)) {
  invariant(image.reference.endsWith(`@${image.digest}`), `${name} image digest mismatch.`);
  invariant(!image.reference.includes(':latest'), `${name} image uses forbidden latest tag.`);
}
const exceptions = await readJson(
  join(repositoryRoot, 'release/security/vulnerability-exceptions.json'),
);
const now = Date.now();
for (const exception of exceptions.exceptions) {
  invariant(
    exception.id && exception.owner && exception.risk,
    'Incomplete vulnerability exception.',
  );
  invariant(
    Date.parse(exception.expiresAt) > now,
    `Expired vulnerability exception: ${exception.id}`,
  );
}
process.stdout.write(
  `${JSON.stringify(
    {
      classification: manifest.classification,
      manifestDigest: manifest.manifestDigest,
      releaseVersion: manifest.releaseVersion,
      verified: true,
    },
    null,
    2,
  )}\n`,
);
