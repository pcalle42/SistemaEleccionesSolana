import type { ProtocolManifestV1 } from '@votaciones/zk-protocol';
import { canonicalDigest, sha256Hex } from '../security/digest.js';

const PROTOCOL_VERSION_V1 = 'anonymous-single-choice-v1';
const SHA256 = /^[0-9a-f]{64}$/u;

export interface ElectionManifest {
  readonly artifactDigests: Record<string, string>;
  readonly circuitVersion: string;
  readonly closesAt: string;
  readonly electionConfigurationVersion: number;
  readonly electionContext: string;
  readonly electionId: string;
  readonly manifestVersion: 'election-manifest-v1';
  readonly merkleRoot: string;
  readonly opensAt: string;
  readonly options: readonly {
    readonly encoding: number;
    readonly id: string;
    readonly label: string;
  }[];
  readonly protocolVersion: string;
  readonly title: string;
  readonly verificationKeyDigest: string;
}

export interface ElectionManifestEnvelope {
  readonly manifest: ElectionManifest;
  readonly manifestDigest: string;
}

export async function parseElectionManifest(
  value: unknown,
  electionId: string,
): Promise<ElectionManifestEnvelope> {
  if (typeof value !== 'object' || value === null) throw new Error('Manifest electoral ausente.');
  const envelope = value as Partial<ElectionManifestEnvelope>;
  const manifest = envelope.manifest;
  if (
    !manifest ||
    manifest.manifestVersion !== 'election-manifest-v1' ||
    manifest.electionId !== electionId ||
    manifest.protocolVersion !== PROTOCOL_VERSION_V1 ||
    typeof manifest.artifactDigests !== 'object' ||
    manifest.artifactDigests === null ||
    !Array.isArray(manifest.options) ||
    manifest.options.length < 2 ||
    !manifest.options.every((option: unknown, index) => {
      if (typeof option !== 'object' || option === null) return false;
      const record = option as Record<string, unknown>;
      return (
        record['encoding'] === index &&
        typeof record['id'] === 'string' &&
        typeof record['label'] === 'string' &&
        record['label'].length > 0
      );
    }) ||
    !SHA256.test(manifest.verificationKeyDigest) ||
    !Object.values(manifest.artifactDigests).every((digest) => SHA256.test(digest)) ||
    !Number.isFinite(Date.parse(manifest.opensAt)) ||
    !Number.isFinite(Date.parse(manifest.closesAt)) ||
    typeof envelope.manifestDigest !== 'string'
  )
    throw new Error('Manifest electoral incompatible.');
  const digest = await canonicalDigest(
    'votaciones/election-manifest/v1',
    manifest as unknown as Record<string, never>,
  );
  if (digest !== envelope.manifestDigest)
    throw new Error('El digest del manifest electoral no coincide.');
  return envelope as ElectionManifestEnvelope;
}

export async function parseAndValidateProtocolArtifacts(input: {
  protocolManifest: unknown;
  verificationKey: Uint8Array;
  wasm: Uint8Array;
  zkey: Uint8Array;
}): Promise<ProtocolManifestV1> {
  if (typeof input.protocolManifest !== 'object' || input.protocolManifest === null)
    throw new Error('INVALID_PROTOCOL_MANIFEST');
  const candidate = input.protocolManifest as Partial<ProtocolManifestV1>;
  if (
    candidate.protocolVersion !== PROTOCOL_VERSION_V1 ||
    candidate.circuitVersion !== '1.0.0' ||
    candidate.provingSystem !== 'groth16' ||
    !candidate.artifactDigests
  )
    throw new Error('INVALID_PROTOCOL_MANIFEST');
  const digests = candidate.artifactDigests;
  const actual = await Promise.all([
    sha256Hex(input.verificationKey),
    sha256Hex(input.wasm),
    sha256Hex(input.zkey),
  ]);
  if (
    actual[0] !== digests.verificationKeySha256 ||
    actual[1] !== digests.wasmSha256 ||
    actual[2] !== digests.zkeySha256
  ) {
    throw new Error('ARTIFACT_DIGEST_MISMATCH');
  }
  return candidate as ProtocolManifestV1;
}
