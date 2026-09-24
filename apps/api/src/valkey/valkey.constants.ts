export const VALKEY_KEY_VERSION = 'v1';

export const VALKEY_TTL_SECONDS = Object.freeze({
  loginRateLimitWindow: 15 * 60,
  publicElectionCache: 30,
  temporaryChallenge: 5 * 60,
  testProbe: 5,
});
