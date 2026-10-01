import { createHash } from 'node:crypto';
import { readFile, unlink } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const packageDirectory = dirname(dirname(fileURLToPath(import.meta.url)));
const artifactDirectory = join(packageDirectory, 'artifacts', 'anonymous-single-choice-v1');
const manifest = JSON.parse(
  await readFile(join(packageDirectory, 'manifests', 'anonymous-single-choice-v1.json'), 'utf8'),
);

const files = {
  r1csSha256: 'anonymous-single-choice-v1.r1cs',
  setupTranscriptSha256: 'setup-transcript.json',
  verificationKeySha256: 'verification_key.json',
  wasmSha256: 'anonymous-single-choice-v1.wasm',
  zkeySha256: 'devnet-final.zkey',
};

for (const [digestName, fileName] of Object.entries(files)) {
  const actual = createHash('sha256')
    .update(await readFile(join(artifactDirectory, fileName)))
    .digest('hex');
  if (actual !== manifest.artifactDigests[digestName]) {
    throw new Error(`Artifact digest mismatch: ${fileName}`);
  }
}

const exportedKeyPath = join(artifactDirectory, '.verification_key.check.json');
const exportResult = spawnSync(
  'pnpm',
  [
    'exec',
    'snarkjs',
    'zkey',
    'export',
    'verificationkey',
    join(artifactDirectory, 'devnet-final.zkey'),
    exportedKeyPath,
  ],
  { cwd: packageDirectory, encoding: 'utf8' },
);
if (exportResult.status !== 0) throw new Error(exportResult.stderr || exportResult.stdout);

const trustedKey = JSON.parse(
  await readFile(join(artifactDirectory, 'verification_key.json'), 'utf8'),
);
const exportedKey = JSON.parse(await readFile(exportedKeyPath, 'utf8'));
if (JSON.stringify(trustedKey) !== JSON.stringify(exportedKey)) {
  throw new Error('verification_key.json was not derived from devnet-final.zkey');
}
await unlink(exportedKeyPath);

const ptau = join(artifactDirectory, 'devnet-pot14-final.ptau');
const ptauBytes = await readFile(ptau);
const ptauDigest = createHash('sha256').update(ptauBytes).digest('hex');
if (ptauDigest !== manifest.artifactDigests.powersOfTauSha256) {
  throw new Error('Powers of Tau digest mismatch.');
}
const verifyResult = spawnSync(
  'pnpm',
  [
    'exec',
    'snarkjs',
    'zkey',
    'verify',
    join(artifactDirectory, 'anonymous-single-choice-v1.r1cs'),
    ptau,
    join(artifactDirectory, 'devnet-final.zkey'),
  ],
  { cwd: packageDirectory, encoding: 'utf8' },
);
if (verifyResult.status !== 0) throw new Error(verifyResult.stderr || verifyResult.stdout);

console.log('Trusted devnet artifacts verified.');
