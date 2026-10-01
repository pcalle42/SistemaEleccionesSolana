import { randomUUID } from 'node:crypto';

import { getTableColumns } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { COMMITMENT_SCHEME_VERSION_V1 } from '@votaciones/zk-protocol';

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
import { PoseidonMerkleTreeBuilder } from '../infrastructure/merkle/poseidon-merkle-tree-builder.js';

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
      '1',
      COMMITMENT_SCHEME_VERSION_V1,
      clock,
    );
    expect(revoked.snapshot().status).toBe('PENDING');
    revoked.activate(clock);
    revoked.revoke(clock);
    expect(revoked.snapshot()).toMatchObject({ status: 'REVOKED' });

    const rotated = ElectoralCredential.createPending(
      newElectoralCredentialId(),
      voterId,
      '2',
      COMMITMENT_SCHEME_VERSION_V1,
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

  it('uses the protocol V1 Poseidon tree and rejects unsupported schemes', async () => {
    const builder = new PoseidonMerkleTreeBuilder();
    const artifact = await builder.build({
      identityCommitments: ['2', '1'],
      schemeVersion: COMMITMENT_SCHEME_VERSION_V1,
    });
    expect(artifact).toMatchObject({ leafValues: ['1', '2'], treeDepth: 20 });
    await expect(builder.verify(COMMITMENT_SCHEME_VERSION_V1, artifact)).resolves.toBe(true);
    await expect(
      builder.build({ identityCommitments: ['1'], schemeVersion: 'unsupported' }),
    ).rejects.toMatchObject({ code: 'INVALID_IDENTITY_COMMITMENT' });
  });
});
