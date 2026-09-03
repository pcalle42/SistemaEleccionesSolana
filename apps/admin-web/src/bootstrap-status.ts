import type { BootstrapStatus } from '@votaciones/shared-types';

export function adminWebBootstrapStatus(): BootstrapStatus {
  return { component: 'admin-web', status: 'ready' };
}
