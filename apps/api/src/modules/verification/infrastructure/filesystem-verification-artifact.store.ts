import { constants } from 'node:fs';
import { access, mkdir, mkdtemp, rename, rm, writeFile } from 'node:fs/promises';
import { join, resolve, sep } from 'node:path';

const SAFE_SEGMENT = /^[0-9a-z-]+$/u;

function safeChild(root: string, ...segments: string[]): string {
  if (segments.some((segment) => !SAFE_SEGMENT.test(segment))) {
    throw new Error('INVALID_ARTIFACT_PATH');
  }
  const path = resolve(root, ...segments);
  if (!path.startsWith(`${resolve(root)}${sep}`)) throw new Error('INVALID_ARTIFACT_PATH');
  return path;
}

export class FilesystemVerificationArtifactStore {
  constructor(private readonly root: string) {}

  async putImmutable(
    electionId: string,
    contentDigest: string,
    files: Readonly<Record<string, string | Uint8Array>>,
  ): Promise<string> {
    const electionDirectory = safeChild(this.root, electionId);
    const destination = safeChild(this.root, electionId, contentDigest);
    await mkdir(electionDirectory, { recursive: true });
    try {
      await access(destination, constants.R_OK);
      return destination;
    } catch {
      // The content-addressed package is not stored yet.
    }
    const temporary = await mkdtemp(join(electionDirectory, '.staging-'));
    try {
      for (const [name, bytes] of Object.entries(files)) {
        if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/u.test(name)) throw new Error('INVALID_ARTIFACT_NAME');
        await writeFile(join(temporary, name), bytes, { flag: 'wx', mode: 0o640 });
      }
      try {
        await rename(temporary, destination);
      } catch (error: unknown) {
        await access(destination, constants.R_OK).catch(() => {
          throw error;
        });
      }
      return destination;
    } finally {
      await rm(temporary, { force: true, recursive: true });
    }
  }
}
