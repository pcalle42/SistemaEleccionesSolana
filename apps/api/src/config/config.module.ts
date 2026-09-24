import { Global, Module } from '@nestjs/common';

import { getAppConfig } from './app-config.js';
import { APP_CONFIG } from './config.tokens.js';

@Global()
@Module({
  exports: [APP_CONFIG],
  providers: [
    {
      provide: APP_CONFIG,
      useFactory: () => getAppConfig(process.env),
    },
  ],
})
export class RuntimeConfigModule {}
