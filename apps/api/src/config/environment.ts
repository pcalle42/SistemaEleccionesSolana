import { existsSync } from 'node:fs';
import { isAbsolute, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { config as loadDotenv } from 'dotenv';

const repositoryRoot = fileURLToPath(new URL('../../../../', import.meta.url));

export function loadEnvironment(environment: NodeJS.ProcessEnv = process.env): string {
  const profile = environment['VOTACIONES_ENV'] ?? 'local';
  const configuredPath = environment['VOTACIONES_ENV_FILE'];
  const privatePath = resolve(repositoryRoot, 'infra', profile, '.env');
  const examplePath = resolve(repositoryRoot, 'infra', profile, '.env.example');
  const path = configuredPath
    ? isAbsolute(configuredPath)
      ? configuredPath
      : resolve(repositoryRoot, configuredPath)
    : existsSync(privatePath)
      ? privatePath
      : examplePath;

  if (!existsSync(path)) {
    throw new Error(`Environment file not found for profile: ${profile}`);
  }

  const result = loadDotenv({ override: false, path, processEnv: environment, quiet: true });
  if (result.error) {
    throw new Error(`Unable to load the environment for profile: ${profile}`);
  }

  return path;
}
