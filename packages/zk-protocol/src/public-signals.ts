import { PUBLIC_SIGNAL_NAMES_V1 } from './constants.js';
import type { PROTOCOL_VERSION_V1 } from './constants.js';
import { encodeFieldElement, parseFieldElement, ZkProtocolError } from './field.js';

export interface VotePublicSignalsV1 {
  readonly electionContext: string;
  readonly merkleRoot: string;
  readonly nullifier: string;
  readonly optionCount: number;
  readonly voteChoice: number;
}

function parseUint32(value: string, name: string): number {
  const field = parseFieldElement(value, name);
  if (field > 0xffff_ffffn) {
    throw new ZkProtocolError('INVALID_PUBLIC_SIGNALS', `${name} must fit in uint32.`);
  }
  return Number(field);
}

export function mapPublicSignalsV1(signals: readonly string[]): VotePublicSignalsV1 {
  if (signals.length !== PUBLIC_SIGNAL_NAMES_V1.length) {
    throw new ZkProtocolError(
      'INVALID_PUBLIC_SIGNALS',
      `Expected ${PUBLIC_SIGNAL_NAMES_V1.length} public signals.`,
    );
  }
  const voteChoice = parseUint32(signals[3]!, 'voteChoice');
  const optionCount = parseUint32(signals[4]!, 'optionCount');
  if (optionCount < 2 || voteChoice >= optionCount) {
    throw new ZkProtocolError('INVALID_PUBLIC_SIGNALS', 'Vote encoding is outside its range.');
  }
  return {
    electionContext: encodeFieldElement(parseFieldElement(signals[2]!, 'electionContext')),
    merkleRoot: encodeFieldElement(parseFieldElement(signals[0]!, 'merkleRoot')),
    nullifier: encodeFieldElement(parseFieldElement(signals[1]!, 'nullifier')),
    optionCount,
    voteChoice,
  };
}

export function encodePublicSignalsV1(signals: VotePublicSignalsV1): readonly string[] {
  const encoded = [
    signals.merkleRoot,
    signals.nullifier,
    signals.electionContext,
    String(signals.voteChoice),
    String(signals.optionCount),
  ] as const;
  mapPublicSignalsV1(encoded);
  return encoded;
}

export interface VoteProofPayloadV1 {
  readonly proof: unknown;
  readonly protocolVersion: typeof PROTOCOL_VERSION_V1;
  readonly publicSignals: readonly string[];
}
