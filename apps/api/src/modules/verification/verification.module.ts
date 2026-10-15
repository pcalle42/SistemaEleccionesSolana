import { Module } from '@nestjs/common';

import type { AppConfig } from '../../config/app-config.js';
import { APP_CONFIG } from '../../config/config.tokens.js';
import { AuthModule } from '../auth/auth.module.js';
import { VerificationService } from './application/verification.service.js';
import {
  AdminVerificationController,
  PublicVerificationController,
} from './http/verification.controller.js';
import { FilesystemVerificationArtifactStore } from './infrastructure/filesystem-verification-artifact.store.js';
import { VERIFICATION_ARTIFACT_STORE } from './verification.tokens.js';

@Module({
  controllers: [AdminVerificationController, PublicVerificationController],
  imports: [AuthModule],
  providers: [
    {
      inject: [APP_CONFIG],
      provide: VERIFICATION_ARTIFACT_STORE,
      useFactory: (config: AppConfig) =>
        new FilesystemVerificationArtifactStore(config.verification.artifactDirectory),
    },
    VerificationService,
  ],
})
export class VerificationModule {}
