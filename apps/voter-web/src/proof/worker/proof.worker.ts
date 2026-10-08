import { Buffer } from 'buffer';
import type { deriveNullifierV1 as DeriveNullifierV1 } from '@votaciones/zk-protocol';
import type { groth16 as Groth16 } from 'snarkjs';
import { sha256Hex } from '../../security/digest.js';
import type { ProofWorkerRequest, ProofWorkerResponse, WorkerArtifacts } from './messages.js';

const workerGlobal = globalThis as typeof globalThis & { Buffer?: typeof Buffer };
workerGlobal.Buffer ??= Buffer;

let artifactUrls: { wasm: string; zkey: string } | undefined;
let verificationKey: unknown;
let deriveNullifier: typeof DeriveNullifierV1 | undefined;
let proofSystem: typeof Groth16 | undefined;
interface WorkerScope {
  close(): void;
  onmessage: ((event: MessageEvent<ProofWorkerRequest>) => void) | null;
  postMessage(message: ProofWorkerResponse): void;
}
const scope = globalThis as unknown as WorkerScope;
const send = (message: ProofWorkerResponse) => scope.postMessage(message);

function errorCode(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  if (
    typeof error === 'object' &&
    error !== null &&
    'message' in error &&
    typeof error.message === 'string'
  )
    return error.message;
  return 'PROOF_WORKER_FAILED';
}

async function verifiedBlob(
  url: string,
  digest: string,
  type: string,
): Promise<{ bytes: Uint8Array; url: string }> {
  const response = await fetch(url, { credentials: 'omit' });
  if (!response.ok) throw new Error('ARTIFACT_DOWNLOAD_FAILED');
  const bytes = new Uint8Array(await response.arrayBuffer());
  if ((await sha256Hex(bytes)) !== digest) throw new Error('ARTIFACT_DIGEST_MISMATCH');
  return { bytes, url: URL.createObjectURL(new Blob([bytes], { type })) };
}

async function initialize(artifacts: WorkerArtifacts): Promise<void> {
  send({ type: 'PROGRESS', stage: 'preparing' });
  const [zkProtocol, snarkjs] = await Promise.all([
    import('@votaciones/zk-protocol'),
    import('snarkjs'),
  ]);
  deriveNullifier = zkProtocol.deriveNullifierV1;
  proofSystem = snarkjs.groth16;
  const base = artifacts.baseUrl.replace(/\/$/u, '');
  const manifestResponse = await fetch(`${base}/protocol-manifest.json`, { credentials: 'omit' });
  if (!manifestResponse.ok) throw new Error('PROTOCOL_MANIFEST_DOWNLOAD_FAILED');
  const protocolManifest = (await manifestResponse.json()) as {
    artifactDigests?: Record<string, string>;
    circuitVersion?: string;
    protocolVersion?: string;
  };
  if (
    protocolManifest.protocolVersion !== 'anonymous-single-choice-v1' ||
    protocolManifest.circuitVersion !== '1.0.0' ||
    protocolManifest.artifactDigests?.['verificationKeySha256'] !==
      artifacts.verificationKeyDigest ||
    protocolManifest.artifactDigests?.['wasmSha256'] !== artifacts.wasmDigest ||
    protocolManifest.artifactDigests?.['zkeySha256'] !== artifacts.zkeyDigest
  ) {
    throw new Error('PROTOCOL_MANIFEST_MISMATCH');
  }
  const [wasm, zkey, key] = await Promise.all([
    verifiedBlob(
      `${base}/anonymous-single-choice-v1.wasm`,
      artifacts.wasmDigest,
      'application/wasm',
    ),
    verifiedBlob(`${base}/devnet-final.zkey`, artifacts.zkeyDigest, 'application/octet-stream'),
    verifiedBlob(
      `${base}/verification_key.json`,
      artifacts.verificationKeyDigest,
      'application/json',
    ),
  ]);
  artifactUrls = { wasm: wasm.url, zkey: zkey.url };
  verificationKey = JSON.parse(new TextDecoder().decode(key.bytes));
  URL.revokeObjectURL(key.url);
  send({ type: 'PROGRESS', stage: 'ready' });
}

scope.onmessage = (event: MessageEvent<ProofWorkerRequest>) => {
  void (async () => {
    if (event.data.type === 'CANCEL') {
      send({ type: 'CANCELLED' });
      scope.close();
      return;
    }
    if (event.data.type === 'INIT') {
      await initialize(event.data.artifacts);
      return;
    }
    if (!artifactUrls || !verificationKey || !deriveNullifier || !proofSystem)
      throw new Error('WORKER_NOT_INITIALIZED');
    send({ type: 'PROGRESS', stage: 'generating' });
    const input = event.data.input;
    const nullifier = await deriveNullifier(input.voterSecret, input.electionContext);
    const result = await proofSystem.fullProve(
      {
        ...input,
        nullifier,
        merklePathElements: [...input.merklePathElements],
        merklePathIndices: [...input.merklePathIndices],
      },
      artifactUrls.wasm,
      artifactUrls.zkey,
    );
    send({ type: 'PROGRESS', stage: 'verifying locally' });
    if (!(await proofSystem.verify(verificationKey, result.publicSignals, result.proof)))
      throw new Error('LOCAL_PROOF_VERIFICATION_FAILED');
    send({
      type: 'PROOF_READY',
      proof: result.proof,
      publicSignals: result.publicSignals.map(String),
    });
  })().catch((error: unknown) => send({ type: 'ERROR', code: errorCode(error) }));
};
