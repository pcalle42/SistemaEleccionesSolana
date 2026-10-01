import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module.js';
import { VerificationService } from './application/verification.service.js';
import {
  AdminVerificationController,
  PublicVerificationController,
} from './http/verification.controller.js';

@Module({
  controllers: [AdminVerificationController, PublicVerificationController],
  imports: [AuthModule],
  providers: [VerificationService],
})
export class VerificationModule {}
