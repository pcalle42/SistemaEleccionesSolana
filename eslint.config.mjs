import baseConfig from '@votaciones/config-eslint/base';
import frontendConfig from '@votaciones/config-eslint/frontend';
import nodeConfig from '@votaciones/config-eslint/node';
import testConfig from '@votaciones/config-eslint/test';

export default [...baseConfig, ...nodeConfig, ...frontendConfig, ...testConfig];
