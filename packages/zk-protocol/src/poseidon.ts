import { buildPoseidon } from 'circomlibjs';

import {
  DOMAIN_IDENTITY_COMMITMENT_V1,
  DOMAIN_MERKLE_NODE_V1,
  DOMAIN_NULLIFIER_V1,
} from './constants.js';
import { encodeFieldElement, parseFieldElement } from './field.js';
import { parseVoterSecretV1 } from './voter-secret.js';

type SafePoseidonInstance = {
  (inputs: bigint[]): Uint8Array;
  readonly F: { toObject(value: Uint8Array): bigint };
};

let poseidonPromise: Promise<SafePoseidonInstance> | undefined;

async function poseidon(inputs: readonly bigint[]): Promise<bigint> {
  poseidonPromise ??= buildPoseidon() as Promise<SafePoseidonInstance>;
  const instance = await poseidonPromise;
  return instance.F.toObject(instance([...inputs]));
}

export async function deriveIdentityCommitmentV1(voterSecret: string): Promise<string> {
  const secret = parseVoterSecretV1(voterSecret);
  return encodeFieldElement(await poseidon([DOMAIN_IDENTITY_COMMITMENT_V1, secret]));
}

export async function deriveNullifierV1(
  voterSecret: string,
  electionContext: string,
): Promise<string> {
  const secret = parseVoterSecretV1(voterSecret);
  const context = parseFieldElement(electionContext, 'electionContext');
  return encodeFieldElement(await poseidon([DOMAIN_NULLIFIER_V1, secret, context]));
}

export async function hashMerkleNodeV1(left: string, right: string): Promise<string> {
  return encodeFieldElement(
    await poseidon([
      DOMAIN_MERKLE_NODE_V1,
      parseFieldElement(left, 'left Merkle node'),
      parseFieldElement(right, 'right Merkle node'),
    ]),
  );
}
