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
  // snarkjs retains worker handles after verifying real proofs. This bounded CLI
  // must exit after flushing the complete report so restore jobs can continue.
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`, () => {
    process.exit(report.valid ? 0 : 1);
  });
}
