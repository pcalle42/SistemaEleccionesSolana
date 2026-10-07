import type { Groth16Proof } from 'snarkjs';

export interface WorkerArtifacts {
  readonly baseUrl: string;
  readonly verificationKeyDigest: string;
  readonly wasmDigest: string;
  readonly zkeyDigest: string;
}
export interface ProofInput {
  readonly electionContext: string;
  readonly merklePathElements: readonly string[];
  readonly merklePathIndices: readonly number[];
  readonly merkleRoot: string;
  readonly optionCount: number;
  readonly voteChoice: number;
  readonly voterSecret: string;
}
export type ProofWorkerRequest =
  | { readonly type: 'INIT'; readonly artifacts: WorkerArtifacts }
  | { readonly type: 'GENERATE_PROOF'; readonly input: ProofInput }
  | { readonly type: 'CANCEL' };
export type ProofWorkerResponse =
  | {
      readonly type: 'PROGRESS';
      readonly stage: 'preparing' | 'generating' | 'verifying locally' | 'ready';
    }
  | {
      readonly type: 'PROOF_READY';
      readonly proof: Groth16Proof;
      readonly publicSignals: readonly string[];
    }
  | { readonly type: 'ERROR'; readonly code: string }
  | { readonly type: 'CANCELLED' };
