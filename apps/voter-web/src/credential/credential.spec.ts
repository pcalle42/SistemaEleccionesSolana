import { deriveIdentityCommitmentV1, PROTOCOL_VERSION_V1 } from '@votaciones/zk-protocol';
import { describe, expect, it } from 'vitest';
import { CREDENTIAL_FORMAT_V1, parseCredential } from './credential.js';

describe('VoterCredentialV1', () => {
  it('accepts a strict credential whose commitment matches its local secret', async () => {
    const voterSecret = '123456789';
    const credential = {
      electionId: '018f47f2-a7e3-7f1c-8a55-40db41d61c34',
      formatVersion: CREDENTIAL_FORMAT_V1,
      identityCommitment: await deriveIdentityCommitmentV1(voterSecret),
      protocolVersion: PROTOCOL_VERSION_V1,
      voterSecret,
    };
    await expect(parseCredential(JSON.stringify(credential))).resolves.toEqual(credential);
  });

  it('rejects unknown properties and a mismatched commitment', async () => {
    const base = {
      electionId: '018f47f2-a7e3-7f1c-8a55-40db41d61c34',
      formatVersion: CREDENTIAL_FORMAT_V1,
      identityCommitment: '1',
      protocolVersion: PROTOCOL_VERSION_V1,
      voterSecret: '2',
    };
    await expect(parseCredential(JSON.stringify({ ...base, leaked: true }))).rejects.toThrow(
      'VoterCredentialV1',
    );
    await expect(parseCredential(JSON.stringify(base))).rejects.toThrow('no corresponde');
  });
});
