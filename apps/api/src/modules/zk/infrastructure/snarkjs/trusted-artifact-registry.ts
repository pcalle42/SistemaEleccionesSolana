import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

import {
  assertProtocolManifestV1,
  CIRCUIT_VERSION_V1,
  PROTOCOL_VERSION_V1,
  protocolArtifactLocationsV1,
  type ProtocolManifestV1,
} from '@votaciones/zk-protocol';

import { ZkVerificationError } from '../../domain/zk-errors.js';

export interface TrustedVerificationArtifacts {
  readonly manifest: ProtocolManifestV1;
  readonly verificationKey: unknown;
}

export interface TrustedArtifactRegistry {
  get(protocolVersion: string, circuitVersion: string): Promise<TrustedVerificationArtifacts>;
}

export class FileTrustedArtifactRegistry implements TrustedArtifactRegistry {
  private loaded: Promise<TrustedVerificationArtifacts> | undefined;

  get(protocolVersion: string, circuitVersion: string): Promise<TrustedVerificationArtifacts> {
    if (protocolVersion !== PROTOCOL_VERSION_V1 || circuitVersion !== CIRCUIT_VERSION_V1) {
      return Promise.reject(
        new ZkVerificationError(
          'UNSUPPORTED_PROTOCOL_VERSION',
          'The requested proof protocol is not supported.',
        ),
      );
    }
    this.loaded ??= this.loadV1();
    return this.loaded;
  }

  private async loadV1(): Promise<TrustedVerificationArtifacts> {
    try {
      const locations = protocolArtifactLocationsV1();
      const manifest: unknown = JSON.parse(await readFile(locations.manifest, 'utf8'));
      assertProtocolManifestV1(manifest);
      const verificationKeyBytes = await readFile(locations.verificationKey);
      const digest = createHash('sha256').update(verificationKeyBytes).digest('hex');
      if (digest !== manifest.artifactDigests.verificationKeySha256) {
        throw new Error('Verification key digest mismatch.');
      }
      const verificationKey: unknown = JSON.parse(verificationKeyBytes.toString('utf8'));
      return { manifest, verificationKey };
    } catch (error: unknown) {
      if (error instanceof ZkVerificationError) throw error;
      throw new ZkVerificationError(
        'ZK_VERIFIER_UNAVAILABLE',
        'Trusted proof verification artifacts are unavailable.',
        { cause: error },
      );
    }
  }
}
