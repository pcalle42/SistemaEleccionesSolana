import type { BootstrapStatus } from '@votaciones/shared-types';
import { isNonEmptyString } from '@votaciones/shared-validation';

export function apiBootstrapStatus(component: unknown): BootstrapStatus {
  if (!isNonEmptyString(component)) {
    throw new TypeError('Component must be a non-empty string.');
  }

  return { component, status: 'ready' };
}
