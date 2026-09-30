import type { ElectionOptionId } from './election-id.js';
import { ElectionDomainError } from './election-errors.js';

export interface ElectionOptionInput {
  readonly description?: string | null;
  readonly displayOrder: number;
  readonly id: ElectionOptionId;
  readonly label: string;
}

export interface ElectionOption {
  readonly description: string | null;
  readonly displayOrder: number;
  readonly id: ElectionOptionId;
  readonly label: string;
}

export function createElectionOption(input: ElectionOptionInput): ElectionOption {
  const label = input.label.trim();
  const description = input.description?.trim() || null;
  if (
    label.length === 0 ||
    label.length > 200 ||
    /[<>]/u.test(label) ||
    (description !== null && (description.length > 1_000 || /[<>]/u.test(description)))
  ) {
    throw new ElectionDomainError(
      'INVALID_ELECTION_OPTION',
      'Election option metadata is invalid.',
    );
  }
  if (!Number.isSafeInteger(input.displayOrder) || input.displayOrder < 0) {
    throw new ElectionDomainError(
      'INVALID_ELECTION_OPTION',
      'Option display order must be non-negative.',
    );
  }
  return { description, displayOrder: input.displayOrder, id: input.id, label };
}
