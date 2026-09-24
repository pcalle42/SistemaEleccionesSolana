export type ErrorCategory =
  | 'validation'
  | 'authentication'
  | 'authorization'
  | 'not-found'
  | 'conflict'
  | 'domain-rule'
  | 'rate-limit'
  | 'dependency-unavailable'
  | 'internal';

export class ApplicationError extends Error {
  constructor(
    readonly code: string,
    readonly publicMessage: string,
    readonly category: ErrorCategory,
    options?: ErrorOptions,
  ) {
    super(publicMessage, options);
    this.name = 'ApplicationError';
  }
}

export class DependencyUnavailableError extends ApplicationError {
  constructor(code: string, publicMessage: string, options?: ErrorOptions) {
    super(code, publicMessage, 'dependency-unavailable', options);
    this.name = 'DependencyUnavailableError';
  }
}
