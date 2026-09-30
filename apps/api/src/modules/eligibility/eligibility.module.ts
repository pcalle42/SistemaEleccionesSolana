import { Module } from '@nestjs/common';

import type { Database } from '../../database/client.js';
import { DATABASE_CLIENT } from '../../database/database.tokens.js';
import { AuthModule } from '../auth/auth.module.js';
import { ElectionsModule } from '../elections/elections.module.js';
import { EligibilityService } from './application/eligibility.service.js';
import {
  ELECTORAL_CREDENTIAL_REPOSITORY,
  ELIGIBILITY_SNAPSHOT_REPOSITORY,
  ELIGIBLE_VOTER_REPOSITORY,
  MERKLE_TREE_BUILDER,
} from './eligibility.tokens.js';
import { EligibilityController } from './http/eligibility.controller.js';
import { DeferredMerkleTreeBuilder } from './infrastructure/merkle/deferred-merkle-tree-builder.js';
import { DrizzleElectoralCredentialRepository } from './infrastructure/persistence/drizzle-electoral-credential.repository.js';
import { DrizzleEligibilitySnapshotRepository } from './infrastructure/persistence/drizzle-eligibility-snapshot.repository.js';
import { DrizzleEligibleVoterRepository } from './infrastructure/persistence/drizzle-eligible-voter.repository.js';

@Module({
  controllers: [EligibilityController],
  exports: [EligibilityService],
  imports: [AuthModule, ElectionsModule],
  providers: [
    {
      inject: [DATABASE_CLIENT],
      provide: ELIGIBLE_VOTER_REPOSITORY,
      useFactory: (database: Database) => new DrizzleEligibleVoterRepository(database),
    },
    {
      inject: [DATABASE_CLIENT],
      provide: ELECTORAL_CREDENTIAL_REPOSITORY,
      useFactory: (database: Database) => new DrizzleElectoralCredentialRepository(database),
    },
    {
      inject: [DATABASE_CLIENT],
      provide: ELIGIBILITY_SNAPSHOT_REPOSITORY,
      useFactory: (database: Database) => new DrizzleEligibilitySnapshotRepository(database),
    },
    { provide: MERKLE_TREE_BUILDER, useClass: DeferredMerkleTreeBuilder },
    EligibilityService,
  ],
})
export class EligibilityModule {}
