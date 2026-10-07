import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { AuditController } from './http/audit.controller.js';

@Module({ controllers: [AuditController], imports: [AuthModule] })
export class AuditModule {}
