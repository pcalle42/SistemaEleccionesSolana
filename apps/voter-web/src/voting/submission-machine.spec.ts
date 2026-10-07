import { describe, expect, it } from 'vitest';
import { transitionSubmission } from './submission-machine.js';

describe('vote submission state machine', () => {
  it('treats a lost response as unknown and permits only an idempotent retry', () => {
    expect(transitionSubmission('SUBMITTING', 'TIMEOUT')).toBe('UNKNOWN_OUTCOME');
    expect(transitionSubmission('UNKNOWN_OUTCOME', 'RETRY')).toBe('SUBMITTING');
    expect(() => transitionSubmission('UNKNOWN_OUTCOME', 'GENERATE')).toThrow(
      'INVALID_SUBMISSION_TRANSITION',
    );
  });

  it('does not allow a second submit after acceptance', () => {
    expect(transitionSubmission('SUBMITTING', 'ACCEPT')).toBe('ACCEPTED');
    expect(() => transitionSubmission('ACCEPTED', 'SUBMIT')).toThrow(
      'INVALID_SUBMISSION_TRANSITION',
    );
  });
});
