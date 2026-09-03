import type { BootstrapStatus } from '@votaciones/shared-types';

export function expectedBootstrapStatus(component: string): BootstrapStatus {
  return { component, status: 'ready' };
}
