import { readFile } from 'node:fs/promises';

import { groth16 } from 'snarkjs';
import { describe, expect, it } from 'vitest';

import { protocolArtifactLocationsV1 } from '../src/index.js';

interface TestVector {
  readonly electionContext: string;
  readonly leafIndex: number;
  readonly merklePathElements: readonly string[];
  readonly merklePathIndices: readonly number[];
  readonly merkleRoot: string;
  readonly nullifier: string;
  readonly optionCount: number;
  readonly voteChoice: number;
  readonly voterSecret: string;
}

interface VerificationKeyFixture {
  IC: unknown[];
  [key: string]: unknown;
}

function parseVerificationKey(value: string): VerificationKeyFixture {
  const parsed: unknown = JSON.parse(value);
  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    !('IC' in parsed) ||
    !Array.isArray(parsed.IC)
  ) {
    throw new Error('Invalid verification key fixture.');
  }
  return parsed as VerificationKeyFixture;
}

describe('AnonymousSingleChoiceVoteV1 Groth16', () => {
  it('proves the fixture and rejects altered proof/public signals', async () => {
    const vector = JSON.parse(
      await readFile(
        new URL('../test-vectors/anonymous-single-choice-v1.json', import.meta.url),
        'utf8',
      ),
    ) as TestVector;
    const artifacts = protocolArtifactLocationsV1();
    const verificationKey = parseVerificationKey(await readFile(artifacts.verificationKey, 'utf8'));
    const input = {
      merkleRoot: vector.merkleRoot,
      nullifier: vector.nullifier,
      electionContext: vector.electionContext,
      voteChoice: vector.voteChoice,
      optionCount: vector.optionCount,
      voterSecret: vector.voterSecret,
      merklePathElements: [...vector.merklePathElements],
      merklePathIndices: [...vector.merklePathIndices],
    };
    const { proof, publicSignals } = await groth16.fullProve(
      input,
      artifacts.wasm.pathname,
      artifacts.zkey.pathname,
    );
    expect(publicSignals).toEqual([
      vector.merkleRoot,
      vector.nullifier,
      vector.electionContext,
      String(vector.voteChoice),
      String(vector.optionCount),
    ]);
    expect(await groth16.verify(verificationKey, publicSignals, proof)).toBe(true);

    const alteredSignals = [...publicSignals];
    alteredSignals[2] = String(BigInt(alteredSignals[2]!) + 1n);
    expect(await groth16.verify(verificationKey, alteredSignals, proof)).toBe(false);

    const alteredProof = structuredClone(proof);
    alteredProof.pi_a[0] = String(BigInt(alteredProof.pi_a[0]!) + 1n);
    expect(await groth16.verify(verificationKey, publicSignals, alteredProof)).toBe(false);

    const wrongKey = structuredClone(verificationKey);
    wrongKey.IC = wrongKey.IC.slice(1);
    await expect(groth16.verify(wrongKey, publicSignals, proof)).rejects.toThrow();
  }, 60_000);

  it('fails witness generation for a non-boolean path or out-of-range choice', async () => {
    const vector = JSON.parse(
      await readFile(
        new URL('../test-vectors/anonymous-single-choice-v1.json', import.meta.url),
        'utf8',
      ),
    ) as TestVector;
    const artifacts = protocolArtifactLocationsV1();
    const base = {
      merkleRoot: vector.merkleRoot,
      nullifier: vector.nullifier,
      electionContext: vector.electionContext,
      voteChoice: vector.voteChoice,
      optionCount: vector.optionCount,
      voterSecret: vector.voterSecret,
      merklePathElements: [...vector.merklePathElements],
      merklePathIndices: [...vector.merklePathIndices],
    };
    await expect(
      groth16.fullProve(
        { ...base, merklePathIndices: [2, ...base.merklePathIndices.slice(1)] },
        artifacts.wasm.pathname,
        artifacts.zkey.pathname,
      ),
    ).rejects.toThrow();
    await expect(
      groth16.fullProve(
        { ...base, voteChoice: base.optionCount },
        artifacts.wasm.pathname,
        artifacts.zkey.pathname,
      ),
    ).rejects.toThrow();
    for (const invalidInput of [
      { ...base, voterSecret: String(BigInt(base.voterSecret) + 1n) },
      {
        ...base,
        merklePathElements: [
          String(BigInt(base.merklePathElements[0]!) + 1n),
          ...base.merklePathElements.slice(1),
        ],
      },
      { ...base, merkleRoot: String(BigInt(base.merkleRoot) + 1n) },
      { ...base, nullifier: String(BigInt(base.nullifier) + 1n) },
      { ...base, electionContext: String(BigInt(base.electionContext) + 1n) },
    ]) {
      await expect(
        groth16.fullProve(invalidInput, artifacts.wasm.pathname, artifacts.zkey.pathname),
      ).rejects.toThrow();
    }
  }, 60_000);
});
