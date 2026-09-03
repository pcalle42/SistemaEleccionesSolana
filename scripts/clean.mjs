import { rm } from 'node:fs/promises';
import { join } from 'node:path';

const generatedDirectoryNames = new Set(['dist', 'build', 'coverage', '.cache', '.vite']);
const workspaceRoots = ['apps', 'packages', 'zk'];

async function removeGeneratedDirectories(root) {
  const { readdir } = await import('node:fs/promises');
  const entries = await readdir(root, { withFileTypes: true }).catch(() => []);

  await Promise.all(
    entries.map(async (entry) => {
      if (!entry.isDirectory()) return;
      if (entry.name === 'node_modules') return;

      const path = join(root, entry.name);
      if (generatedDirectoryNames.has(entry.name)) {
        await rm(path, { force: true, recursive: true });
        return;
      }

      await removeGeneratedDirectories(path);
    }),
  );
}

await Promise.all(workspaceRoots.map(removeGeneratedDirectories));
