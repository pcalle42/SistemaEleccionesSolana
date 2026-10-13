import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { invariant, parseArguments, readJson } from './lib.mjs';

const arguments_ = parseArguments(process.argv.slice(2));
invariant(arguments_['images'], '--images is required.');
invariant(arguments_['output'], '--output is required.');
const runUrl = arguments_['run-url'] ?? 'local://release-run';
const images = await readJson(resolve(arguments_['images']));
const inputs = {
  images,
  provenance: {
    builder: arguments_['builder'] ?? 'local-release-builder',
    workflowRef: arguments_['workflow-ref'] ?? 'local',
  },
  sbomRefs: {
    adminWeb: 'sbom-admin-web.spdx.json',
    api: 'sbom-api.spdx.json',
    voterWeb: 'sbom-voter-web.spdx.json',
  },
  securityScanRefs: [`${runUrl}#dependency-and-secret-scan`, `${runUrl}#container-scans`],
  testEvidenceRefs: [`${runUrl}#release-gates`, `${runUrl}#devnet-clean-room`],
};
await writeFile(resolve(arguments_['output']), `${JSON.stringify(inputs, null, 2)}\n`, {
  flag: 'wx',
  mode: 0o640,
});
