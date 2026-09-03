import type { BootstrapStatus } from '@votaciones/shared-types';

export function voterWebBootstrapStatus(): BootstrapStatus {
  return { component: 'voter-web', status: 'ready' };
}
