import { jsonRequest, login } from './lib.mjs';

const ready = await fetch('http://127.0.0.1:3000/health/ready').then(async (response) => ({
  body: await response.json(),
  status: response.status,
}));
let adminConfigured = false;
let demo = null;
try {
  const session = await login();
  adminConfigured = true;
  const elections = await jsonRequest('/admin/elections', {}, session);
  demo =
    elections.find(
      (election) => election.title === (process.env.DEVNET_DEMO_TITLE ?? 'Devnet Election'),
    ) ?? null;
} catch {
  // Status remains useful before bootstrap or while the login limiter is active.
}
process.stdout.write(
  `${JSON.stringify(
    {
      apiReadiness: ready,
      adminConfigured,
      demoElection: demo ? { id: demo.id, status: demo.status } : null,
      protocolVersion: 'anonymous-single-choice-v1',
    },
    null,
    2,
  )}\n`,
);
