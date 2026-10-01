import { TREE_DEPTH_V1, ZERO_LEAF_V1 } from './constants.js';
import { encodeFieldElement, parseFieldElement, ZkProtocolError } from './field.js';
import { hashMerkleNodeV1 } from './poseidon.js';

export interface MerkleProofV1 {
  readonly pathElements: readonly string[];
  readonly pathIndices: readonly number[];
}

export interface MerkleTreeV1 {
  readonly depth: typeof TREE_DEPTH_V1;
  readonly leaves: readonly string[];
  readonly root: string;
  readonly zeroValues: readonly string[];
  proof(leafIndex: number): MerkleProofV1;
}

export async function deriveZeroValuesV1(): Promise<readonly string[]> {
  const values: string[] = [encodeFieldElement(ZERO_LEAF_V1)];
  for (let level = 0; level < TREE_DEPTH_V1; level++) {
    values.push(await hashMerkleNodeV1(values[level]!, values[level]!));
  }
  return values;
}

export async function buildMerkleTreeV1(
  identityCommitments: readonly string[],
): Promise<MerkleTreeV1> {
  if (identityCommitments.length === 0) {
    throw new ZkProtocolError('EMPTY_MERKLE_TREE', 'At least one identity commitment is required.');
  }
  if (identityCommitments.length > 2 ** TREE_DEPTH_V1) {
    throw new ZkProtocolError('MERKLE_TREE_CAPACITY_EXCEEDED', 'Merkle tree capacity exceeded.');
  }
  const leaves = identityCommitments
    .map((value) => encodeFieldElement(parseFieldElement(value, 'identity commitment')))
    .sort((left, right) => {
      const a = BigInt(left);
      const b = BigInt(right);
      return a < b ? -1 : a > b ? 1 : 0;
    });
  if (leaves.some((leaf, index) => index > 0 && leaf === leaves[index - 1])) {
    throw new ZkProtocolError('DUPLICATE_MERKLE_LEAF', 'Identity commitments must be unique.');
  }
  if (leaves.includes(encodeFieldElement(ZERO_LEAF_V1))) {
    throw new ZkProtocolError(
      'RESERVED_MERKLE_LEAF',
      'Identity commitment collides with ZERO_LEAF_V1.',
    );
  }

  const zeroValues = await deriveZeroValuesV1();
  const layers: string[][] = [leaves];
  for (let level = 0; level < TREE_DEPTH_V1; level++) {
    const current = layers[level]!;
    const next: string[] = [];
    for (let index = 0; index < current.length; index += 2) {
      next.push(await hashMerkleNodeV1(current[index]!, current[index + 1] ?? zeroValues[level]!));
    }
    if (next.length === 0) next.push(zeroValues[level + 1]!);
    layers.push(next);
  }

  return {
    depth: TREE_DEPTH_V1,
    leaves,
    root: layers[TREE_DEPTH_V1]![0]!,
    zeroValues,
    proof(leafIndex: number): MerkleProofV1 {
      if (!Number.isInteger(leafIndex) || leafIndex < 0 || leafIndex >= leaves.length) {
        throw new ZkProtocolError('INVALID_MERKLE_INDEX', 'Leaf index is outside the tree.');
      }
      const pathElements: string[] = [];
      const pathIndices: number[] = [];
      let index = leafIndex;
      for (let level = 0; level < TREE_DEPTH_V1; level++) {
        const siblingIndex = index ^ 1;
        pathElements.push(layers[level]![siblingIndex] ?? zeroValues[level]!);
        pathIndices.push(index & 1);
        index = Math.floor(index / 2);
      }
      return { pathElements, pathIndices };
    },
  };
}

export async function verifyMerkleProofV1(
  leaf: string,
  proof: MerkleProofV1,
  expectedRoot: string,
): Promise<boolean> {
  if (
    proof.pathElements.length !== TREE_DEPTH_V1 ||
    proof.pathIndices.length !== TREE_DEPTH_V1 ||
    proof.pathIndices.some((index) => index !== 0 && index !== 1)
  ) {
    return false;
  }
  let current = encodeFieldElement(parseFieldElement(leaf, 'Merkle leaf'));
  for (let level = 0; level < TREE_DEPTH_V1; level++) {
    const sibling = proof.pathElements[level]!;
    current =
      proof.pathIndices[level] === 0
        ? await hashMerkleNodeV1(current, sibling)
        : await hashMerkleNodeV1(sibling, current);
  }
  return current === encodeFieldElement(parseFieldElement(expectedRoot, 'Merkle root'));
}
