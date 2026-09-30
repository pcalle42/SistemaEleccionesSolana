export interface MerkleBuildInput {
  readonly identityCommitments: readonly string[];
  readonly schemeVersion: string;
}

export interface MerkleArtifact {
  readonly leafValues: readonly string[];
  readonly merkleRoot: string;
  readonly treeDepth: number;
}

export interface MerkleTreeBuilder {
  build(input: MerkleBuildInput): Promise<MerkleArtifact>;
  verify(schemeVersion: string, artifact: MerkleArtifact): Promise<boolean>;
}
