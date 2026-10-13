import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { assertSemver, invariant, parseArguments, repositoryRoot } from './lib.mjs';

const arguments_ = parseArguments(process.argv.slice(2));
invariant(arguments_['version'], '--version is required.');
invariant(arguments_['output'], '--output is required.');
assertSemver(arguments_['version']);
const template = await readFile(
  resolve(repositoryRoot, 'release/templates/release-notes.md'),
  'utf8',
);
await writeFile(
  resolve(arguments_['output']),
  template.replaceAll('{{releaseVersion}}', arguments_['version']),
  { flag: 'wx', mode: 0o640 },
);
