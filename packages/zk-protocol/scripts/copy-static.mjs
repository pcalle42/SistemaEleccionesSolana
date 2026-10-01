import { cp, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const packageDirectory = dirname(dirname(fileURLToPath(import.meta.url)));
await mkdir(join(packageDirectory, 'dist', 'artifacts'), { recursive: true });
await mkdir(join(packageDirectory, 'dist', 'manifests'), { recursive: true });
await cp(join(packageDirectory, 'artifacts'), join(packageDirectory, 'dist', 'artifacts'), {
  recursive: true,
});
await cp(join(packageDirectory, 'manifests'), join(packageDirectory, 'dist', 'manifests'), {
  recursive: true,
});
