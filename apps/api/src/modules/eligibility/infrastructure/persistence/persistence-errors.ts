import { EligibilityDomainError } from '../../domain/eligibility-errors.js';

export function databaseCode(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null) return undefined;
  const candidate = error as { code?: unknown; cause?: unknown };
  return typeof candidate.code === 'string' ? candidate.code : databaseCode(candidate.cause);
}

export function concurrencyError(): EligibilityDomainError {
  return new EligibilityDomainError(
    'ELIGIBILITY_CONCURRENT_MODIFICATION',
    'Eligibility state changed concurrently; reload and retry.',
  );
}
