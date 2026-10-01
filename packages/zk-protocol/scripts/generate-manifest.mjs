import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const packageDirectory = dirname(dirname(fileURLToPath(import.meta.url)));
const artifactDirectory = join(packageDirectory, 'artifacts', 'anonymous-single-choice-v1');
const manifestPath = join(packageDirectory, 'manifests', 'anonymous-single-choice-v1.json');
const transcriptPath = join(artifactDirectory, 'setup-transcript.json');

async function digest(name) {
  return createHash('sha256')
    .update(await readFile(join(artifactDirectory, name)))
    .digest('hex');
}

const transcript = {
  environment: 'DEVNET / NOT FOR PRODUCTION',
  setupPolicy: 'single-party development setup; operating-system CSPRNG mixed with public labels',
  circom: {
    version: '2.2.3',
    linuxAmd64Sha256: '85342c7ff332d948df7c0c50ecf201e6129349aef550ce873f3c811b79fe53a3',
  },
  snarkjs: '0.7.6',
  circomlib: '2.0.5',
  powersOfTau: {
    curve: 'bn128',
    power: 14,
    sha256: await digest('devnet-pot14-final.ptau'),
  },
  phase2: {
    circuitR1csSha256: await digest('anonymous-single-choice-v1.r1cs'),
    finalZkeySha256: await digest('devnet-final.zkey'),
  },
};
await writeFile(transcriptPath, `${JSON.stringify(transcript, null, 2)}\n`);

const manifest = {
  $schema: './protocol-manifest.schema.json',
  protocolVersion: 'anonymous-single-choice-v1',
  circuitId: 'AnonymousSingleChoiceVoteV1',
  circuitVersion: '1.0.0',
  provingSystem: 'groth16',
  curve: 'bn128',
  treeDepth: 20,
  commitmentSchemeVersion: 'poseidon-bn254-v1',
  nullifierSchemeVersion: 'poseidon-election-v1',
  voteEncodingVersion: 'single-choice-index-v1',
  publicSignals: ['merkleRoot', 'nullifier', 'electionContext', 'voteChoice', 'optionCount'],
  environment: 'DEVNET / NOT FOR PRODUCTION',
  artifactDigests: {
    powersOfTauSha256: transcript.powersOfTau.sha256,
    r1csSha256: await digest('anonymous-single-choice-v1.r1cs'),
    setupTranscriptSha256: await digest('setup-transcript.json'),
    wasmSha256: await digest('anonymous-single-choice-v1.wasm'),
    zkeySha256: await digest('devnet-final.zkey'),
    verificationKeySha256: await digest('verification_key.json'),
  },
};

await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
