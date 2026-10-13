import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

import { canonicalize, invariant, parseArguments, readJson, validateSchema } from './lib.mjs';

const arguments_ = parseArguments(process.argv.slice(2));
invariant(['staging', 'production'].includes(arguments_['environment']), 'Invalid environment.');
invariant(arguments_['manifest'], '--manifest is required.');
invariant(arguments_['actor'], '--actor is required.');
const manifest = await readJson(resolve(arguments_['manifest']));
await validateSchema(manifest, 'release/schemas/release-manifest-v1.schema.json');
if (arguments_['environment'] === 'production') {
  invariant(manifest.classification === 'production', 'Devnet release cannot enter production.');
}
const record = {
  actor: arguments_['actor'],
  deployedAt: arguments_['deployed-at'] ?? new Date().toISOString(),
  environment: arguments_['environment'],
  images: manifest.images,
  migrationStatus: arguments_['migration-status'] ?? 'planned',
  protocols: manifest.protocols.map((protocol) => ({
    artifactManifestDigest: protocol.artifactManifestDigest,
    circuitVersion: protocol.circuitVersion,
    protocolVersion: protocol.protocolVersion,
  })),
  releaseManifestDigest: manifest.manifestDigest,
  releaseVersion: manifest.releaseVersion,
  schemaVersion: 'PromotionRecordV1',
};
await validateSchema(record, 'release/schemas/promotion-record-v1.schema.json');
const output = resolve(
  arguments_['output'] ?? `artifacts/release/promotion-${arguments_['environment']}.json`,
);
await mkdir(dirname(output), { recursive: true });
await writeFile(output, `${canonicalize(record)}\n`, { flag: 'wx', mode: 0o640 });
process.stdout.write(`${output}\n`);
