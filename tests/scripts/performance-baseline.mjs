import { readdir, stat, readFile } from 'node:fs/promises';

const root = new URL('../../', import.meta.url);
const protocol = JSON.parse(
  await readFile(
    new URL('packages/zk-protocol/artifacts/anonymous-single-choice-v1/performance.json', root),
  ),
);
const artifacts = await Promise.all(
  ['anonymous-single-choice-v1.wasm', 'devnet-final.zkey', 'verification_key.json'].map(
    async (name) => ({
      bytes: (
        await stat(
          new URL(`packages/zk-protocol/artifacts/anonymous-single-choice-v1/${name}`, root),
        )
      ).size,
      name,
    }),
  ),
);
async function listFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  return (
    await Promise.all(
      entries.map(async (entry) => {
        const child = new URL(`${entry.name}${entry.isDirectory() ? '/' : ''}`, directory);
        return entry.isDirectory() ? listFiles(child) : [child];
      }),
    )
  ).flat();
}

const bundles = await Promise.all(
  [
    ['admin', 'apps/admin-web/dist/'],
    ['voter', 'apps/voter-web/dist/'],
  ].map(async ([name, path]) => {
    const directory = new URL(path, root);
    const files = await Promise.all(
      (await listFiles(directory)).map(async (url) => ({
        bytes: (await stat(url)).size,
        path: decodeURIComponent(url.pathname.slice(directory.pathname.length)),
      })),
    );
    return {
      bytes: files.reduce((total, file) => total + file.bytes, 0),
      files: files.sort((left, right) => left.path.localeCompare(right.path)),
      name,
    };
  }),
);

if (
  typeof protocol !== 'object' ||
  protocol === null ||
  artifacts.some(({ bytes }) => bytes <= 0) ||
  bundles.some(({ bytes }) => bytes <= 0)
) {
  throw new Error('Performance baseline inputs are incomplete.');
}

process.stdout.write(`${JSON.stringify({ artifacts, bundles, zk: protocol }, null, 2)}\n`);
