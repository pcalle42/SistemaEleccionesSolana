import { fileURLToPath } from 'node:url';

function argument(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? undefined : process.argv[index + 1];
}

export function evaluateClockDrift({ finishedAtMs, referenceDate, startedAtMs }) {
  const referenceMs = Date.parse(referenceDate);
  if (!Number.isFinite(referenceMs)) throw new Error('Reference did not provide a valid HTTP Date');
  const midpointMs = startedAtMs + (finishedAtMs - startedAtMs) / 2;
  return {
    driftMs: Math.round(midpointMs - referenceMs),
    roundTripMs: Math.round(finishedAtMs - startedAtMs),
  };
}

async function main() {
  const referenceUrl = argument('--reference-url');
  const maximumDrift = Number(argument('--maximum-drift-ms'));
  if (!referenceUrl || !Number.isFinite(maximumDrift) || maximumDrift < 0) {
    throw new Error('--reference-url and a non-negative --maximum-drift-ms are required');
  }
  const url = new URL(referenceUrl);
  if (url.protocol !== 'https:' && argument('--allow-http') !== 'true') {
    throw new Error('Clock reference must use HTTPS unless --allow-http true is explicit');
  }
  const startedAtMs = Date.now();
  const response = await fetch(url, {
    cache: 'no-store',
    method: 'HEAD',
    redirect: 'error',
    signal: AbortSignal.timeout(5_000),
  });
  const finishedAtMs = Date.now();
  if (!response.ok) throw new Error(`Clock reference returned HTTP ${response.status}`);
  const referenceDate = response.headers.get('date');
  if (!referenceDate) throw new Error('Clock reference omitted the HTTP Date header');
  const result = evaluateClockDrift({ finishedAtMs, referenceDate, startedAtMs });
  const output = {
    checkedAt: new Date(finishedAtMs).toISOString(),
    driftMs: result.driftMs,
    maximumDriftMs: maximumDrift,
    referenceOrigin: url.origin,
    roundTripMs: result.roundTripMs,
    status: Math.abs(result.driftMs) <= maximumDrift ? 'healthy' : 'alert',
  };
  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
  if (output.status !== 'healthy') process.exitCode = 1;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  await main();
}
