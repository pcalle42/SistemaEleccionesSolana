export const CREDENTIAL_FORMAT_V1 = 'voter-credential-v1' as const;
export const SUPPORTED_PROTOCOL_VERSION = 'anonymous-single-choice-v1' as const;

export interface VoterCredentialV1 {
  readonly electionId: string;
  readonly formatVersion: typeof CREDENTIAL_FORMAT_V1;
  readonly identityCommitment: string;
  readonly protocolVersion: typeof SUPPORTED_PROTOCOL_VERSION;
  readonly voterSecret: string;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

export async function createCredential(electionId: string): Promise<VoterCredentialV1> {
  if (!UUID.test(electionId)) throw new Error('El identificador de elección no es válido.');
  const { deriveIdentityCommitmentV1, generateVoterSecretV1 } =
    await import('@votaciones/zk-protocol');
  const voterSecret = generateVoterSecretV1();
  return {
    electionId,
    formatVersion: CREDENTIAL_FORMAT_V1,
    identityCommitment: await deriveIdentityCommitmentV1(voterSecret),
    protocolVersion: SUPPORTED_PROTOCOL_VERSION,
    voterSecret,
  };
}

export async function parseCredential(text: string): Promise<VoterCredentialV1> {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new Error('La credencial no contiene JSON válido.');
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    throw new Error('Formato de credencial inválido.');
  const candidate = value as Partial<VoterCredentialV1>;
  if (
    Object.keys(value).sort().join(',') !==
      'electionId,formatVersion,identityCommitment,protocolVersion,voterSecret' ||
    candidate.formatVersion !== CREDENTIAL_FORMAT_V1 ||
    candidate.protocolVersion !== SUPPORTED_PROTOCOL_VERSION ||
    typeof candidate.electionId !== 'string' ||
    !UUID.test(candidate.electionId) ||
    typeof candidate.voterSecret !== 'string' ||
    typeof candidate.identityCommitment !== 'string'
  ) {
    throw new Error('La credencial no cumple VoterCredentialV1.');
  }
  const { deriveIdentityCommitmentV1, parseVoterSecretV1 } =
    await import('@votaciones/zk-protocol');
  parseVoterSecretV1(candidate.voterSecret);
  if ((await deriveIdentityCommitmentV1(candidate.voterSecret)) !== candidate.identityCommitment) {
    throw new Error('El commitment no corresponde al secreto de la credencial.');
  }
  return candidate as VoterCredentialV1;
}

export function serializeCredential(credential: VoterCredentialV1): string {
  return `${JSON.stringify(credential, null, 2)}\n`;
}
