export interface ProtocolArtifactLocationsV1 {
  readonly manifest: URL;
  readonly r1cs: URL;
  readonly verificationKey: URL;
  readonly wasm: URL;
  readonly zkey: URL;
}

export function protocolArtifactLocationsV1(): ProtocolArtifactLocationsV1 {
  const artifactBase = new URL('../artifacts/anonymous-single-choice-v1/', import.meta.url);
  return {
    manifest: new URL('../manifests/anonymous-single-choice-v1.json', import.meta.url),
    r1cs: new URL('anonymous-single-choice-v1.r1cs', artifactBase),
    verificationKey: new URL('verification_key.json', artifactBase),
    wasm: new URL('anonymous-single-choice-v1.wasm', artifactBase),
    zkey: new URL('devnet-final.zkey', artifactBase),
  };
}
