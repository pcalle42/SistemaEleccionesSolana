export type SubmissionState =
  | 'READY'
  | 'GENERATING_PROOF'
  | 'PROOF_READY'
  | 'SUBMITTING'
  | 'UNKNOWN_OUTCOME'
  | 'ACCEPTED'
  | 'REJECTED';
export type SubmissionEvent =
  'GENERATE' | 'PROOF_CREATED' | 'SUBMIT' | 'TIMEOUT' | 'ACCEPT' | 'REJECT' | 'RETRY' | 'RESET';

const transitions: Record<SubmissionState, Partial<Record<SubmissionEvent, SubmissionState>>> = {
  READY: { GENERATE: 'GENERATING_PROOF' },
  GENERATING_PROOF: { PROOF_CREATED: 'PROOF_READY', RESET: 'READY' },
  PROOF_READY: { SUBMIT: 'SUBMITTING', RESET: 'READY' },
  SUBMITTING: { ACCEPT: 'ACCEPTED', REJECT: 'REJECTED', TIMEOUT: 'UNKNOWN_OUTCOME' },
  UNKNOWN_OUTCOME: { RETRY: 'SUBMITTING' },
  ACCEPTED: {},
  REJECTED: { RESET: 'READY' },
};

export function transitionSubmission(
  state: SubmissionState,
  event: SubmissionEvent,
): SubmissionState {
  const next = transitions[state][event];
  if (!next) throw new Error(`INVALID_SUBMISSION_TRANSITION:${state}:${event}`);
  return next;
}
