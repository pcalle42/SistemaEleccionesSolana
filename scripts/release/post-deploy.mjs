import { invariant, parseArguments } from './lib.mjs';

const arguments_ = parseArguments(process.argv.slice(2));
const baseUrl = arguments_['base-url']?.replace(/\/$/u, '');
const expectedVersion = arguments_['expected-version'];
const expectedDigest = arguments_['expected-manifest-digest'];
invariant(baseUrl, '--base-url is required.');
invariant(expectedVersion, '--expected-version is required.');
invariant(expectedDigest, '--expected-manifest-digest is required.');

async function getJson(path) {
  const response = await fetch(`${baseUrl}${path}`, {
    headers: { Accept: 'application/json' },
    redirect: 'error',
    signal: AbortSignal.timeout(10_000),
  });
  invariant(response.ok, `${path} returned HTTP ${response.status}.`);
  return response.json();
}

const live = await getJson('/health/live');
const ready = await getJson('/health/ready');
const version = await getJson('/api/v1/version');
invariant(live.status === 'ok', 'Liveness failed.');
invariant(['ready', 'degraded'].includes(ready.status), 'Readiness failed.');
invariant(version.appVersion === expectedVersion, 'Deployed app version mismatch.');
invariant(version.releaseManifestDigest === expectedDigest, 'Deployed release digest mismatch.');
invariant(
  Array.isArray(version.supportedProtocolVersions) && version.supportedProtocolVersions.length > 0,
  'No supported protocol is reported.',
);
process.stdout.write(
  `${JSON.stringify({ baseUrl, releaseManifestDigest: expectedDigest, verified: true }, null, 2)}\n`,
);
