pragma circom 2.2.3;

include "circomlib/circuits/poseidon.circom";

template MerkleRootV1(depth, domainMerkleNode) {
    signal input leaf;
    signal input pathElements[depth];
    signal input pathIndices[depth];
    signal output root;

    signal hashes[depth + 1];
    signal left[depth];
    signal right[depth];
    component nodeHashers[depth];

    hashes[0] <== leaf;

    for (var level = 0; level < depth; level++) {
        pathIndices[level] * (pathIndices[level] - 1) === 0;

        left[level] <== hashes[level] + pathIndices[level] * (pathElements[level] - hashes[level]);
        right[level] <== pathElements[level] + pathIndices[level] * (hashes[level] - pathElements[level]);

        nodeHashers[level] = Poseidon(3);
        nodeHashers[level].inputs[0] <== domainMerkleNode;
        nodeHashers[level].inputs[1] <== left[level];
        nodeHashers[level].inputs[2] <== right[level];
        hashes[level + 1] <== nodeHashers[level].out;
    }

    root <== hashes[depth];
}
