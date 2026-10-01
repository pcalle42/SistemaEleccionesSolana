import { Module } from '@nestjs/common';
import type pg from 'pg';

import type { AppConfig } from '../../config/app-config.js';
import { APP_CONFIG } from '../../config/config.tokens.js';
import { DATABASE_POOL } from '../../database/database.tokens.js';
import type { ValkeyKeyFactory } from '../../valkey/key-factory.js';
import type { ValkeyService } from '../../valkey/valkey.service.js';
import { VALKEY_KEYS, VALKEY_SERVICE } from '../../valkey/valkey.tokens.js';
import { ZkModule } from '../zk/zk.module.js';
import { CastVoteService } from './application/cast-vote.service.js';
import { PublicVotingController } from './http/public-voting.controller.js';
import { PostgresVoteRepository } from './infrastructure/persistence/postgres-vote.repository.js';
import { ValkeyVoteAdmission } from './infrastructure/rate-limit/valkey-vote-admission.js';
import { VOTE_ADMISSION, VOTE_REPOSITORY } from './voting.tokens.js';

@Module({
  controllers: [PublicVotingController],
  imports: [ZkModule],
  providers: [
    {
      inject: [DATABASE_POOL],
      provide: VOTE_REPOSITORY,
      useFactory: (pool: pg.Pool) => new PostgresVoteRepository(pool),
    },
    {
      inject: [VALKEY_SERVICE, VALKEY_KEYS, APP_CONFIG],
      provide: VOTE_ADMISSION,
      useFactory: (valkey: ValkeyService, keys: ValkeyKeyFactory, config: AppConfig) =>
        new ValkeyVoteAdmission(valkey, keys, config.voting),
    },
    CastVoteService,
  ],
})
export class VotingModule {}
