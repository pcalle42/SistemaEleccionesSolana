export const BN254_SCALAR_FIELD =
  21_888_242_871_839_275_222_246_405_745_257_275_088_548_364_400_416_034_343_698_204_186_575_808_495_617n;
export const BN254_BASE_FIELD =
  21_888_242_871_839_275_222_246_405_745_257_275_088_696_311_157_297_823_662_689_037_894_645_226_208_583n;

export const PROTOCOL_VERSION_V1 = 'anonymous-single-choice-v1';
export const CIRCUIT_ID_V1 = 'AnonymousSingleChoiceVoteV1';
export const CIRCUIT_VERSION_V1 = '1.0.0';
export const COMMITMENT_SCHEME_VERSION_V1 = 'poseidon-bn254-v1';
export const NULLIFIER_SCHEME_VERSION_V1 = 'poseidon-election-v1';
export const VOTE_ENCODING_VERSION_V1 = 'single-choice-index-v1';
export const TREE_DEPTH_V1 = 20;
export const PUBLIC_SIGNAL_NAMES_V1 = [
  'merkleRoot',
  'nullifier',
  'electionContext',
  'voteChoice',
  'optionCount',
] as const;

// SHA-256(label) interpreted big-endian and reduced modulo the BN254 scalar field.
export const DOMAIN_IDENTITY_COMMITMENT_V1 =
  16_848_176_162_136_172_346_708_044_424_066_826_622_648_223_568_299_483_933_802_294_084_829_113_264_379n;
export const DOMAIN_NULLIFIER_V1 =
  10_333_797_334_051_782_061_854_811_690_419_466_139_684_761_886_533_626_565_044_634_573_530_185_615_362n;
export const DOMAIN_ELECTION_CONTEXT_V1 =
  21_023_234_055_518_208_748_977_461_275_644_379_776_739_489_630_452_434_110_355_803_360_175_133_518_866n;
export const DOMAIN_VOTE_ENCODING_V1 =
  4_378_518_821_646_679_575_500_721_740_580_967_553_513_011_193_220_055_537_523_782_885_262_266_295_826n;
export const DOMAIN_MERKLE_NODE_V1 =
  11_918_425_724_220_944_919_607_847_593_631_889_990_599_498_976_971_439_332_994_914_722_572_160_905_001n;
export const ZERO_LEAF_V1 =
  8_073_326_798_467_720_150_511_528_651_750_669_659_706_275_861_942_011_693_713_756_714_694_839_465_262n;

export const DOMAIN_LABELS_V1 = {
  electionContext: 'votaciones:domain:election-context:v1',
  identityCommitment: 'votaciones:domain:identity-commitment:v1',
  merkleNode: 'votaciones:domain:merkle-node:v1',
  nullifier: 'votaciones:domain:nullifier:v1',
  voteEncoding: 'votaciones:domain:vote-encoding:v1',
  zeroLeaf: 'votaciones:zero-leaf:v1',
} as const;
