import { createHash } from 'node:crypto';

import type { AppConfig } from '../../../../config/app-config.js';
import type { ValkeyKeyFactory } from '../../../../valkey/key-factory.js';
import type { ValkeyService } from '../../../../valkey/valkey.service.js';
import { ValkeyUnavailableError } from '../../../../valkey/valkey.service.js';
import type { VoteAdmission } from '../../application/ports/vote-admission.port.js';
import { VotingError } from '../../domain/voting-errors.js';

function digestNetworkSignal(value: string): string {
  return createHash('sha256')
    .update('votaciones/vote-rate-network/v1\0', 'utf8')
    .update(value, 'utf8')
    .digest('hex');
}

export class ValkeyVoteAdmission implements VoteAdmission {
  private inFlight = 0;

  constructor(
    private readonly valkey: ValkeyService,
    private readonly keys: ValkeyKeyFactory,
    private readonly config: AppConfig['voting'],
  ) {}

  async execute<T>(networkSignal: string, work: () => Promise<T>): Promise<T> {
    try {
      const rate = await this.valkey.incrementWithExpiry(
        this.keys.publicVoteRateNetwork(digestNetworkSignal(networkSignal)),
        this.config.rateLimitWindowSeconds,
      );
      if (rate.count > this.config.rateLimitMaximum) {
        throw new VotingError('VOTE_RATE_LIMITED', 'Vote submission rate limit exceeded.');
      }
    } catch (error: unknown) {
      if (error instanceof VotingError) throw error;
      if (!(error instanceof ValkeyUnavailableError)) throw error;
      // Valkey is an operational defense only. PostgreSQL and the ZK verifier remain authoritative.
    }
    if (this.inFlight >= this.config.maximumConcurrentProofs) {
      throw new VotingError('VOTE_RATE_LIMITED', 'Proof verification capacity is exhausted.');
    }
    this.inFlight += 1;
    try {
      return await work();
    } finally {
      this.inFlight -= 1;
    }
  }
}
