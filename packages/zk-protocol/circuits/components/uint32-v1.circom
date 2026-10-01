pragma circom 2.2.3;

include "circomlib/circuits/bitify.circom";

template Uint32V1() {
    signal input value;
    signal bits[32];
    signal reconstructed;

    component decomposition = Num2Bits(32);
    decomposition.in <== value;

    var sum = 0;
    for (var bit = 0; bit < 32; bit++) {
        bits[bit] <== decomposition.out[bit];
        sum += bits[bit] * (1 << bit);
    }
    reconstructed <== sum;
    reconstructed === value;
}

template LessThanUint32V1() {
    signal input left;
    signal input right;
    signal output result;
    signal comparisonBits[33];
    signal reconstructed;

    component decomposition = Num2Bits(33);
    decomposition.in <== left + (1 << 32) - right;

    var sum = 0;
    for (var bit = 0; bit < 33; bit++) {
        comparisonBits[bit] <== decomposition.out[bit];
        sum += comparisonBits[bit] * (1 << bit);
    }
    reconstructed <== sum;
    reconstructed === decomposition.in;
    result <== 1 - comparisonBits[32];
}
