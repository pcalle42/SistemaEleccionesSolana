import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { verifyElectionPackage } from '@votaciones/verification-protocol';

import { assert, runRoot } from './lib.mjs';

const packageFlag = process.argv.indexOf('--package');
let packagePath = packageFlag >= 0 ? process.argv[packageFlag + 1] : undefined;
if (!packagePath) {
  const latest = JSON.parse(await readFile(resolve(runRoot, 'latest.json'), 'utf8'));
  packagePath = latest.packagePath;
}
assert(
  typeof packagePath === 'string' && packagePath.length > 0,
  'Verification package is missing',
);
const report = await verifyElectionPackage(resolve(packagePath));
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
// The verifier may retain cryptographic worker handles. This bounded CLI has
// completed all reads and can return its documented exit code immediately.
process.exit(report.valid ? 0 : 1);
