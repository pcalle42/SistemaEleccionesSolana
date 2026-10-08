import { readFile } from 'node:fs/promises';

import { expect, test, type Route } from '@playwright/test';

import { canonicalDigest } from '../../apps/voter-web/src/security/digest.js';

const apiBase = 'http://localhost:3000/api/v1';
const electionId = '018f47f2-a7e3-7f1c-8a55-40db41d61c34';
const xssCanary = '<img src=x onerror="globalThis.__xssCanary=true">';

function fulfillJson(route: Route, body: unknown, status = 200): Promise<void> {
  const origin = route.request().headers()['origin'];
  return route.fulfill({
    body: JSON.stringify(body),
    contentType: 'application/json',
    headers: origin
      ? { 'Access-Control-Allow-Credentials': 'true', 'Access-Control-Allow-Origin': origin }
      : {},
    status,
  });
}

function fulfillPreflight(route: Route): Promise<void> {
  const origin = route.request().headers()['origin'] ?? 'null';
  return route.fulfill({
    headers: {
      'Access-Control-Allow-Credentials': 'true',
      'Access-Control-Allow-Headers': 'content-type,x-csrf-token',
      'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Private-Network': 'true',
    },
    status: 204,
  });
}

function assertSecurityHeaders(headers: Record<string, string>): void {
  expect(headers['content-security-policy']).toContain("default-src 'self'");
  expect(headers['content-security-policy']).toContain("frame-ancestors 'none'");
  expect(headers['x-content-type-options']).toBe('nosniff');
  expect(headers['referrer-policy']).toBe('no-referrer');
  expect(headers['permissions-policy']).toContain('camera=()');
}

test('admin uses cookie/CSRF boundaries and renders hostile election text safely', async ({
  page,
}) => {
  const election = {
    cancellationReason: null,
    circuitVersion: null,
    closesAt: '2030-01-01T13:00:00.000Z',
    configurationVersion: 0,
    description: xssCanary,
    id: electionId,
    opensAt: '2030-01-01T12:00:00.000Z',
    options: [
      { description: null, displayOrder: 0, id: 'option-a', label: xssCanary },
      { description: null, displayOrder: 1, id: 'option-b', label: 'B' },
    ],
    protocolVersion: null,
    status: 'DRAFT',
    title: xssCanary,
  };
  let csrfObserved = false;
  let loginPayload: unknown;
  const failedRequests: string[] = [];
  page.on('requestfailed', (request) => {
    failedRequests.push(
      `${request.method()} ${request.url()}: ${request.failure()?.errorText ?? 'unknown'}`,
    );
  });
  await page.route(`${apiBase}/**`, async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (request.method() === 'OPTIONS') {
      await fulfillPreflight(route);
    } else if (path.endsWith('/admin/auth/session')) {
      await fulfillJson(route, { error: { code: 'UNAUTHENTICATED' } }, 401);
    } else if (path.endsWith('/admin/auth/login')) {
      loginPayload = request.postDataJSON();
      await fulfillJson(route, { adminId: 'admin-test', csrfToken: 'csrf-test' });
    } else if (path === '/api/v1/admin/elections' && request.method() === 'POST') {
      csrfObserved = request.headers()['x-csrf-token'] === 'csrf-test';
      await fulfillJson(route, election, 201);
    } else if (path === '/api/v1/admin/elections') {
      await fulfillJson(route, [election]);
    } else {
      await fulfillJson(route, []);
    }
  });

  const response = await page.goto('http://localhost:4301');
  assertSecurityHeaders(response!.headers());
  await page.getByLabel('Usuario').fill('admin');
  await page.getByLabel('Contraseña').fill('test-password');
  await page.getByRole('button', { name: 'Iniciar sesión' }).click();
  await expect
    .poll(async () => ({
      failedRequests,
      loginPayload,
      status: await page.locator('#global-status, .login-card .status').textContent(),
    }))
    .toEqual({
      failedRequests: [],
      loginPayload: { password: 'test-password', username: 'admin' },
      status: '',
    });
  await expect(page.getByRole('heading', { name: xssCanary })).toBeVisible();
  expect(
    await page.evaluate(() => Boolean((globalThis as { __xssCanary?: boolean }).__xssCanary)),
  ).toBe(false);

  await page.getByText('Crear elección en borrador').click();
  await page.getByLabel('Título').fill('Nueva elección');
  await page.getByLabel('Apertura').fill('2030-02-01T12:00');
  await page.getByLabel('Cierre').fill('2030-02-01T13:00');
  await page.getByLabel('Opción A').fill('Uno');
  await page.getByLabel('Opción B').fill('Dos');
  await page.getByRole('button', { name: 'Crear borrador' }).click();
  await expect.poll(() => csrfObserved).toBe(true);
});

test('voter performs real WebCrypto/WASM/Worker proof and retries an unknown outcome privately', async ({
  context,
  page,
}) => {
  const vector = JSON.parse(
    await readFile(
      new URL(
        '../../packages/zk-protocol/test-vectors/anonymous-single-choice-v1.json',
        import.meta.url,
      ),
      'utf8',
    ),
  ) as {
    electionContext: string;
    identityCommitment: string;
    merklePathElements: string[];
    merklePathIndices: number[];
    merkleRoot: string;
    nullifier: string;
    voterSecret: string;
  };
  const protocol = JSON.parse(
    await readFile(
      new URL(
        '../../packages/zk-protocol/manifests/anonymous-single-choice-v1.json',
        import.meta.url,
      ),
      'utf8',
    ),
  ) as { artifactDigests: Record<string, string> };
  const manifest = {
    artifactDigests: protocol.artifactDigests,
    circuitVersion: '1.0.0',
    closesAt: '2030-01-01T13:00:00.000Z',
    commitmentSchemeVersion: 'poseidon-bn254-v1',
    createdAt: '2030-01-01T10:00:00.000Z',
    electionConfigurationVersion: 3,
    electionContext: vector.electionContext,
    electionId,
    eligibilitySnapshotVersion: 1,
    leafCount: 3,
    manifestVersion: 'election-manifest-v1' as const,
    merkleRoot: vector.merkleRoot,
    nullifierSchemeVersion: 'poseidon-election-v1',
    opensAt: '2030-01-01T11:00:00.000Z',
    optionEncoding: 'zero-based-index',
    options: [
      { encoding: 0, id: 'option-candidate-alpha', label: 'Alpha' },
      { encoding: 1, id: 'option-candidate-beta', label: xssCanary },
      { encoding: 2, id: 'option-blank', label: 'Blank' },
    ],
    protocolVersion: 'anonymous-single-choice-v1',
    title: xssCanary,
    treeDepth: 20,
    verificationKeyDigest: protocol.artifactDigests['verificationKeySha256']!,
    voteEncodingVersion: 'single-choice-index-v1',
    votingMethod: 'SINGLE_CHOICE',
  };
  const manifestDigest = await canonicalDigest('votaciones/election-manifest/v1', manifest);
  const credential = {
    electionId,
    formatVersion: 'voter-credential-v1',
    identityCommitment: vector.identityCommitment,
    protocolVersion: 'anonymous-single-choice-v1',
    voterSecret: vector.voterSecret,
  };
  const eligibility = {
    electionId,
    formatVersion: 'eligibility-material-v1',
    identityCommitment: vector.identityCommitment,
    merklePathElements: vector.merklePathElements,
    merklePathIndices: vector.merklePathIndices,
    merkleRoot: vector.merkleRoot,
    protocolVersion: 'anonymous-single-choice-v1',
  };
  const contactedOrigins = new Set<string>();
  page.on('request', (request) => contactedOrigins.add(new URL(request.url()).origin));
  let castPayload: Record<string, unknown> | undefined;
  let castAttempts = 0;
  await page.route(`${apiBase}/**`, async (route) => {
    const request = route.request();
    if (request.method() === 'OPTIONS') {
      await fulfillPreflight(route);
      return;
    }
    if (request.url().endsWith(`/elections/${electionId}/manifest`)) {
      await fulfillJson(route, { manifest, manifestDigest });
      return;
    }
    if (request.url().endsWith(`/elections/${electionId}/votes`)) {
      castAttempts += 1;
      castPayload = request.postDataJSON() as Record<string, unknown>;
      if (castAttempts === 1) {
        await route.abort('failed');
      } else {
        await fulfillJson(
          route,
          {
            receipt: {
              acceptedAt: '2030-01-01T12:00:00.000Z',
              electionId,
              nullifier: vector.nullifier,
              receiptCommitment: 'a'.repeat(64),
              receiptVersion: 'anonymous-vote-receipt-v1',
            },
            status: 'accepted',
          },
          201,
        );
      }
      return;
    }
    await fulfillJson(route, {});
  });

  const response = await page.goto('http://localhost:4302');
  assertSecurityHeaders(response!.headers());
  await page.getByLabel('Identificador de elección').fill(electionId);
  await page.getByRole('button', { name: 'Validar manifest' }).click();
  await expect(page.getByRole('heading', { name: xssCanary })).toBeVisible();
  expect(
    await page.evaluate(() => Boolean((globalThis as { __xssCanary?: boolean }).__xssCanary)),
  ).toBe(false);

  await page.getByLabel('Importar credencial privada').setInputFiles({
    buffer: Buffer.from(JSON.stringify(credential)),
    mimeType: 'application/json',
    name: 'credential.test-only.json',
  });
  await page.getByLabel('Importar material de elegibilidad').setInputFiles({
    buffer: Buffer.from(JSON.stringify(eligibility)),
    mimeType: 'application/json',
    name: 'eligibility.test-only.json',
  });
  await page.getByLabel(xssCanary).check();
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'Confirmar y generar prueba' }).click();
  await expect(page.getByRole('status')).toHaveText(
    /Prueba verificada localmente y lista para enviar\.|[A-Z][A-Z0-9_]{4,}/u,
    { timeout: 90_000 },
  );
  await expect(page.getByRole('status')).toHaveText(
    'Prueba verificada localmente y lista para enviar.',
  );
  await page.getByRole('button', { name: 'Enviar voto anónimo' }).click();
  await expect(page.getByText(/No se pudo confirmar el resultado/u)).toBeVisible();
  await page.getByRole('button', { name: 'Reintentar el mismo voto' }).click();
  await expect(page.getByText('Voto aceptado. Guarda tu receipt público.')).toBeVisible();

  expect(castAttempts).toBe(2);
  expect(Object.keys(castPayload!).sort()).toEqual(['proof', 'protocolVersion', 'publicSignals']);
  const serialized = JSON.stringify(castPayload);
  for (const forbidden of [
    'eligibleVoterId',
    'credentialId',
    'externalReference',
    'voterSecret',
    'identityCommitment',
    'merklePathElements',
    vector.voterSecret,
  ]) {
    expect(serialized).not.toContain(forbidden);
  }
  expect(await context.cookies()).toEqual([]);
  expect(
    await page.evaluate(async () => ({
      cacheKeys: await caches.keys(),
      indexedDatabases: (await indexedDB.databases()).map(({ name }) => name),
      localStorage: Object.keys(localStorage),
      sessionStorage: Object.keys(sessionStorage),
    })),
  ).toEqual({ cacheKeys: [], indexedDatabases: [], localStorage: [], sessionStorage: [] });
  expect([...contactedOrigins].sort()).toEqual(['http://localhost:3000', 'http://localhost:4302']);
  expect(page.url()).not.toContain(vector.voterSecret);
  expect(page.url()).not.toContain(vector.nullifier);
});
