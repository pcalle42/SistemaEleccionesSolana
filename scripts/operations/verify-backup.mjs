import { createHash } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import { basename, resolve } from 'node:path';

function value(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? undefined : process.argv[index + 1];
}

const archiveArgument = value('--archive');
if (!archiveArgument) throw new Error('--archive is required');
const archive = resolve(archiveArgument);
const bytes = await readFile(archive);
const metadata = JSON.parse(await readFile(`${archive}.metadata.json`, 'utf8'));
const digest = createHash('sha256').update(bytes).digest('hex');
const archiveStat = await stat(archive);
if (
  metadata.schemaVersion !== 'BackupManifestV1' ||
  metadata.archive !== basename(archive) ||
  metadata.archiveSha256 !== digest ||
  metadata.sizeBytes !== archiveStat.size ||
  !/^[a-f0-9]{40}$/u.test(metadata.gitCommit)
) {
  throw new Error('Backup metadata or digest verification failed');
}
const expectedKind = value('--kind');
if (expectedKind && metadata.kind !== expectedKind) throw new Error('Unexpected backup kind');
const sidecar = (await readFile(`${archive}.sha256`, 'utf8')).trim();
if (sidecar !== `${digest}  ${basename(archive)}`)
  throw new Error('Backup digest sidecar mismatch');
const restoredEvidence = value('--restored-evidence');
if (restoredEvidence) {
  const actual = JSON.parse(restoredEvidence);
  if (JSON.stringify(actual) !== JSON.stringify(metadata.evidence)) {
    throw new Error('Restored database evidence differs from the backup');
  }
}
process.stdout.write(
  `${JSON.stringify({ archive: metadata.archive, digest, kind: metadata.kind, verified: true }, null, 2)}\n`,
);
