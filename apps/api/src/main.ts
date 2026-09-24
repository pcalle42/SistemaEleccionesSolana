import 'reflect-metadata';

import type { AppConfig } from './config/app-config.js';
import { APP_CONFIG } from './config/config.tokens.js';
import { createApplication, listen } from './bootstrap.js';

async function bootstrap(): Promise<void> {
  const app = await createApplication();
  await listen(app, app.get<AppConfig>(APP_CONFIG));
}

bootstrap().catch(() => {
  // Startup errors are deliberately generic because configuration may contain secrets.
  console.error('API startup failed.');
  process.exitCode = 1;
});
