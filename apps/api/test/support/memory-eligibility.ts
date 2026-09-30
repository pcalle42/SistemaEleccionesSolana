import type { ElectionReadinessVerifier } from '../../src/modules/elections/application/ports/election-readiness.port.js';
import type { ElectionRepository } from '../../src/modules/elections/application/ports/election-repository.port.js';
import type { ElectionState } from '../../src/modules/elections/domain/election.js';
import type { ElectionId } from '../../src/modules/elections/domain/election-id.js';
import type { ElectoralCredentialRepository } from '../../src/modules/eligibility/application/ports/electoral-credential-repository.port.js';
import type { EligibilitySnapshotRepository } from '../../src/modules/eligibility/application/ports/eligibility-snapshot-repository.port.js';
import type {
  EligibilityAuditContext,
  EligibleVoterRepository,
} from '../../src/modules/eligibility/application/ports/eligible-voter-repository.port.js';
import type {
  MerkleArtifact,
  MerkleBuildInput,
  MerkleTreeBuilder,
} from '../../src/modules/eligibility/application/ports/merkle-tree-builder.port.js';
import { ElectoralCredential } from '../../src/modules/eligibility/domain/electoral-credential.js';
import { EligibleVoter } from '../../src/modules/eligibility/domain/eligible-voter.js';
import type {
  ElectoralCredentialId,
  EligibilitySnapshotId,
  EligibleVoterId,
} from '../../src/modules/eligibility/domain/eligibility-id.js';
import { EligibilityDomainError } from '../../src/modules/eligibility/domain/eligibility-errors.js';
import { EligibilitySnapshot } from '../../src/modules/eligibility/domain/eligibility-snapshot.js';

export class FixtureMerkleTreeBuilder implements MerkleTreeBuilder {
  build(input: MerkleBuildInput): Promise<MerkleArtifact> {
    const leafValues = input.identityCommitments.map((value) => `fixture-leaf:${value}`);
    return Promise.resolve({
      leafValues,
      merkleRoot: `fixture-root:${input.schemeVersion}:${leafValues.join('|')}`,
      treeDepth: Math.max(1, Math.ceil(Math.log2(leafValues.length))),
    });
  }

  verify(schemeVersion: string, artifact: MerkleArtifact): Promise<boolean> {
    return Promise.resolve(
      artifact.merkleRoot === `fixture-root:${schemeVersion}:${artifact.leafValues.join('|')}`,
    );
  }
}

export class MemoryEligibleVoterRepository implements EligibleVoterRepository {
  private readonly entries = new Map<EligibleVoterId, EligibleVoter>();

  create(voter: EligibleVoter, _audit: EligibilityAuditContext): Promise<void> {
    void _audit;
    this.entries.set(voter.snapshot().id, EligibleVoter.reconstitute(voter.snapshot()));
    return Promise.resolve();
  }

  findById(id: EligibleVoterId): Promise<EligibleVoter | null> {
    const voter = this.entries.get(id);
    return Promise.resolve(voter ? EligibleVoter.reconstitute(voter.snapshot()) : null);
  }

  list(): Promise<readonly EligibleVoter[]> {
    return Promise.resolve(
      [...this.entries.values()].map((item) => EligibleVoter.reconstitute(item.snapshot())),
    );
  }

  saveDeactivation(
    voter: EligibleVoter,
    expected: number,
    _audit: EligibilityAuditContext,
  ): Promise<void> {
    void _audit;
    const current = this.entries.get(voter.snapshot().id);
    if (!current || current.snapshot().rowVersion !== expected) throw concurrent();
    this.entries.set(
      voter.snapshot().id,
      EligibleVoter.reconstitute({ ...voter.snapshot(), rowVersion: expected + 1 }),
    );
    return Promise.resolve();
  }

  async upsertAdministrativeRecord(
    voter: EligibleVoter,
    audit: EligibilityAuditContext,
  ): Promise<'created' | 'updated'> {
    const reference = voter.snapshot().externalReference;
    const existing = [...this.entries.values()].find(
      (item) => item.snapshot().externalReference === reference && reference !== null,
    );
    if (!existing) {
      await this.create(voter, audit);
      return 'created';
    }
    existing.updateAdministrativeMetadata(
      { displayName: voter.snapshot().displayName },
      { now: () => new Date() },
    );
    return 'updated';
  }
}

export class MemoryElectoralCredentialRepository implements ElectoralCredentialRepository {
  private readonly entries = new Map<ElectoralCredentialId, ElectoralCredential>();

  findById(id: ElectoralCredentialId): Promise<ElectoralCredential | null> {
    const item = this.entries.get(id);
    return Promise.resolve(item ? ElectoralCredential.reconstitute(item.snapshot()) : null);
  }

  findActiveForVoter(id: EligibleVoterId): Promise<ElectoralCredential | null> {
    const item = [...this.entries.values()].find(
      (credential) =>
        credential.snapshot().eligibleVoterId === id && credential.snapshot().status === 'ACTIVE',
    );
    return Promise.resolve(item ? ElectoralCredential.reconstitute(item.snapshot()) : null);
  }

  listActiveDeterministically(): Promise<readonly ElectoralCredential[]> {
    return Promise.resolve(
      [...this.entries.values()]
        .filter((item) => item.snapshot().status === 'ACTIVE')
        .sort((left, right) => {
          const leftValue = left.snapshot().identityCommitment;
          const rightValue = right.snapshot().identityCommitment;
          return leftValue < rightValue ? -1 : leftValue > rightValue ? 1 : 0;
        })
        .map((item) => ElectoralCredential.reconstitute(item.snapshot())),
    );
  }

  registerAndRotate(
    credential: ElectoralCredential,
    _audit: EligibilityAuditContext,
  ): Promise<void> {
    void _audit;
    if (
      [...this.entries.values()].some(
        (item) =>
          item.snapshot().identityCommitment === credential.snapshot().identityCommitment &&
          item.snapshot().schemeVersion === credential.snapshot().schemeVersion,
      )
    ) {
      throw new EligibilityDomainError(
        'CREDENTIAL_ALREADY_REGISTERED',
        'Identity commitment is already registered.',
      );
    }
    for (const [id, item] of this.entries) {
      if (
        item.snapshot().eligibleVoterId === credential.snapshot().eligibleVoterId &&
        item.snapshot().status === 'ACTIVE'
      ) {
        item.rotate({ now: () => credential.snapshot().activatedAt! });
        this.entries.set(id, item);
      }
    }
    this.entries.set(
      credential.snapshot().id,
      ElectoralCredential.reconstitute(credential.snapshot()),
    );
    return Promise.resolve();
  }

  revoke(
    credential: ElectoralCredential,
    expected: number,
    _audit: EligibilityAuditContext,
  ): Promise<void> {
    void _audit;
    const current = this.entries.get(credential.snapshot().id);
    if (!current || current.snapshot().rowVersion !== expected) throw concurrent();
    this.entries.set(
      credential.snapshot().id,
      ElectoralCredential.reconstitute({ ...credential.snapshot(), rowVersion: expected + 1 }),
    );
    return Promise.resolve();
  }
}

export class MemoryEligibilitySnapshotRepository implements EligibilitySnapshotRepository {
  private readonly entries = new Map<EligibilitySnapshotId, EligibilitySnapshot>();

  constructor(private readonly elections: ElectionRepository) {}

  async createForElection(
    electionId: ElectionId,
    configurationVersion: number,
    expectedElectionRowVersion: number,
    factory: (version: number) => EligibilitySnapshot,
    _audit: EligibilityAuditContext,
  ): Promise<EligibilitySnapshot> {
    void _audit;
    const election = await this.elections.findById(electionId);
    if (!election || election.snapshot().rowVersion !== expectedElectionRowVersion)
      throw concurrent();
    const version =
      [...this.entries.values()].filter(
        (item) =>
          item.snapshot().electionId === electionId &&
          item.snapshot().configurationVersion === configurationVersion,
      ).length + 1;
    const snapshot = factory(version);
    this.entries.set(snapshot.snapshot().id, EligibilitySnapshot.reconstitute(snapshot.snapshot()));
    const state = election.snapshot();
    election.updateDraft(
      {
        references: {
          ...state.references,
          eligibilityConfigurationRef: snapshot.snapshot().id,
        },
      },
      { now: () => snapshot.snapshot().createdAt },
    );
    await this.elections.saveDraftChanges(election, expectedElectionRowVersion);
    return EligibilitySnapshot.reconstitute(snapshot.snapshot());
  }

  findById(id: EligibilitySnapshotId): Promise<EligibilitySnapshot | null> {
    const item = this.entries.get(id);
    return Promise.resolve(item ? EligibilitySnapshot.reconstitute(item.snapshot()) : null);
  }

  freeze(
    snapshot: EligibilitySnapshot,
    expected: number,
    _audit: EligibilityAuditContext,
  ): Promise<void> {
    void _audit;
    const current = this.entries.get(snapshot.snapshot().id);
    if (!current || current.snapshot().rowVersion !== expected) throw concurrent();
    this.entries.set(
      snapshot.snapshot().id,
      EligibilitySnapshot.reconstitute({ ...snapshot.snapshot(), rowVersion: expected + 1 }),
    );
    return Promise.resolve();
  }
}

export class MemoryElectionReadinessVerifier implements ElectionReadinessVerifier {
  constructor(private readonly snapshots: MemoryEligibilitySnapshotRepository) {}

  async assess(election: ElectionState) {
    const reference = election.references.eligibilityConfigurationRef;
    const snapshot = reference
      ? await this.snapshots.findById(reference as EligibilitySnapshotId)
      : null;
    const expectedVersion =
      election.status === 'DRAFT'
        ? election.configurationVersion + 1
        : election.configurationVersion;
    return {
      eligibilityPrepared: Boolean(
        snapshot &&
        snapshot.snapshot().status === 'FROZEN' &&
        snapshot.snapshot().configurationVersion === expectedVersion,
      ),
      protocolCompatible: Boolean(
        election.references.protocolVersion && election.references.circuitVersion,
      ),
    };
  }
}

function concurrent(): EligibilityDomainError {
  return new EligibilityDomainError(
    'ELIGIBILITY_CONCURRENT_MODIFICATION',
    'Eligibility state changed concurrently.',
  );
}
