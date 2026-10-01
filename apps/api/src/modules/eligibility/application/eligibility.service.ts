import { Inject, Injectable } from '@nestjs/common';

import { ApplicationError } from '../../../common/errors/application-error.js';
import type { AdminPrincipal } from '../../auth/domain/admin-principal.js';
import type { Clock } from '../../elections/domain/clock.js';
import type { Election } from '../../elections/domain/election.js';
import { electionId } from '../../elections/domain/election-id.js';
import type { ElectionRepository } from '../../elections/application/ports/election-repository.port.js';
import { ELECTION_CLOCK, ELECTION_REPOSITORY } from '../../elections/elections.tokens.js';
import { EligibleVoter, type EligibleVoterState } from '../domain/eligible-voter.js';
import {
  ElectoralCredential,
  type ElectoralCredentialState,
} from '../domain/electoral-credential.js';
import {
  eligibleVoterId,
  electoralCredentialId,
  eligibilitySnapshotId,
  newElectoralCredentialId,
  newEligibilitySnapshotId,
  newEligibleVoterId,
} from '../domain/eligibility-id.js';
import { EligibilityDomainError } from '../domain/eligibility-errors.js';
import {
  EligibilitySnapshot,
  type EligibilitySnapshotState,
} from '../domain/eligibility-snapshot.js';
import {
  ELECTORAL_CREDENTIAL_REPOSITORY,
  ELIGIBILITY_SNAPSHOT_REPOSITORY,
  ELIGIBLE_VOTER_REPOSITORY,
  MERKLE_TREE_BUILDER,
} from '../eligibility.tokens.js';
import type { ElectoralCredentialRepository } from './ports/electoral-credential-repository.port.js';
import type { EligibilitySnapshotRepository } from './ports/eligibility-snapshot-repository.port.js';
import type { EligibleVoterRepository } from './ports/eligible-voter-repository.port.js';
import type { MerkleTreeBuilder } from './ports/merkle-tree-builder.port.js';

export interface RegisterEligibleVoterCommand {
  readonly displayName?: string | null;
  readonly externalReference?: string | null;
}

function compareOpaqueValues(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function toApplicationError(error: unknown): never {
  if (!(error instanceof EligibilityDomainError)) {
    throw error;
  }
  const notFound = new Set([
    'ELIGIBLE_VOTER_NOT_FOUND',
    'CREDENTIAL_NOT_FOUND',
    'ELIGIBILITY_SNAPSHOT_NOT_FOUND',
  ]);
  const validation = new Set([
    'INVALID_IDENTITY_COMMITMENT',
    'INVALID_ELIGIBLE_VOTER',
    'ELIGIBILITY_SNAPSHOT_EMPTY',
    'ELIGIBILITY_SNAPSHOT_DUPLICATE_LEAF',
    'ELIGIBILITY_SNAPSHOT_CAPACITY_EXCEEDED',
  ]);
  throw new ApplicationError(
    error.code,
    error.message,
    notFound.has(error.code)
      ? 'not-found'
      : validation.has(error.code)
        ? 'validation'
        : 'domain-rule',
    { cause: error },
  );
}

@Injectable()
export class EligibilityService {
  constructor(
    @Inject(ELIGIBLE_VOTER_REPOSITORY) private readonly voters: EligibleVoterRepository,
    @Inject(ELECTORAL_CREDENTIAL_REPOSITORY)
    private readonly credentials: ElectoralCredentialRepository,
    @Inject(ELIGIBILITY_SNAPSHOT_REPOSITORY)
    private readonly snapshots: EligibilitySnapshotRepository,
    @Inject(MERKLE_TREE_BUILDER) private readonly merkle: MerkleTreeBuilder,
    @Inject(ELECTION_REPOSITORY) private readonly elections: ElectionRepository,
    @Inject(ELECTION_CLOCK) private readonly clock: Clock,
  ) {}

  async registerVoter(
    command: RegisterEligibleVoterCommand,
    principal: AdminPrincipal,
    requestId?: string,
  ): Promise<EligibleVoterState> {
    try {
      const voter = EligibleVoter.create(newEligibleVoterId(), command, this.clock);
      await this.voters.create(voter, { actorAdminId: principal.adminId, requestId });
      return voter.snapshot();
    } catch (error: unknown) {
      return toApplicationError(error);
    }
  }

  async listVoters(): Promise<readonly EligibleVoterState[]> {
    return (await this.voters.list()).map((voter) => voter.snapshot());
  }

  async deactivateVoter(
    rawId: string,
    principal: AdminPrincipal,
    requestId?: string,
  ): Promise<EligibleVoterState> {
    const voter = await this.loadVoter(rawId);
    const expected = voter.snapshot().rowVersion;
    try {
      voter.deactivate(this.clock);
      await this.voters.saveDeactivation(voter, expected, {
        actorAdminId: principal.adminId,
        requestId,
      });
      return voter.snapshot();
    } catch (error: unknown) {
      return toApplicationError(error);
    }
  }

  async importVoters(
    records: readonly RegisterEligibleVoterCommand[],
    dryRun: boolean,
    principal: AdminPrincipal,
    requestId?: string,
  ): Promise<{ created: number; updated: number; validated: number }> {
    const voters = records.map((record) =>
      EligibleVoter.create(newEligibleVoterId(), record, this.clock),
    );
    const references = voters
      .map((voter) => voter.snapshot().externalReference)
      .filter((reference): reference is string => reference !== null);
    if (new Set(references).size !== references.length) {
      throw new ApplicationError(
        'INVALID_ELIGIBLE_VOTER',
        'The import contains duplicate normalized external references.',
        'validation',
      );
    }
    if (dryRun) {
      return { created: 0, updated: 0, validated: voters.length };
    }
    let created = 0;
    let updated = 0;
    for (const voter of voters) {
      const result = await this.voters.upsertAdministrativeRecord(voter, {
        actorAdminId: principal.adminId,
        requestId,
      });
      if (result === 'created') created++;
      else updated++;
    }
    return { created, updated, validated: voters.length };
  }

  async registerCredential(
    command: { eligibleVoterId: string; identityCommitment: string; schemeVersion: string },
    principal: AdminPrincipal,
    requestId?: string,
  ): Promise<ElectoralCredentialState> {
    const voter = await this.loadVoter(command.eligibleVoterId);
    if (voter.snapshot().status !== 'ACTIVE') {
      throw new ApplicationError(
        'ELIGIBLE_VOTER_INACTIVE',
        'Eligible voter is not active.',
        'domain-rule',
      );
    }
    try {
      const credential = ElectoralCredential.createPending(
        newElectoralCredentialId(),
        voter.snapshot().id,
        command.identityCommitment,
        command.schemeVersion,
        this.clock,
      );
      credential.activate(this.clock);
      await this.credentials.registerAndRotate(credential, {
        actorAdminId: principal.adminId,
        requestId,
      });
      return credential.snapshot();
    } catch (error: unknown) {
      return toApplicationError(error);
    }
  }

  async revokeCredential(
    rawId: string,
    principal: AdminPrincipal,
    requestId?: string,
  ): Promise<ElectoralCredentialState> {
    let credential;
    try {
      credential = await this.credentials.findById(electoralCredentialId(rawId));
    } catch (error: unknown) {
      return toApplicationError(error);
    }
    if (!credential) {
      throw new ApplicationError(
        'CREDENTIAL_NOT_FOUND',
        'Electoral credential not found.',
        'not-found',
      );
    }
    const expected = credential.snapshot().rowVersion;
    try {
      credential.revoke(this.clock);
      await this.credentials.revoke(credential, expected, {
        actorAdminId: principal.adminId,
        requestId,
      });
      return credential.snapshot();
    } catch (error: unknown) {
      return toApplicationError(error);
    }
  }

  async buildSnapshot(
    rawElectionId: string,
    principal: AdminPrincipal,
    requestId?: string,
  ): Promise<EligibilitySnapshotState> {
    const election = await this.loadDraftElection(rawElectionId);
    const activeCredentials = [...(await this.credentials.listActiveDeterministically())].sort(
      (left, right) =>
        compareOpaqueValues(
          left.snapshot().identityCommitment,
          right.snapshot().identityCommitment,
        ),
    );
    if (activeCredentials.length === 0) {
      throw new ApplicationError(
        'ELIGIBILITY_SNAPSHOT_EMPTY',
        'No active credentials exist.',
        'validation',
      );
    }
    const schemes = new Set(
      activeCredentials.map((credential) => credential.snapshot().schemeVersion),
    );
    if (schemes.size !== 1) {
      throw new ApplicationError(
        'INVALID_IDENTITY_COMMITMENT',
        'Active credentials use incompatible commitment schemes.',
        'validation',
      );
    }
    try {
      const schemeVersion = activeCredentials[0]!.snapshot().schemeVersion;
      const identityCommitments = activeCredentials.map(
        (credential) => credential.snapshot().identityCommitment,
      );
      const artifact = await this.merkle.build({ identityCommitments, schemeVersion });
      const credentialByCommitment = new Map(
        activeCredentials.map((credential) => [
          credential.snapshot().identityCommitment,
          credential.snapshot().id,
        ]),
      );
      const electionState = election.snapshot();
      const snapshot = await this.snapshots.createForElection(
        electionState.id,
        electionState.configurationVersion + 1,
        electionState.rowVersion,
        (version) =>
          EligibilitySnapshot.build(
            {
              commitmentSchemeVersion: schemeVersion,
              configurationVersion: electionState.configurationVersion + 1,
              electionId: electionState.id,
              id: newEligibilitySnapshotId(),
              leafCount: artifact.leafValues.length,
              members: artifact.leafValues.map((leafValue, leafIndex) => ({
                credentialId: credentialByCommitment.get(leafValue)!,
                leafIndex,
                leafValue,
              })),
              merkleRoot: artifact.merkleRoot,
              treeDepth: artifact.treeDepth,
              version,
            },
            this.clock,
          ),
        { actorAdminId: principal.adminId, requestId },
      );
      return snapshot.snapshot();
    } catch (error: unknown) {
      return toApplicationError(error);
    }
  }

  async freezeSnapshot(
    rawElectionId: string,
    rawSnapshotId: string,
    principal: AdminPrincipal,
    requestId?: string,
  ): Promise<EligibilitySnapshotState> {
    const election = await this.loadDraftElection(rawElectionId);
    let snapshot;
    try {
      snapshot = await this.snapshots.findById(eligibilitySnapshotId(rawSnapshotId));
    } catch (error: unknown) {
      return toApplicationError(error);
    }
    if (!snapshot || snapshot.snapshot().electionId !== election.snapshot().id) {
      throw new ApplicationError(
        'ELIGIBILITY_SNAPSHOT_NOT_FOUND',
        'Eligibility snapshot not found.',
        'not-found',
      );
    }
    const state = snapshot.snapshot();
    if (
      state.configurationVersion !== election.snapshot().configurationVersion + 1 ||
      election.snapshot().references.eligibilityConfigurationRef !== state.id
    ) {
      throw new ApplicationError(
        'ELIGIBILITY_SNAPSHOT_NOT_BUILDING',
        'Snapshot is not the active draft eligibility configuration.',
        'domain-rule',
      );
    }
    try {
      const valid = await this.merkle.verify(state.commitmentSchemeVersion, {
        leafValues: state.members.map((member) => member.leafValue),
        merkleRoot: state.merkleRoot,
        treeDepth: state.treeDepth,
      });
      if (!valid) {
        throw new EligibilityDomainError(
          'INVALID_IDENTITY_COMMITMENT',
          'Merkle artifact verification failed.',
        );
      }
      snapshot.freeze(this.clock);
      await this.snapshots.freeze(snapshot, state.rowVersion, {
        actorAdminId: principal.adminId,
        requestId,
      });
      return snapshot.snapshot();
    } catch (error: unknown) {
      return toApplicationError(error);
    }
  }

  private async loadVoter(rawId: string): Promise<EligibleVoter> {
    let voter;
    try {
      voter = await this.voters.findById(eligibleVoterId(rawId));
    } catch (error: unknown) {
      return toApplicationError(error);
    }
    if (!voter) {
      throw new ApplicationError(
        'ELIGIBLE_VOTER_NOT_FOUND',
        'Eligible voter not found.',
        'not-found',
      );
    }
    return voter;
  }

  private async loadDraftElection(rawId: string): Promise<Election> {
    let election;
    try {
      election = await this.elections.findById(electionId(rawId));
    } catch {
      election = null;
    }
    if (!election) {
      throw new ApplicationError('ELECTION_NOT_FOUND', 'Election not found.', 'not-found');
    }
    if (election.snapshot().status !== 'DRAFT') {
      throw new ApplicationError(
        'ELECTION_CONFIGURATION_FROZEN',
        'Eligibility can only be configured while the election is in draft.',
        'domain-rule',
      );
    }
    return election;
  }
}
