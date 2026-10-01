#!/usr/bin/env node
import { resolve } from 'node:path';

import { verifyElectionPackage } from './verifier.js';

const index = process.argv.indexOf('--package');
const directory = index >= 0 ? process.argv[index + 1] : undefined;
if (!directory) {
  process.stderr.write('Usage: verify-election --package <directory>\n');
  process.exitCode = 2;
} else {
  const report = await verifyElectionPackage(resolve(directory));
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  process.exitCode = report.valid ? 0 : 1;
}
