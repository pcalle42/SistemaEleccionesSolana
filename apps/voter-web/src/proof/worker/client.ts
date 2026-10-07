import type { Groth16Proof } from 'snarkjs';
import type { ProofInput, ProofWorkerResponse, WorkerArtifacts } from './messages.js';

export interface GeneratedProof {
  readonly proof: Groth16Proof;
  readonly publicSignals: readonly string[];
}

export class ProofWorkerClient {
  private worker: Worker | undefined;
  private rejectPending: ((reason: Error) => void) | undefined;

  async generate(
    artifacts: WorkerArtifacts,
    input: ProofInput,
    progress: (stage: string) => void,
  ): Promise<GeneratedProof> {
    this.cancel();
    const worker = new Worker(new URL('./proof.worker.ts', import.meta.url), {
      type: 'module',
      name: 'votaciones-proof-v1',
    });
    this.worker = worker;
    return new Promise((resolve, reject) => {
      this.rejectPending = reject;
      worker.onmessage = (event: MessageEvent<ProofWorkerResponse>) => {
        if (event.data.type === 'PROGRESS') {
          progress(event.data.stage);
          if (event.data.stage === 'ready') worker.postMessage({ type: 'GENERATE_PROOF', input });
        } else if (event.data.type === 'PROOF_READY') {
          this.worker = undefined;
          this.rejectPending = undefined;
          worker.terminate();
          resolve(event.data);
        } else if (event.data.type === 'ERROR') {
          this.worker = undefined;
          this.rejectPending = undefined;
          worker.terminate();
          reject(new Error(event.data.code));
        } else if (event.data.type === 'CANCELLED') {
          this.worker = undefined;
          this.rejectPending = undefined;
          worker.terminate();
          reject(new Error('PROOF_CANCELLED'));
        }
      };
      worker.onerror = () => {
        this.worker = undefined;
        this.rejectPending = undefined;
        worker.terminate();
        reject(new Error('PROOF_WORKER_FAILED'));
      };
      worker.postMessage({ type: 'INIT', artifacts });
    });
  }

  cancel(): void {
    if (this.worker) {
      this.worker.terminate();
      this.worker = undefined;
      this.rejectPending?.(new Error('PROOF_CANCELLED'));
      this.rejectPending = undefined;
    }
  }
}
