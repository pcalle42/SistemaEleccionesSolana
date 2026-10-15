import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

import { invariant, parseArguments, readJson, repositoryRoot } from './lib.mjs';
import { readAndVerifyProductionProfile } from '../production/profile.mjs';

const arguments_ = parseArguments(process.argv.slice(2));
const target = arguments_['target'];
const manifestPath = arguments_['manifest'];
invariant(['staging', 'production'].includes(target), '--target must be staging or production.');
invariant(manifestPath, '--manifest is required.');
execFileSync(
  process.execPath,
  [
    resolve(repositoryRoot, 'scripts/release/verify-manifest.mjs'),
    '--manifest',
    resolve(manifestPath),
  ],
  { stdio: 'inherit' },
);
const manifest = await readJson(resolve(manifestPath));
if (target === 'production') {
  invariant(manifest.classification === 'production', 'Production requires a production manifest.');
  invariant(arguments_['backup-status'], 'Production requires --backup-status evidence.');
  invariant(arguments_['migration-plan'], 'Production requires --migration-plan evidence.');
  invariant(arguments_['production-profile'], 'Production requires --production-profile.');
  const backup = await readJson(resolve(arguments_['backup-status']));
  const migrationPlan = await readJson(resolve(arguments_['migration-plan']));
  invariant(backup.status === 'ready', 'Backup/restore readiness is not approved.');
  invariant(migrationPlan.status === 'approved', 'Migration plan is not approved.');
  invariant(
    ['forward-fix', 'compatible-image-rollback'].includes(migrationPlan.databaseStrategy),
    'Migration plan has an unsafe database rollback strategy.',
  );
  const { profile } = await readAndVerifyProductionProfile(arguments_['production-profile']);
  invariant(
    profile.releaseManifestDigest === manifest.manifestDigest,
    'Production profile references a different release manifest.',
  );
  for (const [name, profileName] of [
    ['api', 'api'],
    ['adminWeb', 'adminWeb'],
    ['voterWeb', 'voterWeb'],
  ]) {
    invariant(
      profile.deployment.images[profileName] === manifest.images[name].reference,
      `Production profile image differs from release manifest: ${name}.`,
    );
  }
}
process.stdout.write(
  `${JSON.stringify(
    {
      currentRelease: arguments_['current-release'] ?? 'not-reported',
      manifestDigest: manifest.manifestDigest,
      migrationSetDigest: manifest.migrations.setDigest,
      protocols: manifest.protocols.map((protocol) => protocol.protocolVersion),
      target,
      targetRelease: manifest.releaseVersion,
      verified: true,
    },
    null,
    2,
  )}\n`,
);
