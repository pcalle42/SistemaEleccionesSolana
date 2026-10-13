import { createHash, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';

import { expect, test, type APIRequestContext } from '@playwright/test';
import {
  buildMerkleTreeV1,
  CIRCUIT_VERSION_V1,
  COMMITMENT_SCHEME_VERSION_V1,
  deriveIdentityCommitmentV1,
  PROTOCOL_VERSION_V1,
} from '../../packages/zk-protocol/src/index.js';

const apiBase = 'http://localhost:3000/api/v1';
const adminOrigin = 'http://localhost:3101';

type JsonObject = Record<string, unknown>;

function object(value: unknown, description: string): JsonObject {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`Invalid ${description} response`);
  }
  return value as JsonObject;
}

function stringField(value: JsonObject, field: string): string {
  const selected = value[field];
  if (typeof selected !== 'string') throw new Error(`Invalid ${field}`);
  return selected;
}

async function adminSession(request: APIRequestContext): Promise<string> {
  const response = await request.post(`${apiBase}/admin/auth/login`, {
    data: {
      password: process.env['DEVNET_ADMIN_PASSWORD'],
      username: process.env['DEVNET_ADMIN_USERNAME'],
    },
    headers: { Origin: adminOrigin },
  });
  expect(response.ok(), await response.text()).toBe(true);
  return stringField(object((await response.json()) as unknown, 'login'), 'csrfToken');
}

async function adminPost(
  request: APIRequestContext,
  csrfToken: string,
  path: string,
  data?: unknown,
): Promise<JsonObject> {
  const response = await request.post(`${apiBase}${path}`, {
    ...(data === undefined ? {} : { data }),
    headers: { Origin: adminOrigin, 'x-csrf-token': csrfToken },
  });
  expect(response.ok(), await response.text()).toBe(true);
  return object((await response.json()) as unknown, path);
}

test('real admin and voter browsers cross the live devnet API boundary', async ({
  context,
  page,
  request,
}) => {
  const suffix = randomUUID();
  const csrfToken = await adminSession(request);

  await page.goto('http://localhost:3101');
  await page.getByLabel('Usuario').fill(process.env['DEVNET_ADMIN_USERNAME']!);
  await page.getByLabel('Contraseña').fill(process.env['DEVNET_ADMIN_PASSWORD']!);
  await page.getByRole('button', { name: 'Iniciar sesión' }).click();
  await page.getByText('Crear elección en borrador').click();
  await page.getByLabel('Título').fill(`Browser admin path ${suffix}`);
  await page
    .getByLabel('Apertura')
    .fill(new Date(Date.now() + 60 * 60 * 1000).toISOString().slice(0, 16));
  await page
    .getByLabel('Cierre')
    .fill(new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString().slice(0, 16));
  await page.getByLabel('Opción A').fill('Synthetic A');
  await page.getByLabel('Opción B').fill('Synthetic B');
  await page.getByRole('button', { name: 'Crear borrador' }).click();
  await expect(page.getByRole('heading', { name: `Browser admin path ${suffix}` })).toBeVisible();
  await context.clearCookies();

  const fixture = JSON.parse(
    await readFile(new URL('../../fixtures/devnet/manifest.json', import.meta.url), 'utf8'),
  ) as {
    voters: { identityCommitment: string }[];
  };
  const secretDigest = createHash('sha256').update(suffix).digest('hex');
  const voterSecret = ((BigInt(`0x${secretDigest}`) % 2n ** 250n) + 1n).toString();
  const identityCommitment = await deriveIdentityCommitmentV1(voterSecret);
  const externalReference = `DEV-BROWSER-${suffix}`;
  await adminPost(request, csrfToken, '/admin/eligible-voters/import', {
    dryRun: false,
    records: [{ displayName: 'Synthetic browser voter', externalReference }],
  });
  const votersResponse = await request.get(`${apiBase}/admin/eligible-voters`);
  expect(votersResponse.ok(), await votersResponse.text()).toBe(true);
  const voterList = (await votersResponse.json()) as unknown;
  if (!Array.isArray(voterList)) throw new Error('Invalid eligible voter list');
  const registeredVoter = voterList
    .map((value) => object(value, 'eligible voter'))
    .find((voter) => voter['externalReference'] === externalReference);
  if (!registeredVoter) throw new Error('Synthetic browser voter was not registered');
  const credential = await adminPost(request, csrfToken, '/admin/electoral-credentials', {
    eligibleVoterId: stringField(registeredVoter, 'id'),
    identityCommitment,
    schemeVersion: COMMITMENT_SCHEME_VERSION_V1,
  });
  let electionId: string | undefined;
  try {
    const now = Date.now();
    const election = await adminPost(request, csrfToken, '/admin/elections', {
      circuitVersion: CIRCUIT_VERSION_V1,
      closesAt: new Date(now + 60 * 60 * 1000).toISOString(),
      description: 'Connected browser DEVNET ONLY path',
      opensAt: new Date(now - 60 * 1000).toISOString(),
      options: [
        { displayOrder: 0, label: 'Browser choice A' },
        { displayOrder: 1, label: 'Browser choice B' },
      ],
      protocolVersion: PROTOCOL_VERSION_V1,
      title: `Browser voter path ${suffix}`,
      votingMethod: 'SINGLE_CHOICE',
    });
    electionId = stringField(election, 'id');
    const snapshot = await adminPost(
      request,
      csrfToken,
      `/admin/elections/${electionId}/eligibility-snapshots`,
    );
    const tree = await buildMerkleTreeV1([
      ...fixture.voters.map((voter) => voter.identityCommitment),
      identityCommitment,
    ]);
    expect(stringField(snapshot, 'merkleRoot')).toBe(tree.root);
    await adminPost(
      request,
      csrfToken,
      `/admin/elections/${electionId}/eligibility-snapshots/${stringField(snapshot, 'id')}/freeze`,
    );
    await adminPost(request, csrfToken, `/admin/elections/${electionId}/ready`);
    await adminPost(request, csrfToken, `/admin/elections/${electionId}/open`);
    const manifestResponse = await request.get(`${apiBase}/elections/${electionId}/manifest`);
    expect(manifestResponse.ok(), await manifestResponse.text()).toBe(true);
    const envelope = object((await manifestResponse.json()) as unknown, 'manifest envelope');
    const manifest = object(envelope['manifest'], 'election manifest');
    const membership = tree.proof(tree.leaves.indexOf(identityCommitment));
    const privateCredential = {
      electionId,
      formatVersion: 'voter-credential-v1',
      identityCommitment,
      protocolVersion: PROTOCOL_VERSION_V1,
      voterSecret,
    };
    const eligibility = {
      electionId,
      formatVersion: 'eligibility-material-v1',
      identityCommitment,
      merklePathElements: membership.pathElements,
      merklePathIndices: membership.pathIndices,
      merkleRoot: stringField(manifest, 'merkleRoot'),
      protocolVersion: PROTOCOL_VERSION_V1,
    };

    await page.goto('http://localhost:3102');
    await page.getByLabel('Identificador de elección').fill(electionId);
    await page.getByRole('button', { name: 'Validar manifest' }).click();
    await page.getByLabel('Importar credencial privada').setInputFiles({
      buffer: Buffer.from(JSON.stringify(privateCredential)),
      mimeType: 'application/json',
      name: 'credential.devnet-only.json',
    });
    await page.getByLabel('Importar material de elegibilidad').setInputFiles({
      buffer: Buffer.from(JSON.stringify(eligibility)),
      mimeType: 'application/json',
      name: 'eligibility.devnet-only.json',
    });
    await page.getByLabel('Browser choice A').check();
    page.once('dialog', (dialog) => dialog.accept());
    await page.getByRole('button', { name: 'Confirmar y generar prueba' }).click();
    await expect(page.getByRole('status')).toHaveText(
      'Prueba verificada localmente y lista para enviar.',
      { timeout: 90_000 },
    );
    await page.getByRole('button', { name: 'Enviar voto anónimo' }).click();
    await expect(page.getByText('Voto aceptado. Guarda tu receipt público.')).toBeVisible();
    expect(await context.cookies()).toEqual([]);
    await adminPost(request, csrfToken, `/admin/elections/${electionId}/close`);
  } finally {
    await adminPost(
      request,
      csrfToken,
      `/admin/electoral-credentials/${stringField(credential, 'id')}/revoke`,
    );
  }
});
