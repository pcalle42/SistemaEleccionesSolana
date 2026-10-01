import {
  BN254_BASE_FIELD,
  mapPublicSignalsV1,
  PROTOCOL_VERSION_V1,
  ZkProtocolError,
} from '@votaciones/zk-protocol';
import { groth16, type Groth16Proof } from 'snarkjs';

import type {
  VerifiedVoteProof,
  VoteProofExpectation,
  VoteProofPayload,
  VoteProofVerifier,
} from '../../application/ports/vote-proof-verifier.port.js';
import { ZkVerificationError } from '../../domain/zk-errors.js';
import type { TrustedArtifactRegistry } from './trusted-artifact-registry.js';

const MAX_PAYLOAD_BYTES = 64 * 1024;
const COORDINATE = /^(0|[1-9][0-9]{0,79})$/u;

function isCoordinate(value: unknown): value is string {
  return typeof value === 'string' && COORDINATE.test(value) && BigInt(value) < BN254_BASE_FIELD;
}

function isTuple(value: unknown, length: number): value is string[] {
  return Array.isArray(value) && value.length === length && value.every(isCoordinate);
}

function parseProof(value: unknown): Groth16Proof {
  if (typeof value !== 'object' || value === null) {
    throw new ZkVerificationError('INVALID_PROOF_FORMAT', 'Proof must be an object.');
  }
  const candidate = value as Partial<Groth16Proof>;
  const keys = Object.keys(value).sort();
  if (
    keys.join(',') !== 'curve,pi_a,pi_b,pi_c,protocol' ||
    candidate.protocol !== 'groth16' ||
    candidate.curve !== 'bn128' ||
    !isTuple(candidate.pi_a, 3) ||
    !Array.isArray(candidate.pi_b) ||
    candidate.pi_b.length !== 3 ||
    !candidate.pi_b.every((row) => isTuple(row, 2)) ||
    !isTuple(candidate.pi_c, 3)
  ) {
    throw new ZkVerificationError('INVALID_PROOF_FORMAT', 'Groth16 proof shape is invalid.');
  }
  return candidate as Groth16Proof;
}

function enforcePayloadLimit(payload: VoteProofPayload): void {
  try {
    if (Buffer.byteLength(JSON.stringify(payload), 'utf8') > MAX_PAYLOAD_BYTES) {
      throw new ZkVerificationError('INVALID_PROOF_FORMAT', 'Proof payload is too large.');
    }
  } catch (error: unknown) {
    if (error instanceof ZkVerificationError) throw error;
    throw new ZkVerificationError('INVALID_PROOF_FORMAT', 'Proof payload is not serializable.');
  }
}

export class SnarkJsVoteProofVerifier implements VoteProofVerifier {
  constructor(private readonly artifacts: TrustedArtifactRegistry) {}

  async verify(
    payload: VoteProofPayload,
    expectation: VoteProofExpectation,
  ): Promise<VerifiedVoteProof> {
    enforcePayloadLimit(payload);
    if (payload.protocolVersion !== PROTOCOL_VERSION_V1) {
      throw new ZkVerificationError(
        'UNSUPPORTED_PROTOCOL_VERSION',
        'The requested proof protocol is not supported.',
      );
    }
    const proof = parseProof(payload.proof);
    if (!Array.isArray(payload.publicSignals) || !payload.publicSignals.every(isCoordinate)) {
      throw new ZkVerificationError('INVALID_PUBLIC_SIGNALS', 'Public signals are malformed.');
    }

    let signals;
    try {
      signals = mapPublicSignalsV1(payload.publicSignals);
    } catch (error: unknown) {
      if (error instanceof ZkProtocolError) {
        throw new ZkVerificationError('INVALID_PUBLIC_SIGNALS', error.message, { cause: error });
      }
      throw error;
    }
    if (signals.merkleRoot !== expectation.merkleRoot) {
      throw new ZkVerificationError('PROOF_ROOT_MISMATCH', 'Proof uses an unexpected Merkle root.');
    }
    if (signals.electionContext !== expectation.electionContext) {
      throw new ZkVerificationError(
        'PROOF_ELECTION_CONTEXT_MISMATCH',
        'Proof uses an unexpected election context.',
      );
    }
    if (signals.optionCount !== expectation.optionCount) {
      throw new ZkVerificationError(
        'PROOF_VOTE_ENCODING_INVALID',
        'Proof uses an unexpected vote encoding.',
      );
    }

    const trusted = await this.artifacts.get(payload.protocolVersion, expectation.circuitVersion);
    let valid: boolean;
    try {
      valid = await groth16.verify(trusted.verificationKey, [...payload.publicSignals], proof);
    } catch (error: unknown) {
      throw new ZkVerificationError('PROOF_VERIFICATION_FAILED', 'Proof verification failed.', {
        cause: error,
      });
    }
    if (!valid) {
      throw new ZkVerificationError('PROOF_VERIFICATION_FAILED', 'Proof verification failed.');
    }
    return {
      circuitVersion: expectation.circuitVersion,
      protocolVersion: payload.protocolVersion,
      publicSignals: signals,
    };
  }
}
