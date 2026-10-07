export interface ApiErrorBody {
  readonly error?: {
    readonly code?: string;
    readonly message?: string;
    readonly requestId?: string;
  };
}

export class AdminApiError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'AdminApiError';
  }
}

export interface AdminSession {
  readonly adminId: string;
  readonly csrfToken: string;
}

export interface ElectionOption {
  readonly description: string | null;
  readonly displayOrder: number;
  readonly id: string;
  readonly label: string;
}

export interface Election {
  readonly cancellationReason: string | null;
  readonly circuitVersion: string | null;
  readonly closesAt: string;
  readonly configurationVersion: number;
  readonly description: string | null;
  readonly id: string;
  readonly opensAt: string;
  readonly options: readonly ElectionOption[];
  readonly protocolVersion: string | null;
  readonly status:
    'DRAFT' | 'READY' | 'OPEN' | 'CLOSED' | 'COUNTING' | 'RESULTS_PUBLISHED' | 'CANCELLED';
  readonly title: string;
}

export interface EligibleVoter {
  readonly displayName: string | null;
  readonly externalReference: string | null;
  readonly id: string;
  readonly status: string;
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

function parseSession(value: unknown): AdminSession {
  if (
    !isObject(value) ||
    typeof value['adminId'] !== 'string' ||
    typeof value['csrfToken'] !== 'string'
  ) {
    throw new AdminApiError('INVALID_RESPONSE', 'La respuesta de sesión no es válida.', 500);
  }
  return { adminId: value['adminId'], csrfToken: value['csrfToken'] };
}

function parseElection(value: unknown): Election {
  if (
    !isObject(value) ||
    typeof value['id'] !== 'string' ||
    typeof value['title'] !== 'string' ||
    typeof value['status'] !== 'string' ||
    !Array.isArray(value['options'])
  ) {
    throw new AdminApiError('INVALID_RESPONSE', 'La elección recibida no es válida.', 500);
  }
  return value as unknown as Election;
}

export class AdminApiClient {
  private csrfToken: string | undefined;

  constructor(
    private readonly baseUrl: string,
    private readonly fetcher: typeof fetch = fetch,
  ) {}

  async login(username: string, password: string): Promise<AdminSession> {
    const session = parseSession(
      await this.request(
        '/admin/auth/login',
        { method: 'POST', body: { username, password } },
        false,
      ),
    );
    this.csrfToken = session.csrfToken;
    return session;
  }

  async session(): Promise<AdminSession> {
    const session = parseSession(await this.request('/admin/auth/session', {}, false));
    this.csrfToken = session.csrfToken;
    return session;
  }

  async logout(): Promise<void> {
    await this.request('/admin/auth/logout', { method: 'POST' }, true, true);
    this.csrfToken = undefined;
  }

  async listElections(): Promise<readonly Election[]> {
    const value = await this.request('/admin/elections');
    if (!Array.isArray(value))
      throw new AdminApiError('INVALID_RESPONSE', 'Lista electoral inválida.', 500);
    return value.map(parseElection);
  }

  async createElection(input: Record<string, unknown>): Promise<Election> {
    return parseElection(
      await this.request('/admin/elections', { method: 'POST', body: input }, true),
    );
  }

  async transition(id: string, action: string, body?: Record<string, unknown>): Promise<unknown> {
    return this.request(
      `/admin/elections/${encodeURIComponent(id)}/${action}`,
      { method: 'POST', ...(body ? { body } : {}) },
      true,
    );
  }

  async listVoters(): Promise<readonly EligibleVoter[]> {
    const value = await this.request('/admin/eligible-voters');
    if (!Array.isArray(value)) throw new AdminApiError('INVALID_RESPONSE', 'Padrón inválido.', 500);
    return value as EligibleVoter[];
  }

  async registerCredential(eligibleVoterId: string, identityCommitment: string): Promise<unknown> {
    return this.request(
      '/admin/electoral-credentials',
      {
        method: 'POST',
        body: { eligibleVoterId, identityCommitment, schemeVersion: 'poseidon-bn254-v1' },
      },
      true,
    );
  }

  async buildSnapshot(electionId: string): Promise<unknown> {
    return this.request(
      `/admin/elections/${encodeURIComponent(electionId)}/eligibility-snapshots`,
      { method: 'POST' },
      true,
    );
  }

  async audit(streamId?: string, eventType?: string): Promise<readonly unknown[]> {
    const query = new URLSearchParams();
    if (streamId) query.set('streamId', streamId);
    if (eventType) query.set('eventType', eventType);
    const value = await this.request(`/admin/audit${query.size > 0 ? `?${query}` : ''}`);
    if (!Array.isArray(value))
      throw new AdminApiError('INVALID_RESPONSE', 'Auditoría inválida.', 500);
    return value.map((item: unknown) => item);
  }

  private async request(
    path: string,
    init: { method?: string; body?: unknown } = {},
    csrf = false,
    allowEmpty = false,
  ): Promise<unknown> {
    const headers = new Headers({ Accept: 'application/json' });
    if (init.body !== undefined) headers.set('Content-Type', 'application/json');
    if (csrf) {
      if (!this.csrfToken)
        throw new AdminApiError('CSRF_UNAVAILABLE', 'La sesión debe refrescarse.', 401);
      headers.set('x-csrf-token', this.csrfToken);
    }
    let response: Response;
    try {
      response = await this.fetcher(`${this.baseUrl}${path}`, {
        credentials: 'include',
        headers,
        method: init.method ?? 'GET',
        ...(init.body !== undefined ? { body: JSON.stringify(init.body) } : {}),
      });
    } catch {
      throw new AdminApiError('NETWORK_ERROR', 'No se pudo contactar al servidor.', 0);
    }
    if (response.ok) return allowEmpty || response.status === 204 ? undefined : response.json();
    const body = (await response.json().catch(() => ({}))) as ApiErrorBody;
    throw new AdminApiError(
      body.error?.code ?? 'REQUEST_FAILED',
      body.error?.message ?? 'La operación falló.',
      response.status,
    );
  }
}
