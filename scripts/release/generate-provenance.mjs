import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

import { canonicalize, invariant, parseArguments, readJson, validateSchema } from './lib.mjs';

const arguments_ = parseArguments(process.argv.slice(2));
invariant(arguments_['manifest'], '--manifest is required.');
const outputPath = resolve(arguments_['output'] ?? 'artifacts/release/provenance.intoto.jsonl');
const manifest = await readJson(resolve(arguments_['manifest']));
await validateSchema(manifest, 'release/schemas/release-manifest-v1.schema.json');
const statement = {
  _type: 'https://in-toto.io/Statement/v1',
  predicate: {
    buildDefinition: {
      buildType: 'https://github.com/pcalle42/SistemaEleccionesSolana/release/v1',
      externalParameters: {
        classification: manifest.classification,
        releaseVersion: manifest.releaseVersion,
      },
      internalParameters: { workflowRef: manifest.provenance.workflowRef },
      resolvedDependencies: [
        { digest: { gitCommit: manifest.gitCommit }, uri: manifest.sourceRepository },
        { digest: { sha256: manifest.lockfileDigest.slice(7) }, uri: 'pnpm-lock.yaml' },
      ],
    },
    runDetails: {
      builder: { id: manifest.provenance.builder },
      metadata: { finishedOn: manifest.buildTimestamp },
    },
  },
  predicateType: 'https://slsa.dev/provenance/v1',
  subject: [
    {
      digest: { sha256: manifest.manifestDigest.slice(7) },
      name: `ReleaseManifestV1/${manifest.releaseVersion}`,
    },
    ...Object.entries(manifest.images).map(([name, image]) => ({
      digest: { sha256: image.digest.slice(7) },
      name,
    })),
  ],
};
await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${canonicalize(statement)}\n`, { flag: 'wx', mode: 0o640 });
process.stdout.write(`${outputPath}\n`);
