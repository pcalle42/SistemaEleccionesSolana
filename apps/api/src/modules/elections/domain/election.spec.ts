import { randomUUID } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import type { Clock } from './clock.js';
import { Election, type ElectionState } from './election.js';
import { electionId, electionOptionId } from './election-id.js';
import { ElectionDomainError } from './election-errors.js';
import {
  ALLOWED_ELECTION_TRANSITIONS,
  ELECTION_STATUSES,
  type ElectionStatus,
} from './election-status.js';

const actorAdminId = randomUUID();
const opensAt = new Date('2030-01-01T12:00:00.000Z');
const closesAt = new Date('2030-01-01T13:00:00.000Z');

class FixedClock implements Clock {
  constructor(private instant: Date) {}
  now(): Date {
    return new Date(this.instant);
  }
  set(instant: Date): void {
    this.instant = instant;
  }
}

function completeState(status: ElectionStatus = 'DRAFT', configurationVersion = 0): ElectionState {
  const now = new Date('2030-01-01T12:30:00.000Z');
  return {
    cancellationReason: null,
    closesAt,
    configurationVersion,
    createdAt: now,
    description: null,
    id: electionId(randomUUID()),
    opensAt,
    options: [
      { description: null, displayOrder: 0, id: electionOptionId(randomUUID()), label: 'A' },
      { description: null, displayOrder: 1, id: electionOptionId(randomUUID()), label: 'B' },
    ],
    references: {
      circuitVersion: 'circuit-v1',
      eligibilityConfigurationRef: 'eligibility-v1',
      protocolVersion: 'protocol-v1',
    },
    rowVersion: 0,
    status,
    title: 'Election',
    updatedAt: now,
    votingMethod: 'SINGLE_CHOICE',
  };
}

function transitionTo(election: Election, target: ElectionStatus, clock: Clock): void {
  switch (target) {
    case 'READY':
      election.prepare(actorAdminId, clock);
      break;
    case 'DRAFT':
      election.reopenDraft(actorAdminId, clock, 'Configuration correction');
      break;
    case 'OPEN':
      election.open(actorAdminId, clock);
      break;
    case 'CLOSED':
      election.close(actorAdminId, clock);
      break;
    case 'COUNTING':
      election.startCounting(actorAdminId, clock);
      break;
    case 'RESULTS_PUBLISHED':
      {
        const state = election.snapshot();
        election.publishResults(actorAdminId, clock, {
          configurationVersion: state.configurationVersion,
          electionId: state.id,
          protocolVersion: state.references.protocolVersion!,
          resultReference: 'persisted-result-v1',
          votingMethod: state.votingMethod,
        });
      }
      break;
    case 'CANCELLED':
      election.cancel(actorAdminId, clock, 'Administrative cancellation');
      break;
  }
}

describe('Election aggregate', () => {
  it('enforces the complete state transition matrix', () => {
    const clock = new FixedClock(new Date('2030-01-01T12:30:00.000Z'));
    for (const source of ELECTION_STATUSES) {
      for (const target of ELECTION_STATUSES) {
        const election = Election.reconstitute(completeState(source, source === 'DRAFT' ? 0 : 1));
        const allowed = ALLOWED_ELECTION_TRANSITIONS[source].includes(target);
        if (allowed) {
          expect(
            () => transitionTo(election, target, clock),
            `${source} -> ${target}`,
          ).not.toThrow();
          expect(election.snapshot().status).toBe(target);
        } else {
          expect(() => transitionTo(election, target, clock), `${source} -> ${target}`).toThrow(
            ElectionDomainError,
          );
        }
      }
    }
  });

  it('validates the window, option identity/order, and minimum ready configuration', () => {
    const clock = new FixedClock(new Date('2029-01-01T00:00:00.000Z'));
    expect(() =>
      Election.create(
        { closesAt: opensAt, id: electionId(randomUUID()), opensAt, title: 'Invalid' },
        clock,
      ),
    ).toThrowError(expect.objectContaining({ code: 'INVALID_VOTING_WINDOW' }));

    const duplicateId = electionOptionId(randomUUID());
    expect(() =>
      Election.create(
        {
          closesAt,
          id: electionId(randomUUID()),
          opensAt,
          options: [
            { displayOrder: 0, id: duplicateId, label: 'A' },
            { displayOrder: 1, id: duplicateId, label: 'B' },
          ],
          title: 'Invalid options',
        },
        clock,
      ),
    ).toThrowError(expect.objectContaining({ code: 'INVALID_ELECTION_OPTION' }));

    const incomplete = Election.reconstitute({ ...completeState(), options: [] });
    expect(() => incomplete.prepare(actorAdminId, clock)).toThrowError(
      expect.objectContaining({ code: 'ELECTION_CONFIGURATION_INCOMPLETE' }),
    );
  });

  it('freezes ready configuration and increments versions after reopening', () => {
    const clock = new FixedClock(new Date('2029-01-01T00:00:00.000Z'));
    const election = Election.reconstitute(completeState());
    election.prepare(actorAdminId, clock);
    expect(election.snapshot().configurationVersion).toBe(1);
    expect(() => election.updateDraft({ title: 'Forbidden' }, clock)).toThrowError(
      expect.objectContaining({ code: 'ELECTION_CONFIGURATION_FROZEN' }),
    );
    election.reopenDraft(actorAdminId, clock, 'Correct configuration');
    election.updateDraft({ title: 'Corrected' }, clock);
    election.prepare(actorAdminId, clock);
    expect(election.snapshot()).toMatchObject({ configurationVersion: 2, title: 'Corrected' });
  });

  it('uses the half-open voting interval with an injectable clock', () => {
    const clock = new FixedClock(new Date(opensAt.getTime() - 1));
    const election = Election.reconstitute(completeState('OPEN', 1));
    expect(() => election.assertCanAcceptVote(clock)).toThrowError(
      expect.objectContaining({ code: 'ELECTION_NOT_STARTED' }),
    );
    clock.set(opensAt);
    expect(() => election.assertCanAcceptVote(clock)).not.toThrow();
    clock.set(new Date(opensAt.getTime() + 1));
    expect(() => election.assertCanAcceptVote(clock)).not.toThrow();
    clock.set(closesAt);
    expect(() => election.assertCanAcceptVote(clock)).toThrowError(
      expect.objectContaining({ code: 'ELECTION_CLOSED' }),
    );
    clock.set(new Date(closesAt.getTime() + 1));
    expect(() => election.assertCanAcceptVote(clock)).toThrowError(
      expect.objectContaining({ code: 'ELECTION_CLOSED' }),
    );
  });
});
