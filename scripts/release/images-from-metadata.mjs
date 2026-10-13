import { writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

import { assertDigest, invariant, parseArguments, readJson } from './lib.mjs';

const arguments_ = parseArguments(process.argv.slice(2));
const directory = resolve(arguments_['directory'] ?? 'artifacts/release');
const registry = arguments_['registry'];
const output = resolve(arguments_['output'] ?? join(directory, 'images.json'));
invariant(registry, '--registry is required.');
const names = { adminWeb: 'admin-web', api: 'api', voterWeb: 'voter-web' };
const images = {};
for (const [key, name] of Object.entries(names)) {
  const metadata = await readJson(join(directory, `${name}.metadata.json`));
  const digest = metadata['containerimage.digest'];
  assertDigest(digest, `${name} metadata digest`);
  images[key] = { digest, reference: `${registry}/votaciones-${name}@${digest}` };
}
await writeFile(output, `${JSON.stringify(images, null, 2)}\n`, { flag: 'wx', mode: 0o640 });
process.stdout.write(`${output}\n`);
