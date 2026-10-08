import type { Groth16Proof } from 'snarkjs';
import { parseElectionManifest, type ElectionManifestEnvelope } from '../election/manifest.js';

export class PublicApiError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'PublicApiError';
  }
}

export interface VoteReceipt {
  readonly acceptedAt: string;
  readonly electionId: string;
  readonly nullifier: string;
  readonly receiptCommitment: string;
  readonly receiptVersion: string;
}

export interface CastVoteResponse {
  readonly receipt: VoteReceipt;
  readonly status: 'accepted';
}
export interface ElectionResult {
  readonly electionId: string;
  readonly publicationDigest: string;
  readonly publishedAt: string;
  readonly resultVersion: number;
  readonly totalAcceptedVotes: number;
  readonly totalsByOption: readonly {
    readonly count: number;
    readonly encoding: number;
    readonly label: string;
    readonly optionId: string;
  }[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function parseCastVote(value: unknown): CastVoteResponse {
  if (
    !isRecord(value) ||
    !isRecord(value['receipt']) ||
    value['status'] !== 'accepted' ||
    typeof value['receipt']['electionId'] !== 'string' ||
    typeof value['receipt']['nullifier'] !== 'string' ||
    typeof value['receipt']['receiptCommitment'] !== 'string' ||
    typeof value['receipt']['receiptVersion'] !== 'string'
  ) {
    throw new PublicApiError('INVALID_RESPONSE', 'Receipt inválido.', 500);
  }
  return value as unknown as CastVoteResponse;
}

function parseResult(value: unknown): ElectionResult {
  if (
    !isRecord(value) ||
    typeof value['electionId'] !== 'string' ||
    !Number.isSafeInteger(value['resultVersion']) ||
    !Number.isSafeInteger(value['totalAcceptedVotes']) ||
    typeof value['publicationDigest'] !== 'string' ||
    typeof value['publishedAt'] !== 'string' ||
    !Array.isArray(value['totalsByOption']) ||
    !value['totalsByOption'].every(
      (item) =>
        isRecord(item) && Number.isSafeInteger(item['count']) && typeof item['label'] === 'string',
    )
  ) {
    throw new PublicApiError('INVALID_RESPONSE', 'Resultado electoral inválido.', 500);
  }
  return value as unknown as ElectionResult;
}

async function request(fetcher: typeof fetch, url: string, init?: RequestInit): Promise<unknown> {
  let response: Response;
  try {
    response = await fetcher(url, {
      ...init,
      credentials: 'omit',
      headers: {
        Accept: 'application/json',
        ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
      },
    });
  } catch {
    throw new PublicApiError('NETWORK_ERROR', 'No se pudo confirmar la respuesta del servidor.', 0);
  }
  if (response.ok) return response.json();
  const body = (await response.json().catch(() => ({}))) as {
    error?: { code?: string; message?: string };
  };
  throw new PublicApiError(
    body.error?.code ?? 'REQUEST_FAILED',
    body.error?.message ?? 'La solicitud falló.',
    response.status,
  );
}

export class PublicElectionApiClient {
  constructor(
    private readonly baseUrl: string,
    private readonly fetcher: typeof fetch = fetch,
  ) {}
  async manifest(electionId: string): Promise<ElectionManifestEnvelope> {
    return parseElectionManifest(
      await request(
        this.fetcher,
        `${this.baseUrl}/elections/${encodeURIComponent(electionId)}/manifest`,
      ),
      electionId,
    );
  }
}

export class VotingApiClient {
  constructor(
    private readonly baseUrl: string,
    private readonly fetcher: typeof fetch = fetch,
  ) {}
  async cast(
    electionId: string,
    payload: { proof: Groth16Proof; protocolVersion: string; publicSignals: readonly string[] },
  ): Promise<CastVoteResponse> {
    const value = await request(
      this.fetcher,
      `${this.baseUrl}/elections/${encodeURIComponent(electionId)}/votes`,
      { method: 'POST', body: JSON.stringify(payload) },
    );
    return parseCastVote(value);
  }
}

export class VerificationApiClient {
  constructor(
    private readonly baseUrl: string,
    private readonly fetcher: typeof fetch = fetch,
  ) {}
  async result(electionId: string, version?: number): Promise<ElectionResult> {
    const suffix = version === undefined ? '' : `/${version}`;
    return parseResult(
      await request(
        this.fetcher,
        `${this.baseUrl}/elections/${encodeURIComponent(electionId)}/results${suffix}`,
      ),
    );
  }
  metadata(electionId: string): Promise<unknown> {
    return request(
      this.fetcher,
      `${this.baseUrl}/elections/${encodeURIComponent(electionId)}/verification`,
    );
  }
  receipt(electionId: string, commitment: string): Promise<unknown> {
    return request(
      this.fetcher,
      `${this.baseUrl}/elections/${encodeURIComponent(electionId)}/verification/receipts/${encodeURIComponent(commitment)}`,
    );
  }
}
