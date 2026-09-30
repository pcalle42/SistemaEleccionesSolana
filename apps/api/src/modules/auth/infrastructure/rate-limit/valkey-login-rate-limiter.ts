import type { AppConfig } from '../../../../config/app-config.js';
import type { ValkeyKeyFactory } from '../../../../valkey/key-factory.js';
import type { ValkeyService } from '../../../../valkey/valkey.service.js';
import type {
  LoginRateLimiter,
  LoginRateLimitResult,
} from '../../application/ports/login-rate-limiter.port.js';
import { securityDigest } from '../security-digest.js';

export class ValkeyLoginRateLimiter implements LoginRateLimiter {
  constructor(
    private readonly valkey: ValkeyService,
    private readonly keys: ValkeyKeyFactory,
    private readonly config: AppConfig['auth']['rateLimit'],
  ) {}

  async consume(username: string, networkSignal: string): Promise<LoginRateLimitResult> {
    const userDigest = securityDigest('admin-login-user', username);
    const networkDigest = securityDigest('admin-login-network', networkSignal);
    const [user, network] = await Promise.all([
      this.valkey.incrementWithExpiry(
        this.keys.adminLoginRateUser(userDigest),
        this.config.windowSeconds,
      ),
      this.valkey.incrementWithExpiry(
        this.keys.adminLoginRateNetwork(networkDigest),
        this.config.windowSeconds,
      ),
    ]);
    return {
      allowed: user.count <= this.config.userMaximum && network.count <= this.config.networkMaximum,
      retryAfterSeconds: Math.max(user.ttlSeconds, network.ttlSeconds, 1),
    };
  }
}
