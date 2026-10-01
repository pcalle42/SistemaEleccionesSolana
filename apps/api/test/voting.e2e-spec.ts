import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import {
  buildMerkleTreeV1,
  CIRCUIT_ID_V1,
  CIRCUIT_VERSION_V1,
  COMMITMENT_SCHEME_VERSION_V1,
  deriveElectionContextV1,
  deriveIdentityCommitmentV1,
  deriveNullifierV1,
  NULLIFIER_SCHEME_VERSION_V1,
  PROTOCOL_VERSION_V1,
  protocolArtifactLocationsV1,
  TREE_DEPTH_V1,
  VOTE_ENCODING_VERSION_V1,
} from '@votaciones/zk-protocol';
import { Logger } from 'nestjs-pino';
import { groth16, type Groth16Proof } from 'snarkjs';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { AppModule } from '../src/app.module.js';
import { configureApplication } from '../src/bootstrap.js';
import { getAppConfig } from '../src/config/app-config.js';
import { APP_CONFIG } from '../src/config/config.tokens.js';
import { DatabaseLifecycleService } from '../src/database/database-lifecycle.service.js';
import type {
  VoteAcceptanceContext,
  AcceptedVoteRecord,
} from '../src/modules/voting/domain/accepted-vote.js';
import { createVoteReceiptV1 } from '../src/modules/voting/domain/vote-receipt.js';
import { VotingError } from '../src/modules/voting/domain/voting-errors.js';
import type {
  AcceptVerifiedVote,
  VoteRepository,
} from '../src/modules/voting/application/ports/vote-repository.port.js';
import { VOTE_ADMISSION, VOTE_REPOSITORY } from '../src/modules/voting/voting.tokens.js';
import { ValkeyLifecycleService } from '../src/valkey/valkey-lifecycle.service.js';

const electionId = '26ec012a-c9d0-4c21-9fb3-27a5ff3a7c8a';
const otherElectionId = '1b7f1355-070a-41df-9a32-c2c91084731f';
const optionIds = ['6fc3b4dc-64da-4b8f-8d89-47beea231665', 'baac93b0-bb33-4790-a6e2-ec3b786c0e0e'];
const config = getAppConfig({
  DATABASE_URL: 'postgresql://runtime:not-logged@127.0.0.1:5432/test',
  HTTP_BODY_LIMIT_BYTES: '262144',
  LOG_LEVEL: 'silent',
  OPENAPI_ENABLED: 'false',
  VALKEY_HOST: '127.0.0.1',
  VOTACIONES_ENV: 'test',
});

class MemoryVoteRepository implements VoteRepository {
  context!: VoteAcceptanceContext;
  failAfterNextCommit = false;
  readonly rows = new Map<string, AcceptedVoteRecord>();

  loadAcceptanceContext(id: string): Promise<VoteAcceptanceContext | null> {
    if (id === this.context.electionId) return Promise.resolve({ ...this.context });
    if (id === otherElectionId) {
      return Promise.resolve({ ...this.context, electionContext: '31', electionId: id });
    }
    return Promise.resolve(null);
  }

  accept(command: AcceptVerifiedVote) {
    const key = `${command.context.electionId}:${command.context.protocolVersion}:${command.nullifier}`;
    const existing = this.rows.get(key);
    if (existing) {
      if (existing.submissionFingerprint !== command.submissionFingerprint) {
        return Promise.reject(
          new VotingError('NULLIFIER_ALREADY_USED', 'Nullifier has already been used.'),
        );
      }
      return Promise.resolve({ idempotentRetry: true, receipt: existing.receipt });
    }
    if (this.context.status !== 'OPEN') {
      return Promise.reject(new VotingError('ELECTION_NOT_OPEN', 'Election is not open.'));
    }
    const receipt = createVoteReceiptV1({
      acceptedAt: this.context.observedAt,
      configurationVersion: this.context.configurationVersion,
      electionId: this.context.electionId,
      nullifier: command.nullifier,
      protocolVersion: this.context.protocolVersion,
      voteEncoding: command.voteEncoding,
    });
    const record: AcceptedVoteRecord = {
      circuitVersion: this.context.circuitVersion,
      configurationVersion: this.context.configurationVersion,
      electionId: this.context.electionId,
      id: '5a505bb4-e3cc-41d3-838e-e2dc943d6e5c',
      nullifier: command.nullifier,
      protocolVersion: this.context.protocolVersion,
      receipt,
      submissionFingerprint: command.submissionFingerprint,
      voteEncoding: command.voteEncoding,
    };
    this.rows.set(key, record);
    if (this.failAfterNextCommit) {
      this.failAfterNextCommit = false;
      return Promise.reject(new Error('simulated response loss after commit'));
    }
    return Promise.resolve({ idempotentRetry: false, receipt });
  }

  findByNullifier(election: string, protocol: string, nullifier: string) {
    return Promise.resolve(this.rows.get(`${election}:${protocol}:${nullifier}`) ?? null);
  }
}

function asSupertestServer(value: unknown): Parameters<typeof request>[0] {
  return value as Parameters<typeof request>[0];
}

describe('anonymous voting HTTP protocol', () => {
  let app: INestApplication;
  let httpServer: Parameters<typeof request>[0];
  let proofChoice0: Groth16Proof;
  let regeneratedProofChoice0: Groth16Proof;
  let proofChoice1: Groth16Proof;
  let publicSignalsChoice0: string[];
  let publicSignalsChoice1: string[];
  const votes = new MemoryVoteRepository();

  beforeAll(async () => {
    const secret = '987654321012345678909876543210123456789';
    const commitment = await deriveIdentityCommitmentV1(secret);
    const otherCommitment = await deriveIdentityCommitmentV1('7654321');
    const tree = await buildMerkleTreeV1([commitment, otherCommitment]);
    const electionContext = deriveElectionContextV1({
      circuitId: CIRCUIT_ID_V1,
      circuitVersion: CIRCUIT_VERSION_V1,
      commitmentSchemeVersion: COMMITMENT_SCHEME_VERSION_V1,
      configurationVersion: 1,
      electionId,
      nullifierSchemeVersion: NULLIFIER_SCHEME_VERSION_V1,
      options: optionIds.map((id, index) => ({ id, index })),
      protocolVersion: PROTOCOL_VERSION_V1,
      treeDepth: TREE_DEPTH_V1,
      voteEncodingVersion: VOTE_ENCODING_VERSION_V1,
    });
    votes.context = {
      circuitVersion: CIRCUIT_VERSION_V1,
      closesAt: new Date('2030-01-01T13:00:00.000Z'),
      configurationVersion: 1,
      electionContext,
      electionId,
      merkleRoot: tree.root,
      observedAt: new Date('2030-01-01T12:00:00.000Z'),
      opensAt: new Date('2030-01-01T11:00:00.000Z'),
      optionCount: 2,
      protocolVersion: PROTOCOL_VERSION_V1,
      status: 'OPEN',
    };
    const membership = tree.proof(tree.leaves.indexOf(commitment));
    const artifacts = protocolArtifactLocationsV1();
    const nullifier = await deriveNullifierV1(secret, electionContext);
    const prove = (voteChoice: number) =>
      groth16.fullProve(
        {
          electionContext,
          merklePathElements: [...membership.pathElements],
          merklePathIndices: [...membership.pathIndices],
          merkleRoot: tree.root,
          nullifier,
          optionCount: 2,
          voteChoice,
          voterSecret: secret,
        },
        artifacts.wasm.pathname,
        artifacts.zkey.pathname,
      );
    const [first, regenerated, conflicting] = await Promise.all([prove(0), prove(0), prove(1)]);
    proofChoice0 = first.proof;
    regeneratedProofChoice0 = regenerated.proof;
    proofChoice1 = conflicting.proof;
    publicSignalsChoice0 = first.publicSignals.map(String);
    publicSignalsChoice1 = conflicting.publicSignals.map(String);

    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(APP_CONFIG)
      .useValue(config)
      .overrideProvider(VOTE_REPOSITORY)
      .useValue(votes)
      .overrideProvider(VOTE_ADMISSION)
      .useValue({ execute: (_network: string, work: () => Promise<unknown>) => work() })
      .overrideProvider(DatabaseLifecycleService)
      .useValue({ health: vi.fn(), onApplicationShutdown: vi.fn() })
      .overrideProvider(ValkeyLifecycleService)
      .useValue({ health: vi.fn(), onApplicationShutdown: vi.fn(), onModuleInit: vi.fn() })
      .compile();
    app = module.createNestApplication<NestExpressApplication>({ bodyParser: false });
    app.useLogger(app.get(Logger));
    configureApplication(app as NestExpressApplication, config);
    await app.init();
    httpServer = asSupertestServer(app.getHttpServer());
  }, 60_000);

  afterAll(async () => app.close());

  it('accepts a real proof and returns an anonymous reproducible receipt', async () => {
    const response = await request(httpServer)
      .post(`/api/v1/elections/${electionId}/votes`)
      .send({
        proof: proofChoice0,
        protocolVersion: PROTOCOL_VERSION_V1,
        publicSignals: publicSignalsChoice0,
      })
      .expect(201);
    const body = response.body as {
      receipt: {
        acceptedAt: string;
        electionId: string;
        nullifier: string;
        receiptCommitment: string;
        receiptVersion: string;
      };
      status: string;
    };
    expect(body).toMatchObject({
      receipt: {
        acceptedAt: '2030-01-01T12:00:00.000Z',
        electionId,
        nullifier: publicSignalsChoice0[1],
        receiptVersion: 'anonymous-vote-receipt-v1',
      },
      status: 'accepted',
    });
    expect(body.receipt.receiptCommitment).toMatch(/^[0-9a-f]{64}$/u);
    expect(response.text).not.toContain('voteEncoding');
  });

  it('recovers the same receipt with a newly randomized proof for the same logical vote', async () => {
    expect(regeneratedProofChoice0).not.toEqual(proofChoice0);
    const response = await request(httpServer)
      .post(`/api/v1/elections/${electionId}/votes`)
      .send({
        proof: regeneratedProofChoice0,
        protocolVersion: PROTOCOL_VERSION_V1,
        publicSignals: publicSignalsChoice0,
      })
      .expect(201);
    const stored = [...votes.rows.values()][0]!;
    const body = response.body as { receipt: { receiptCommitment: string } };
    expect(body.receipt.receiptCommitment).toBe(stored.receipt.receiptCommitment);
    expect(votes.rows.size).toBe(1);
  });

  it('rejects the same nullifier with another selection without disclosing the prior choice', async () => {
    const response = await request(httpServer)
      .post(`/api/v1/elections/${electionId}/votes`)
      .send({
        proof: proofChoice1,
        protocolVersion: PROTOCOL_VERSION_V1,
        publicSignals: publicSignalsChoice1,
      })
      .expect(409);
    expect(response.body).toMatchObject({ error: { code: 'NULLIFIER_ALREADY_USED' } });
    expect(response.text).not.toContain('voteEncoding');
  });

  it('rejects altered proofs, unknown protocols and extra request properties', async () => {
    const altered = structuredClone(proofChoice0);
    altered.pi_c[0] = String(BigInt(altered.pi_c[0]!) + 1n);
    await request(httpServer)
      .post(`/api/v1/elections/${electionId}/votes`)
      .send({
        proof: altered,
        protocolVersion: PROTOCOL_VERSION_V1,
        publicSignals: publicSignalsChoice0,
      })
      .expect(400)
      .expect(({ body }) =>
        expect(body).toMatchObject({ error: { code: 'PROOF_VERIFICATION_FAILED' } }),
      );
    await request(httpServer)
      .post(`/api/v1/elections/${electionId}/votes`)
      .send({
        proof: proofChoice0,
        protocolVersion: 'unknown',
        publicSignals: publicSignalsChoice0,
      })
      .expect(400);
    await request(httpServer)
      .post(`/api/v1/elections/${electionId}/votes`)
      .send({
        proof: { ...proofChoice0, unexpected: true },
        protocolVersion: PROTOCOL_VERSION_V1,
        publicSignals: publicSignalsChoice0,
      })
      .expect(400);
    await request(httpServer)
      .post(`/api/v1/elections/${electionId}/votes`)
      .send({
        proof: proofChoice0,
        protocolVersion: PROTOCOL_VERSION_V1,
        publicSignals: publicSignalsChoice0,
        voterSecret: 'forbidden',
      })
      .expect(400);
  });

  it('rejects replaying the proof against another election context', async () => {
    await request(httpServer)
      .post(`/api/v1/elections/${otherElectionId}/votes`)
      .send({
        proof: proofChoice0,
        protocolVersion: PROTOCOL_VERSION_V1,
        publicSignals: publicSignalsChoice0,
      })
      .expect(409)
      .expect(({ body }) =>
        expect(body).toMatchObject({ error: { code: 'PROOF_ELECTION_CONTEXT_MISMATCH' } }),
      );
  });

  it('recovers after commit when the first HTTP response is lost', async () => {
    votes.rows.clear();
    votes.context = { ...votes.context, status: 'OPEN' };
    votes.failAfterNextCommit = true;
    const payload = {
      proof: proofChoice0,
      protocolVersion: PROTOCOL_VERSION_V1,
      publicSignals: publicSignalsChoice0,
    };
    await request(httpServer)
      .post(`/api/v1/elections/${electionId}/votes`)
      .send(payload)
      .expect(500);
    const retry = await request(httpServer)
      .post(`/api/v1/elections/${electionId}/votes`)
      .send(payload)
      .expect(201);
    expect(votes.rows.size).toBe(1);
    const body = retry.body as { receipt: { receiptCommitment: string } };
    expect(body.receipt.receiptCommitment).toBe(
      [...votes.rows.values()][0]?.receipt.receiptCommitment,
    );
  });

  it('fails closed after the election closes and enforces the HTTP body limit', async () => {
    votes.context = { ...votes.context, status: 'CLOSED' };
    await request(httpServer)
      .post(`/api/v1/elections/${electionId}/votes`)
      .send({
        proof: proofChoice0,
        protocolVersion: PROTOCOL_VERSION_V1,
        publicSignals: publicSignalsChoice0,
      })
      .expect(409)
      .expect(({ body }) => expect(body).toMatchObject({ error: { code: 'ELECTION_NOT_OPEN' } }));
    await request(httpServer)
      .post(`/api/v1/elections/${electionId}/votes`)
      .send({
        proof: { padding: 'x'.repeat(70_000) },
        protocolVersion: PROTOCOL_VERSION_V1,
        publicSignals: publicSignalsChoice0,
      })
      .expect(413);
  });
});
