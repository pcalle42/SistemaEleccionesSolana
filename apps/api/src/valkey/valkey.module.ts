import { ValkeyKeyFactory } from './key-factory.js';
import { createValkeyClient, type ValkeyObserver } from './valkey.client.js';
import { getValkeyConfig, type ValkeyConfig } from './valkey.config.js';
import { ValkeyService } from './valkey.service.js';

export interface ValkeyModule {
  readonly config: ValkeyConfig;
  readonly keys: ValkeyKeyFactory;
  readonly service: ValkeyService;
}

export function createValkeyModule(
  environment: NodeJS.ProcessEnv = process.env,
  observer: ValkeyObserver = {},
): ValkeyModule {
  const config = getValkeyConfig(environment);
  const client = createValkeyClient(config, observer);
  return {
    config,
    keys: new ValkeyKeyFactory(config.environment),
    service: new ValkeyService(client, observer),
  };
}
