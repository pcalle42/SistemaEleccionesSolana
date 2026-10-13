import 'reflect-metadata';
import { Logger } from 'nestjs-pino';

import type { AppConfig } from './config/app-config.js';
import { APP_CONFIG } from './config/config.tokens.js';
import { createApplication, listen } from './bootstrap.js';

async function bootstrap(): Promise<void> {
  const app = await createApplication();
  const config = app.get<AppConfig>(APP_CONFIG);
  await listen(app, config);
  app.get(Logger).log({
    appVersion: config.release.appVersion,
    environment: config.environment,
    event: 'application_started',
    releaseManifestDigest: config.release.manifestDigest,
  });
}

bootstrap().catch(() => {
  // Startup errors are deliberately generic because configuration may contain secrets.
  console.error('API startup failed.');
  process.exitCode = 1;
});
