import { describe, expect, it } from 'vitest';

import { canonicalDigestV1 } from '@votaciones/verification-protocol';

import { createVoteReceiptV1, submissionFingerprintV1 } from './vote-receipt.js';
import { mapVotingPublicSignalsV1 } from './vote-public-signals.js';

describe('voting protocol value objects', () => {
  it('maps the manifest order without scattering signal indexes', () => {
    expect(mapVotingPublicSignalsV1(['10', '20', '30', '1', '2'])).toEqual({
      electionContext: '30',
      merkleRoot: '10',
      nullifier: '20',
      optionCount: 2,
      voteEncoding: 1,
    });
  });

  it('derives deterministic fingerprints and receipts from framed canonical fields', () => {
    const submission = {
      electionContext: '30',
      merkleRoot: '10',
      nullifier: '20',
      protocolVersion: 'anonymous-single-choice-v1',
      voteEncoding: 1,
    } as const;
    const material = {
      acceptedAt: new Date('2030-01-01T12:00:00.123Z'),
      configurationVersion: 2,
      electionId: '26ec012a-c9d0-4c21-9fb3-27a5ff3a7c8a',
      nullifier: '20',
      protocolVersion: submission.protocolVersion,
      voteEncoding: 1,
    } as const;
    expect(submissionFingerprintV1(submission)).toBe(submissionFingerprintV1(submission));
    expect(createVoteReceiptV1(material)).toEqual(createVoteReceiptV1(material));
    expect(createVoteReceiptV1({ ...material, voteEncoding: 0 }).receiptCommitment).not.toBe(
      createVoteReceiptV1(material).receiptCommitment,
    );
  });

  it('canonicalizes proof evidence independent of object key insertion order', () => {
    expect(canonicalDigestV1('votaciones/proof/v1', { a: 1, b: ['2'] })).toBe(
      canonicalDigestV1('votaciones/proof/v1', { b: ['2'], a: 1 }),
    );
  });
});
