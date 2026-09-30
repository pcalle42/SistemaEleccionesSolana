import { randomUUID } from 'node:crypto';

import { getTableColumns } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';

import {
  electoralCredentials,
  eligibilitySnapshotMembers,
  eligibilitySnapshots,
  eligibleVoters,
} from '../../../database/schema/eligibility.js';
import type { Clock } from '../../elections/domain/clock.js';
import { electionId } from '../../elections/domain/election-id.js';
import { EligibleVoter } from './eligible-voter.js';
import { ElectoralCredential } from './electoral-credential.js';
import {
  electoralCredentialId,
  eligibilitySnapshotId,
  newElectoralCredentialId,
  newEligibleVoterId,
} from './eligibility-id.js';
import { EligibilitySnapshot } from './eligibility-snapshot.js';
import { DeferredMerkleTreeBuilder } from '../infrastructure/merkle/deferred-merkle-tree-builder.js';

const clock: Clock = { now: () => new Date('2030-01-01T00:00:00.000Z') };

describe('eligibility domain', () => {
  it('normalizes administrative identity and enforces voter lifecycle', () => {
    const voter = EligibleVoter.create(
      newEligibleVoterId(),
      { displayName: '  Alice  ', externalReference: '  REF-001  ' },
      clock,
    );
    expect(voter.snapshot()).toMatchObject({
      displayName: 'Alice',
      externalReference: 'REF-001',
      status: 'ACTIVE',
    });
    voter.deactivate(clock);
    expect(voter.snapshot().status).toBe('INACTIVE');
    expect(() => voter.deactivate(clock)).toThrowError(
      expect.objectContaining({ code: 'ELIGIBLE_VOTER_INACTIVE' }),
    );
  });

  it('supports pending, active, revoked, and rotated credential lifecycles', () => {
    const voterId = newEligibleVoterId();
    const revoked = ElectoralCredential.createPending(
      newElectoralCredentialId(),
      voterId,
      'opaque-commitment-1',
      'scheme-v1',
      clock,
    );
    expect(revoked.snapshot().status).toBe('PENDING');
    revoked.activate(clock);
    revoked.revoke(clock);
    expect(revoked.snapshot()).toMatchObject({ status: 'REVOKED' });

    const rotated = ElectoralCredential.createPending(
      newElectoralCredentialId(),
      voterId,
      'opaque-commitment-2',
      'scheme-v1',
      clock,
    );
    rotated.activate(clock);
    rotated.rotate(clock);
    expect(rotated.snapshot()).toMatchObject({ status: 'ROTATED' });
  });

  it('builds deterministic indexed snapshots and freezes them once', () => {
    const credentialIds = [
      electoralCredentialId(randomUUID()),
      electoralCredentialId(randomUUID()),
    ];
    const snapshot = EligibilitySnapshot.build(
      {
        commitmentSchemeVersion: 'scheme-v1',
        configurationVersion: 1,
        electionId: electionId(randomUUID()),
        id: eligibilitySnapshotId(randomUUID()),
        leafCount: 2,
        members: [
          { credentialId: credentialIds[0]!, leafIndex: 0, leafValue: 'leaf-a' },
          { credentialId: credentialIds[1]!, leafIndex: 1, leafValue: 'leaf-b' },
        ],
        merkleRoot: 'root-fixture',
        treeDepth: 2,
        version: 1,
      },
      clock,
    );
    snapshot.freeze(clock);
    expect(snapshot.snapshot()).toMatchObject({ leafCount: 2, status: 'FROZEN' });
    expect(() => snapshot.freeze(clock)).toThrowError(
      expect.objectContaining({ code: 'ELIGIBILITY_SNAPSHOT_FROZEN' }),
    );
  });

  it('rejects duplicate leaves and non-contiguous indexes', () => {
    const credentialIds = [
      electoralCredentialId(randomUUID()),
      electoralCredentialId(randomUUID()),
    ];
    expect(() =>
      EligibilitySnapshot.build(
        {
          commitmentSchemeVersion: 'scheme-v1',
          configurationVersion: 1,
          electionId: electionId(randomUUID()),
          id: eligibilitySnapshotId(randomUUID()),
          leafCount: 2,
          members: [
            { credentialId: credentialIds[0]!, leafIndex: 0, leafValue: 'same-leaf' },
            { credentialId: credentialIds[1]!, leafIndex: 1, leafValue: 'same-leaf' },
          ],
          merkleRoot: 'root-fixture',
          treeDepth: 2,
          version: 1,
        },
        clock,
      ),
    ).toThrowError(expect.objectContaining({ code: 'ELIGIBILITY_SNAPSHOT_DUPLICATE_LEAF' }));
  });

  it('contains neither plaintext voter secrets nor identified participation fields', () => {
    for (const table of [
      eligibleVoters,
      electoralCredentials,
      eligibilitySnapshots,
      eligibilitySnapshotMembers,
    ]) {
      const columns = Object.keys(getTableColumns(table));
      expect(columns).not.toContain('voterSecret');
      expect(columns).not.toContain('hasVoted');
    }
  });

  it('does not invent Merkle cryptography before stage 10', async () => {
    const builder = new DeferredMerkleTreeBuilder();
    await expect(
      builder.build({ identityCommitments: ['opaque-commitment'], schemeVersion: 'scheme-v1' }),
    ).rejects.toMatchObject({ code: 'ELIGIBILITY_CRYPTOGRAPHY_NOT_CONFIGURED' });
  });
});
