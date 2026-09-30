import { Module } from '@nestjs/common';

import type { Database } from '../../database/client.js';
import { DATABASE_CLIENT } from '../../database/database.tokens.js';
import { AuthModule } from '../auth/auth.module.js';
import { ElectionsService } from './application/elections.service.js';
import { SystemClock } from './domain/clock.js';
import { ELECTION_CLOCK, ELECTION_READINESS, ELECTION_REPOSITORY } from './elections.tokens.js';
import { ElectionsController } from './http/elections.controller.js';
import { DrizzleElectionReadinessVerifier } from '../eligibility/infrastructure/persistence/drizzle-election-readiness-verifier.js';
import { DrizzleElectionRepository } from './infrastructure/persistence/drizzle-election.repository.js';

@Module({
  controllers: [ElectionsController],
  exports: [ElectionsService, ELECTION_CLOCK, ELECTION_REPOSITORY],
  imports: [AuthModule],
  providers: [
    {
      inject: [DATABASE_CLIENT],
      provide: ELECTION_REPOSITORY,
      useFactory: (database: Database) => new DrizzleElectionRepository(database),
    },
    {
      inject: [DATABASE_CLIENT],
      provide: ELECTION_READINESS,
      useFactory: (database: Database) => new DrizzleElectionReadinessVerifier(database),
    },
    { provide: ELECTION_CLOCK, useClass: SystemClock },
    ElectionsService,
  ],
})
export class ElectionsModule {}
