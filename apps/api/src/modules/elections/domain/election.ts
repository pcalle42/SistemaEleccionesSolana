import type { Clock } from './clock.js';
import type { ElectionId } from './election-id.js';
import { ElectionDomainError } from './election-errors.js';
import {
  createElectionOption,
  type ElectionOption,
  type ElectionOptionInput,
} from './election-option.js';
import { ALLOWED_ELECTION_TRANSITIONS, type ElectionStatus } from './election-status.js';
import type { VotingMethod } from './voting-method.js';

export interface ElectionConfigurationReferences {
  readonly circuitVersion: string | null;
  readonly eligibilityConfigurationRef: string | null;
  readonly protocolVersion: string | null;
}

export interface ElectionState {
  readonly cancellationReason: string | null;
  readonly closesAt: Date;
  readonly configurationVersion: number;
  readonly createdAt: Date;
  readonly description: string | null;
  readonly id: ElectionId;
  readonly opensAt: Date;
  readonly options: readonly ElectionOption[];
  readonly references: ElectionConfigurationReferences;
  readonly rowVersion: number;
  readonly status: ElectionStatus;
  readonly title: string;
  readonly updatedAt: Date;
  readonly votingMethod: VotingMethod;
}

export interface CreateElectionInput {
  readonly closesAt: Date;
  readonly description?: string | null;
  readonly id: ElectionId;
  readonly opensAt: Date;
  readonly options?: readonly ElectionOptionInput[];
  readonly references?: Partial<ElectionConfigurationReferences>;
  readonly title: string;
  readonly votingMethod?: VotingMethod;
}

export interface DraftElectionChanges {
  readonly closesAt?: Date;
  readonly description?: string | null;
  readonly opensAt?: Date;
  readonly options?: readonly ElectionOptionInput[];
  readonly references?: Partial<ElectionConfigurationReferences>;
  readonly title?: string;
  readonly votingMethod?: VotingMethod;
}

export interface ElectionStateChanged {
  readonly actorAdminId: string;
  readonly electionId: ElectionId;
  readonly newState: ElectionStatus;
  readonly previousState: ElectionStatus;
  readonly reason: string | null;
  readonly timestamp: Date;
}

export interface ResultPublicationEvidence {
  readonly configurationVersion: number;
  readonly electionId: ElectionId;
  readonly protocolVersion: string;
  readonly resultReference: string;
  readonly votingMethod: VotingMethod;
}

function cloneState(state: ElectionState): ElectionState {
  return {
    ...state,
    closesAt: new Date(state.closesAt),
    createdAt: new Date(state.createdAt),
    opensAt: new Date(state.opensAt),
    options: state.options.map((option) => ({ ...option })),
    references: { ...state.references },
    updatedAt: new Date(state.updatedAt),
  };
}

function validateWindow(opensAt: Date, closesAt: Date): void {
  if (
    !Number.isFinite(opensAt.getTime()) ||
    !Number.isFinite(closesAt.getTime()) ||
    opensAt >= closesAt
  ) {
    throw new ElectionDomainError(
      'INVALID_VOTING_WINDOW',
      'opensAt must be earlier than closesAt.',
    );
  }
}

function validateMetadata(
  titleInput: string,
  descriptionInput?: string | null,
): {
  description: string | null;
  title: string;
} {
  const title = titleInput.trim();
  const description = descriptionInput?.trim() || null;
  if (
    title.length === 0 ||
    title.length > 200 ||
    /[<>]/u.test(title) ||
    (description !== null && (description.length > 2_000 || /[<>]/u.test(description)))
  ) {
    throw new ElectionDomainError('INVALID_ELECTION_METADATA', 'Election metadata is invalid.');
  }
  return { description, title };
}

function validateOptions(inputs: readonly ElectionOptionInput[]): ElectionOption[] {
  const options = inputs.map(createElectionOption);
  const ids = new Set(options.map((option) => option.id));
  const orders = new Set(options.map((option) => option.displayOrder));
  if (ids.size !== options.length || orders.size !== options.length) {
    throw new ElectionDomainError(
      'INVALID_ELECTION_OPTION',
      'Option ids and display orders must be unique.',
    );
  }
  return options.sort((left, right) => left.displayOrder - right.displayOrder);
}

export class Election {
  private constructor(private state: ElectionState) {}

  static create(input: CreateElectionInput, clock: Clock): Election {
    validateWindow(input.opensAt, input.closesAt);
    const metadata = validateMetadata(input.title, input.description);
    const now = new Date(clock.now());
    return new Election({
      cancellationReason: null,
      closesAt: new Date(input.closesAt),
      configurationVersion: 0,
      createdAt: now,
      description: metadata.description,
      id: input.id,
      opensAt: new Date(input.opensAt),
      options: validateOptions(input.options ?? []),
      references: {
        circuitVersion: input.references?.circuitVersion?.trim() || null,
        eligibilityConfigurationRef: input.references?.eligibilityConfigurationRef?.trim() || null,
        protocolVersion: input.references?.protocolVersion?.trim() || null,
      },
      rowVersion: 0,
      status: 'DRAFT',
      title: metadata.title,
      updatedAt: now,
      votingMethod: input.votingMethod ?? 'SINGLE_CHOICE',
    });
  }

  static reconstitute(state: ElectionState): Election {
    return new Election(cloneState(state));
  }

  snapshot(): ElectionState {
    return cloneState(this.state);
  }

  updateDraft(changes: DraftElectionChanges, clock: Clock): void {
    if (this.state.status !== 'DRAFT') {
      throw new ElectionDomainError(
        'ELECTION_CONFIGURATION_FROZEN',
        'Election configuration is frozen.',
      );
    }
    const metadata = validateMetadata(
      changes.title ?? this.state.title,
      changes.description === undefined ? this.state.description : changes.description,
    );
    const opensAt = changes.opensAt ?? this.state.opensAt;
    const closesAt = changes.closesAt ?? this.state.closesAt;
    validateWindow(opensAt, closesAt);
    this.state = {
      ...this.state,
      closesAt: new Date(closesAt),
      description: metadata.description,
      opensAt: new Date(opensAt),
      options: changes.options ? validateOptions(changes.options) : this.state.options,
      references: {
        circuitVersion:
          changes.references?.circuitVersion === undefined
            ? this.state.references.circuitVersion
            : changes.references.circuitVersion?.trim() || null,
        eligibilityConfigurationRef:
          changes.references?.eligibilityConfigurationRef === undefined
            ? this.state.references.eligibilityConfigurationRef
            : changes.references.eligibilityConfigurationRef?.trim() || null,
        protocolVersion:
          changes.references?.protocolVersion === undefined
            ? this.state.references.protocolVersion
            : changes.references.protocolVersion?.trim() || null,
      },
      title: metadata.title,
      updatedAt: new Date(clock.now()),
      votingMethod: changes.votingMethod ?? this.state.votingMethod,
    };
  }

  prepare(actorAdminId: string, clock: Clock): ElectionStateChanged {
    if (this.state.status !== 'DRAFT') {
      throw new ElectionDomainError(
        'INVALID_ELECTION_TRANSITION',
        `Cannot transition election from ${this.state.status} to READY.`,
      );
    }
    if (
      this.state.options.length < 2 ||
      Object.values(this.state.references).some((value) => !value)
    ) {
      throw new ElectionDomainError(
        'ELECTION_CONFIGURATION_INCOMPLETE',
        'Election configuration is incomplete.',
      );
    }
    this.state = { ...this.state, configurationVersion: this.state.configurationVersion + 1 };
    return this.transition('READY', actorAdminId, clock, null);
  }

  reopenDraft(actorAdminId: string, clock: Clock, reason: string): ElectionStateChanged {
    return this.transition('DRAFT', actorAdminId, clock, requiredReason(reason));
  }

  open(actorAdminId: string, clock: Clock): ElectionStateChanged {
    const now = new Date(clock.now());
    if (now < this.state.opensAt) {
      throw new ElectionDomainError(
        'ELECTION_NOT_STARTED',
        'The election opening time has not arrived.',
      );
    }
    if (now >= this.state.closesAt) {
      throw new ElectionDomainError('ELECTION_CLOSED', 'The election voting window is closed.');
    }
    return this.transitionAt('OPEN', actorAdminId, now, null);
  }

  close(actorAdminId: string, clock: Clock): ElectionStateChanged {
    return this.transition('CLOSED', actorAdminId, clock, null);
  }

  startCounting(actorAdminId: string, clock: Clock): ElectionStateChanged {
    return this.transition('COUNTING', actorAdminId, clock, null);
  }

  publishResults(
    actorAdminId: string,
    clock: Clock,
    evidence: ResultPublicationEvidence,
  ): ElectionStateChanged {
    if (
      evidence.electionId !== this.state.id ||
      evidence.configurationVersion !== this.state.configurationVersion ||
      evidence.votingMethod !== this.state.votingMethod ||
      evidence.protocolVersion !== this.state.references.protocolVersion ||
      evidence.resultReference.trim().length === 0
    ) {
      throw new ElectionDomainError(
        'ELECTION_CONFIGURATION_INCOMPLETE',
        'A persisted and validated result is required.',
      );
    }
    return this.transition('RESULTS_PUBLISHED', actorAdminId, clock, null);
  }

  cancel(actorAdminId: string, clock: Clock, reason: string): ElectionStateChanged {
    const event = this.transition('CANCELLED', actorAdminId, clock, requiredReason(reason));
    this.state = { ...this.state, cancellationReason: event.reason };
    return event;
  }

  assertCanAcceptVote(clock: Clock): void {
    if (this.state.status !== 'OPEN') {
      throw new ElectionDomainError('ELECTION_NOT_OPEN', 'The election is not open.');
    }
    const now = new Date(clock.now());
    if (now < this.state.opensAt) {
      throw new ElectionDomainError('ELECTION_NOT_STARTED', 'The election has not started.');
    }
    if (now >= this.state.closesAt) {
      throw new ElectionDomainError('ELECTION_CLOSED', 'The election is closed.');
    }
  }

  private transition(
    newState: ElectionStatus,
    actorAdminId: string,
    clock: Clock,
    reason: string | null,
  ): ElectionStateChanged {
    return this.transitionAt(newState, actorAdminId, new Date(clock.now()), reason);
  }

  private transitionAt(
    newState: ElectionStatus,
    actorAdminId: string,
    timestamp: Date,
    reason: string | null,
  ): ElectionStateChanged {
    const previousState = this.state.status;
    if (!ALLOWED_ELECTION_TRANSITIONS[previousState].includes(newState)) {
      throw new ElectionDomainError(
        'INVALID_ELECTION_TRANSITION',
        `Cannot transition election from ${previousState} to ${newState}.`,
      );
    }
    const occurredAt = new Date(timestamp);
    this.state = { ...this.state, status: newState, updatedAt: occurredAt };
    return {
      actorAdminId,
      electionId: this.state.id,
      newState,
      previousState,
      reason,
      timestamp: new Date(occurredAt),
    };
  }
}

function requiredReason(value: string): string {
  const reason = value.trim();
  if (reason.length < 3 || reason.length > 1_000) {
    throw new ElectionDomainError('INVALID_ELECTION_TRANSITION', 'A valid reason is required.');
  }
  return reason;
}
