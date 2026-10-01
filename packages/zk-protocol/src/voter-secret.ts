import { BN254_SCALAR_FIELD } from './constants.js';
import { bytesToBigInt, encodeFieldElement, parseFieldElement, ZkProtocolError } from './field.js';

export function parseVoterSecretV1(value: string): bigint {
  const secret = parseFieldElement(value, 'voterSecret');
  if (secret === 0n) {
    throw new ZkProtocolError('INVALID_VOTER_SECRET', 'voterSecret must be non-zero.');
  }
  return secret;
}

export function generateVoterSecretV1(random = globalThis.crypto): string {
  if (!random) {
    throw new ZkProtocolError('CSPRNG_UNAVAILABLE', 'A cryptographically secure RNG is required.');
  }
  for (;;) {
    const candidateBytes = new Uint8Array(32);
    random.getRandomValues(candidateBytes);
    const candidate = bytesToBigInt(candidateBytes);
    if (candidate > 0n && candidate < BN254_SCALAR_FIELD) {
      return encodeFieldElement(candidate);
    }
  }
}
