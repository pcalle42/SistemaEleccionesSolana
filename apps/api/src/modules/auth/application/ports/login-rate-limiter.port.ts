export interface LoginRateLimitResult {
  readonly allowed: boolean;
  readonly retryAfterSeconds: number;
}

export interface LoginRateLimiter {
  consume(username: string, networkSignal: string): Promise<LoginRateLimitResult>;
}
