import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { assertProtocolManifestV1, protocolArtifactLocationsV1 } from '@votaciones/zk-protocol';

const locations = protocolArtifactLocationsV1();
const manifest = JSON.parse(await readFile(locations.manifest, 'utf8'));
assertProtocolManifestV1(manifest);
if (manifest.environment !== 'DEVNET / NOT FOR PRODUCTION') {
  throw new Error('Expected the explicitly marked devnet protocol manifest.');
}

const artifactDirectory = dirname(fileURLToPath(locations.zkey));
const expectedFiles = {
  powersOfTauSha256: join(artifactDirectory, 'devnet-pot14-final.ptau'),
  r1csSha256: fileURLToPath(locations.r1cs),
  setupTranscriptSha256: join(artifactDirectory, 'setup-transcript.json'),
  verificationKeySha256: fileURLToPath(locations.verificationKey),
  wasmSha256: fileURLToPath(locations.wasm),
  zkeySha256: fileURLToPath(locations.zkey),
};

for (const [digestName, artifactPath] of Object.entries(expectedFiles)) {
  const actual = createHash('sha256')
    .update(await readFile(artifactPath))
    .digest('hex');
  if (actual !== manifest.artifactDigests[digestName]) {
    throw new Error(`ZK artifact digest mismatch: ${artifactPath}`);
  }
}

process.stdout.write('Trusted devnet ZK artifact digests verified.\n');
