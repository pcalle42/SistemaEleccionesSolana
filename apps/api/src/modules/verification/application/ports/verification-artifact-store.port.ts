export interface VerificationArtifactStore {
  putImmutable(
    electionId: string,
    resultVersion: number,
    contentDigest: string,
    files: Readonly<Record<string, string | Uint8Array>>,
  ): Promise<string>;
}
