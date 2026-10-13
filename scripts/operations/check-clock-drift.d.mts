export function evaluateClockDrift(input: {
  finishedAtMs: number;
  referenceDate: string;
  startedAtMs: number;
}): { driftMs: number; roundTripMs: number };
