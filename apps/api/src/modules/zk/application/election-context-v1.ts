import {
  CIRCUIT_ID_V1,
  CIRCUIT_VERSION_V1,
  COMMITMENT_SCHEME_VERSION_V1,
  deriveElectionContextV1,
  NULLIFIER_SCHEME_VERSION_V1,
  PROTOCOL_VERSION_V1,
  TREE_DEPTH_V1,
  VOTE_ENCODING_VERSION_V1,
} from '@votaciones/zk-protocol';

import type { ElectionState } from '../../elections/domain/election.js';
import { ZkVerificationError } from '../domain/zk-errors.js';

export interface FrozenCryptographicConfigurationV1 {
  readonly circuitId: typeof CIRCUIT_ID_V1;
  readonly circuitVersion: typeof CIRCUIT_VERSION_V1;
  readonly commitmentSchemeVersion: typeof COMMITMENT_SCHEME_VERSION_V1;
  readonly electionContext: string;
  readonly nullifierSchemeVersion: typeof NULLIFIER_SCHEME_VERSION_V1;
  readonly optionMapping: readonly { readonly id: string; readonly index: number }[];
  readonly protocolVersion: typeof PROTOCOL_VERSION_V1;
  readonly treeDepth: typeof TREE_DEPTH_V1;
  readonly voteEncodingVersion: typeof VOTE_ENCODING_VERSION_V1;
}

export function freezeCryptographicConfigurationV1(
  election: ElectionState,
): FrozenCryptographicConfigurationV1 {
  if (
    election.configurationVersion < 1 ||
    election.references.protocolVersion !== PROTOCOL_VERSION_V1 ||
    election.references.circuitVersion !== CIRCUIT_VERSION_V1
  ) {
    throw new ZkVerificationError(
      'UNSUPPORTED_PROTOCOL_VERSION',
      'Election does not use the supported V1 protocol and circuit.',
    );
  }
  const optionMapping = election.options.map((option, index) => ({ id: option.id, index }));
  const manifest = {
    circuitId: CIRCUIT_ID_V1,
    circuitVersion: CIRCUIT_VERSION_V1,
    commitmentSchemeVersion: COMMITMENT_SCHEME_VERSION_V1,
    configurationVersion: election.configurationVersion,
    electionId: election.id,
    nullifierSchemeVersion: NULLIFIER_SCHEME_VERSION_V1,
    options: optionMapping,
    protocolVersion: PROTOCOL_VERSION_V1,
    treeDepth: TREE_DEPTH_V1,
    voteEncodingVersion: VOTE_ENCODING_VERSION_V1,
  } as const;
  return {
    ...manifest,
    electionContext: deriveElectionContextV1(manifest),
    optionMapping,
  };
}
