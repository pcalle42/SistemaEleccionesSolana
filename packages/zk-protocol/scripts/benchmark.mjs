import { readFile, stat, unlink, writeFile } from 'node:fs/promises';
import { arch, platform, release } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';

import { groth16, wtns } from 'snarkjs';

const packageDirectory = dirname(dirname(fileURLToPath(import.meta.url)));
const artifactDirectory = join(packageDirectory, 'artifacts', 'anonymous-single-choice-v1');
const vector = JSON.parse(
  await readFile(join(packageDirectory, 'test-vectors', 'anonymous-single-choice-v1.json'), 'utf8'),
);
const wasm = join(artifactDirectory, 'anonymous-single-choice-v1.wasm');
const zkey = join(artifactDirectory, 'devnet-final.zkey');
const verificationKey = JSON.parse(
  await readFile(join(artifactDirectory, 'verification_key.json'), 'utf8'),
);
const witness = join(packageDirectory, '.cache', 'benchmark.wtns');
const input = {
  merkleRoot: vector.merkleRoot,
  nullifier: vector.nullifier,
  electionContext: vector.electionContext,
  voteChoice: vector.voteChoice,
  optionCount: vector.optionCount,
  voterSecret: vector.voterSecret,
  merklePathElements: vector.merklePathElements,
  merklePathIndices: vector.merklePathIndices,
};

let peakRssBytes = process.memoryUsage().rss;
const sampler = setInterval(() => {
  peakRssBytes = Math.max(peakRssBytes, process.memoryUsage().rss);
}, 5);

const witnessStarted = performance.now();
await wtns.calculate(input, wasm, witness);
const witnessMs = performance.now() - witnessStarted;

const proofStarted = performance.now();
const { proof, publicSignals } = await groth16.prove(zkey, witness);
const proofMs = performance.now() - proofStarted;

const verificationStarted = performance.now();
const verified = await groth16.verify(verificationKey, publicSignals, proof);
const verificationMs = performance.now() - verificationStarted;
clearInterval(sampler);
await unlink(witness);
if (!verified) throw new Error('Benchmark proof did not verify.');

const [wasmStat, zkeyStat, r1csStat] = await Promise.all([
  stat(wasm),
  stat(zkey),
  stat(join(artifactDirectory, 'anonymous-single-choice-v1.r1cs')),
]);
const report = {
  protocolVersion: 'anonymous-single-choice-v1',
  measuredAt: new Date().toISOString(),
  environment: {
    architecture: arch(),
    node: process.version,
    operatingSystem: `${platform()} ${release()}`,
  },
  circuit: {
    constraints: 5843,
    privateInputs: 41,
    publicInputs: 5,
    wires: 5864,
  },
  durationsMs: {
    proof: Number(proofMs.toFixed(2)),
    verification: Number(verificationMs.toFixed(2)),
    witness: Number(witnessMs.toFixed(2)),
  },
  sizesBytes: {
    proofJson: Buffer.byteLength(JSON.stringify(proof), 'utf8'),
    r1cs: r1csStat.size,
    wasm: wasmStat.size,
    zkey: zkeyStat.size,
  },
  peakRssBytes,
  warning: 'Single local development measurement; not a production SLA.',
};
await writeFile(
  join(artifactDirectory, 'performance.json'),
  `${JSON.stringify(report, null, 2)}\n`,
);
console.log(JSON.stringify(report, null, 2));
