import { describe, expect, it, vi } from 'vitest';
import { CIRCUIT_VERSION_V1, PROTOCOL_VERSION_V1 } from '@votaciones/zk-protocol';

import type { VoteProofVerifier } from '../../zk/application/ports/vote-proof-verifier.port.js';
import type { VoteAcceptanceContext } from '../domain/accepted-vote.js';
import { createVoteReceiptV1 } from '../domain/vote-receipt.js';
import { VotingError } from '../domain/voting-errors.js';
import type { VoteRepository } from './ports/vote-repository.port.js';
import { CastVoteService } from './cast-vote.service.js';

const electionId = '26ec012a-c9d0-4c21-9fb3-27a5ff3a7c8a';
const publicSignals = ['10', '20', '30', '1', '2'];
const context: VoteAcceptanceContext = {
  circuitVersion: CIRCUIT_VERSION_V1,
  closesAt: new Date('2030-01-01T13:00:00.000Z'),
  configurationVersion: 1,
  electionContext: '30',
  electionId,
  merkleRoot: '10',
  observedAt: new Date('2030-01-01T12:00:00.000Z'),
  opensAt: new Date('2030-01-01T11:00:00.000Z'),
  optionCount: 2,
  protocolVersion: PROTOCOL_VERSION_V1,
  status: 'OPEN',
};

function fixture() {
  const receipt = createVoteReceiptV1({
    acceptedAt: context.observedAt,
    configurationVersion: 1,
    electionId,
    nullifier: '20',
    protocolVersion: PROTOCOL_VERSION_V1,
    voteEncoding: 1,
  });
  const accept = vi.fn((command: Parameters<VoteRepository['accept']>[0]) => {
    void command;
    return Promise.resolve({ idempotentRetry: false, receipt });
  });
  const findByNullifier = vi.fn(() => Promise.resolve(null));
  const loadAcceptanceContext = vi.fn(() => Promise.resolve(context));
  const repository: VoteRepository = { accept, findByNullifier, loadAcceptanceContext };
  const verify = vi.fn(() =>
    Promise.resolve({
      circuitVersion: CIRCUIT_VERSION_V1,
      protocolVersion: PROTOCOL_VERSION_V1,
      publicSignals: {
        electionContext: '30',
        merkleRoot: '10',
        nullifier: '20',
        optionCount: 2,
        voteChoice: 1,
      },
    }),
  );
  const verifier: VoteProofVerifier = { verify };
  return {
    accept,
    loadAcceptanceContext,
    repository,
    service: new CastVoteService(repository, verifier),
    verifier,
    verify,
  };
}

describe('CastVoteService', () => {
  it('verifies outside persistence and accepts without identity inputs', async () => {
    const { accept, service, verify } = fixture();
    await expect(
      service.cast({
        electionId,
        proof: { proof: true },
        protocolVersion: PROTOCOL_VERSION_V1,
        publicSignals,
      }),
    ).resolves.toMatchObject({ status: 'accepted' });
    expect(verify).toHaveBeenCalledOnce();
    const submitted = accept.mock.calls[0]?.[0];
    expect(submitted).not.toHaveProperty('credentialId');
    expect(submitted).not.toHaveProperty('eligibleVoterId');
  });

  it('rejects root, context, protocol and encoding mismatches before pairing', async () => {
    const cases = [
      { protocolVersion: 'unknown', signals: publicSignals, code: 'UNSUPPORTED_PROTOCOL_VERSION' },
      {
        protocolVersion: PROTOCOL_VERSION_V1,
        signals: ['11', ...publicSignals.slice(1)],
        code: 'PROOF_ROOT_MISMATCH',
      },
      {
        protocolVersion: PROTOCOL_VERSION_V1,
        signals: [...publicSignals.slice(0, 2), '31', ...publicSignals.slice(3)],
        code: 'PROOF_ELECTION_CONTEXT_MISMATCH',
      },
      {
        protocolVersion: PROTOCOL_VERSION_V1,
        signals: [...publicSignals.slice(0, 4), '3'],
        code: 'INVALID_VOTE_ENCODING',
      },
    ];
    for (const item of cases) {
      const { service, verify } = fixture();
      await expect(
        service.cast({
          electionId,
          proof: {},
          protocolVersion: item.protocolVersion,
          publicSignals: item.signals,
        }),
      ).rejects.toMatchObject({ code: item.code });
      expect(verify).not.toHaveBeenCalled();
    }
  });

  it('rejects OPEN at the exclusive closing boundary', async () => {
    const { loadAcceptanceContext, service } = fixture();
    loadAcceptanceContext.mockResolvedValue({
      ...context,
      observedAt: context.closesAt,
    });
    await expect(
      service.cast({ electionId, proof: {}, protocolVersion: PROTOCOL_VERSION_V1, publicSignals }),
    ).rejects.toMatchObject({ code: 'ELECTION_CLOSED' });
  });

  it('fails closed when the verifier or PostgreSQL authority is unavailable', async () => {
    const unavailableVerifier = fixture();
    unavailableVerifier.verify.mockRejectedValue(new Error('pairing crashed'));
    await expect(
      unavailableVerifier.service.cast({
        electionId,
        proof: {},
        protocolVersion: PROTOCOL_VERSION_V1,
        publicSignals,
      }),
    ).rejects.toMatchObject({ code: 'ZK_VERIFIER_UNAVAILABLE' });

    const unavailableDatabase = fixture();
    unavailableDatabase.loadAcceptanceContext.mockRejectedValue(
      new VotingError('VOTE_ACCEPTANCE_UNAVAILABLE', 'Vote acceptance is unavailable.'),
    );
    await expect(
      unavailableDatabase.service.cast({
        electionId,
        proof: {},
        protocolVersion: PROTOCOL_VERSION_V1,
        publicSignals,
      }),
    ).rejects.toMatchObject({ code: 'VOTE_ACCEPTANCE_UNAVAILABLE' });
  });
});
