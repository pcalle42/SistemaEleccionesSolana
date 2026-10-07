import type { VoterCredentialV1 } from '../../credential/credential.js';
import type { ElectionManifest } from '../../election/manifest.js';

const PROTOCOL_VERSION_V1 = 'anonymous-single-choice-v1' as const;
const TREE_DEPTH_V1 = 20;
const FIELD = /^(0|[1-9][0-9]*)$/u;
const BN254_SCALAR_FIELD =
  21888242871839275222246405745257275088548364400416034343698204186575808495617n;

function assertField(value: string): void {
  if (!FIELD.test(value) || BigInt(value) >= BN254_SCALAR_FIELD)
    throw new Error('Material de elegibilidad contiene un field element inválido.');
}

export interface EligibilityMaterialV1 {
  readonly electionId: string;
  readonly formatVersion: 'eligibility-material-v1';
  readonly identityCommitment: string;
  readonly merklePathElements: readonly string[];
  readonly merklePathIndices: readonly number[];
  readonly merkleRoot: string;
  readonly protocolVersion: typeof PROTOCOL_VERSION_V1;
}

export function parseEligibilityMaterial(
  text: string,
  credential: VoterCredentialV1,
  manifest: ElectionManifest,
): EligibilityMaterialV1 {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new Error('El material de elegibilidad no es JSON válido.');
  }
  if (typeof value !== 'object' || value === null)
    throw new Error('Material de elegibilidad inválido.');
  const candidate = value as Partial<EligibilityMaterialV1>;
  if (
    candidate.formatVersion !== 'eligibility-material-v1' ||
    candidate.protocolVersion !== PROTOCOL_VERSION_V1 ||
    candidate.electionId !== credential.electionId ||
    candidate.electionId !== manifest.electionId ||
    candidate.identityCommitment !== credential.identityCommitment ||
    candidate.merkleRoot !== manifest.merkleRoot ||
    !Array.isArray(candidate.merklePathElements) ||
    candidate.merklePathElements.length !== TREE_DEPTH_V1 ||
    !Array.isArray(candidate.merklePathIndices) ||
    candidate.merklePathIndices.length !== TREE_DEPTH_V1 ||
    !candidate.merklePathIndices.every((item) => item === 0 || item === 1) ||
    !candidate.merklePathElements.every((item) => typeof item === 'string')
  )
    throw new Error('El material no coincide con la credencial y el manifest congelado.');
  assertField(candidate.merkleRoot);
  candidate.merklePathElements.forEach(assertField);
  return candidate as EligibilityMaterialV1;
}
