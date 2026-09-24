import { Global, Module } from '@nestjs/common';

import type { AppConfig } from '../config/app-config.js';
import { APP_CONFIG } from '../config/config.tokens.js';
import { ValkeyLifecycleService } from './valkey-lifecycle.service.js';
import {
  createValkeyModuleFromConfig,
  type ValkeyModule as ValkeyRuntime,
} from './valkey.module.js';
import { VALKEY_KEYS, VALKEY_RUNTIME, VALKEY_SERVICE } from './valkey.tokens.js';

@Global()
@Module({
  exports: [VALKEY_KEYS, VALKEY_SERVICE, ValkeyLifecycleService],
  providers: [
    {
      inject: [APP_CONFIG],
      provide: VALKEY_RUNTIME,
      useFactory: (config: AppConfig) => createValkeyModuleFromConfig(config.valkey),
    },
    {
      inject: [VALKEY_RUNTIME],
      provide: VALKEY_SERVICE,
      useFactory: (runtime: ValkeyRuntime) => runtime.service,
    },
    {
      inject: [VALKEY_RUNTIME],
      provide: VALKEY_KEYS,
      useFactory: (runtime: ValkeyRuntime) => runtime.keys,
    },
    ValkeyLifecycleService,
  ],
})
export class ValkeyNestModule {}
