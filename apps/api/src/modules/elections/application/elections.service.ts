import { Inject, Injectable } from '@nestjs/common';

import { ApplicationError } from '../../../common/errors/application-error.js';
import type { AdminPrincipal } from '../../auth/domain/admin-principal.js';
import type { Clock } from '../domain/clock.js';
import {
  Election,
  type CreateElectionInput,
  type DraftElectionChanges,
  type ElectionState,
} from '../domain/election.js';
import { electionId, newElectionId, type ElectionId } from '../domain/election-id.js';
import { ElectionDomainError } from '../domain/election-errors.js';
import { ELECTION_CLOCK, ELECTION_READINESS, ELECTION_REPOSITORY } from '../elections.tokens.js';
import type { ElectionReadinessVerifier } from './ports/election-readiness.port.js';
import type { ElectionRepository } from './ports/election-repository.port.js';

export type CreateElectionCommand = Omit<CreateElectionInput, 'id'>;

function applicationError(error: unknown): never {
  if (!(error instanceof ElectionDomainError)) {
    throw error;
  }
  const validationCodes = new Set([
    'INVALID_VOTING_WINDOW',
    'INVALID_ELECTION_OPTION',
    'INVALID_ELECTION_METADATA',
  ]);
  const category =
    error.code === 'ELECTION_NOT_FOUND'
      ? 'not-found'
      : validationCodes.has(error.code)
        ? 'validation'
        : 'domain-rule';
  throw new ApplicationError(error.code, error.message, category, { cause: error });
}

@Injectable()
export class ElectionsService {
  constructor(
    @Inject(ELECTION_REPOSITORY) private readonly repository: ElectionRepository,
    @Inject(ELECTION_READINESS) private readonly readiness: ElectionReadinessVerifier,
    @Inject(ELECTION_CLOCK) private readonly clock: Clock,
  ) {}

  async create(
    command: CreateElectionCommand,
    principal?: AdminPrincipal,
    requestId?: string,
  ): Promise<ElectionState> {
    try {
      const election = Election.create({ ...command, id: newElectionId() }, this.clock);
      await this.repository.create(election, principal?.adminId, requestId);
      return election.snapshot();
    } catch (error: unknown) {
      return applicationError(error);
    }
  }

  async list(): Promise<readonly ElectionState[]> {
    return (await this.repository.list()).map((election) => election.snapshot());
  }

  async get(id: string): Promise<ElectionState> {
    return (await this.load(id)).snapshot();
  }

  async updateDraft(
    id: string,
    changes: DraftElectionChanges,
    principal?: AdminPrincipal,
    requestId?: string,
  ): Promise<ElectionState> {
    const election = await this.load(id);
    const expectedRowVersion = election.snapshot().rowVersion;
    try {
      election.updateDraft(changes, this.clock);
      await this.repository.saveDraftChanges(
        election,
        expectedRowVersion,
        principal?.adminId,
        requestId,
      );
      return election.snapshot();
    } catch (error: unknown) {
      return applicationError(error);
    }
  }

  async prepare(id: string, principal: AdminPrincipal, requestId?: string): Promise<ElectionState> {
    const election = await this.load(id);
    const expectedRowVersion = election.snapshot().rowVersion;
    const assessment = await this.readiness.assess(election.snapshot());
    if (!assessment.eligibilityPrepared || !assessment.protocolCompatible) {
      throw new ApplicationError(
        'ELECTION_CONFIGURATION_INCOMPLETE',
        'Election eligibility or protocol configuration is not ready.',
        'domain-rule',
      );
    }
    try {
      const event = election.prepare(principal.adminId, this.clock);
      await this.repository.transitionState(election, event, expectedRowVersion, requestId);
      return election.snapshot();
    } catch (error: unknown) {
      return applicationError(error);
    }
  }

  async reopenDraft(
    id: string,
    principal: AdminPrincipal,
    reason: string,
    requestId?: string,
  ): Promise<ElectionState> {
    return this.applyTransition(id, requestId, (election) =>
      election.reopenDraft(principal.adminId, this.clock, reason),
    );
  }

  async open(id: string, principal: AdminPrincipal, requestId?: string): Promise<ElectionState> {
    const election = await this.load(id);
    const assessment = await this.readiness.assess(election.snapshot());
    if (!assessment.eligibilityPrepared || !assessment.protocolCompatible) {
      throw new ApplicationError(
        'ELECTION_CONFIGURATION_INCOMPLETE',
        'Election eligibility or protocol configuration is not ready.',
        'domain-rule',
      );
    }
    return this.applyLoadedTransition(election, requestId, (aggregate) =>
      aggregate.open(principal.adminId, this.clock),
    );
  }

  async close(id: string, principal: AdminPrincipal, requestId?: string): Promise<ElectionState> {
    return this.applyTransition(id, requestId, (election) =>
      election.close(principal.adminId, this.clock),
    );
  }

  async cancel(
    id: string,
    principal: AdminPrincipal,
    reason: string,
    requestId?: string,
  ): Promise<ElectionState> {
    return this.applyTransition(id, requestId, (election) =>
      election.cancel(principal.adminId, this.clock, reason),
    );
  }

  private async applyTransition(
    id: string,
    requestId: string | undefined,
    change: (election: Election) => ReturnType<Election['close']>,
  ): Promise<ElectionState> {
    return this.applyLoadedTransition(await this.load(id), requestId, change);
  }

  private async applyLoadedTransition(
    election: Election,
    requestId: string | undefined,
    change: (election: Election) => ReturnType<Election['close']>,
  ): Promise<ElectionState> {
    const expectedRowVersion = election.snapshot().rowVersion;
    try {
      const event = change(election);
      await this.repository.transitionState(election, event, expectedRowVersion, requestId);
      return election.snapshot();
    } catch (error: unknown) {
      return applicationError(error);
    }
  }

  private async load(rawId: string): Promise<Election> {
    let id: ElectionId;
    try {
      id = electionId(rawId);
    } catch {
      throw new ApplicationError('ELECTION_NOT_FOUND', 'Election not found.', 'not-found');
    }
    const election = await this.repository.findById(id);
    if (!election) {
      throw new ApplicationError('ELECTION_NOT_FOUND', 'Election not found.', 'not-found');
    }
    return election;
  }
}
