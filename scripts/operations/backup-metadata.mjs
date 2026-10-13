import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile, stat, writeFile } from 'node:fs/promises';
import { basename, resolve } from 'node:path';

const repositoryRoot = resolve(import.meta.dirname, '../..');

function parseArguments(argv) {
  const result = {};
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    if (key === '--') continue;
    if (!key?.startsWith('--') || !argv[index + 1]) throw new Error(`Invalid argument: ${key}`);
    result[key.slice(2)] = argv[index + 1];
    index += 1;
  }
  return result;
}

function canonicalize(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(',')}]`;
  return `{${Object.entries(value)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, child]) => `${JSON.stringify(key)}:${canonicalize(child)}`)
    .join(',')}}`;
}

const arguments_ = parseArguments(process.argv.slice(2));
if (!arguments_['archive']) throw new Error('--archive is required');
const archive = resolve(arguments_['archive']);
const environment = arguments_['environment'];
const kind = arguments_['kind'] ?? 'postgresql';
if (!environment || !['postgresql', 'verification-artifacts'].includes(kind)) {
  throw new Error('--archive, --environment and a supported --kind are required');
}
const archiveBytes = await readFile(archive);
const archiveStat = await stat(archive);
const appVersion = JSON.parse(
  await readFile(resolve(repositoryRoot, 'release/app-version.json'), 'utf8'),
).appVersion;
const evidence = arguments_['evidence'] ? JSON.parse(arguments_['evidence']) : undefined;
const metadata = {
  appVersion,
  archive: basename(archive),
  archiveSha256: createHash('sha256').update(archiveBytes).digest('hex'),
  createdAt: new Date().toISOString(),
  environment,
  gitCommit: execFileSync('git', ['rev-parse', 'HEAD'], {
    cwd: repositoryRoot,
    encoding: 'utf8',
  }).trim(),
  ...(evidence ? { evidence } : {}),
  kind,
  schemaVersion: 'BackupManifestV1',
  sizeBytes: archiveStat.size,
};
const metadataPath = `${archive}.metadata.json`;
await writeFile(metadataPath, `${canonicalize(metadata)}\n`, { flag: 'wx', mode: 0o600 });
await writeFile(`${archive}.sha256`, `${metadata.archiveSha256}  ${basename(archive)}\n`, {
  flag: 'wx',
  mode: 0o600,
});
process.stdout.write(`${metadataPath}\n`);
