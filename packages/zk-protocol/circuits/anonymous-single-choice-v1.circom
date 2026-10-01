pragma circom 2.2.3;

include "circomlib/circuits/poseidon.circom";
include "./components/merkle-root-v1.circom";
include "./components/uint32-v1.circom";

template AnonymousSingleChoiceVoteV1(depth) {
    signal input merkleRoot;
    signal input nullifier;
    signal input electionContext;
    signal input voteChoice;
    signal input optionCount;

    signal input voterSecret;
    signal input merklePathElements[depth];
    signal input merklePathIndices[depth];

    var DOMAIN_IDENTITY_COMMITMENT_V1 = 16848176162136172346708044424066826622648223568299483933802294084829113264379;
    var DOMAIN_NULLIFIER_V1 = 10333797334051782061854811690419466139684761886533626565044634573530185615362;
    var DOMAIN_MERKLE_NODE_V1 = 11918425724220944919607847593631889990599498976971439332994914722572160905001;

    component identityCommitment = Poseidon(2);
    identityCommitment.inputs[0] <== DOMAIN_IDENTITY_COMMITMENT_V1;
    identityCommitment.inputs[1] <== voterSecret;

    component membership = MerkleRootV1(depth, DOMAIN_MERKLE_NODE_V1);
    membership.leaf <== identityCommitment.out;
    for (var level = 0; level < depth; level++) {
        membership.pathElements[level] <== merklePathElements[level];
        membership.pathIndices[level] <== merklePathIndices[level];
    }
    membership.root === merkleRoot;

    component nullifierHash = Poseidon(3);
    nullifierHash.inputs[0] <== DOMAIN_NULLIFIER_V1;
    nullifierHash.inputs[1] <== voterSecret;
    nullifierHash.inputs[2] <== electionContext;
    nullifierHash.out === nullifier;

    component choiceEncoding = Uint32V1();
    choiceEncoding.value <== voteChoice;

    component optionCountEncoding = Uint32V1();
    optionCountEncoding.value <== optionCount;

    component choiceInRange = LessThanUint32V1();
    choiceInRange.left <== voteChoice;
    choiceInRange.right <== optionCount;
    choiceInRange.result === 1;

    component atLeastTwoOptions = LessThanUint32V1();
    atLeastTwoOptions.left <== 1;
    atLeastTwoOptions.right <== optionCount;
    atLeastTwoOptions.result === 1;
}

component main {public [merkleRoot, nullifier, electionContext, voteChoice, optionCount]} =
    AnonymousSingleChoiceVoteV1(20);
