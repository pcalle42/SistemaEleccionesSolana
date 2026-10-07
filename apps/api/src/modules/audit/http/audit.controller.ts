import { Controller, Get, Inject, Query, UseGuards, UseInterceptors } from '@nestjs/common';
import { ApiCookieAuth, ApiOkResponse, ApiTags, ApiUnauthorizedResponse } from '@nestjs/swagger';
import type pg from 'pg';

import { ErrorResponseDto } from '../../../common/errors/error-response.dto.js';
import { DATABASE_POOL } from '../../../database/database.tokens.js';
import { AdminAuthGuard } from '../../auth/http/admin-auth.guard.js';
import { AdminNoStoreInterceptor } from '../../auth/http/admin-no-store.interceptor.js';

interface AuditPublicRow extends pg.QueryResultRow {
  actorId: string | null;
  actorType: string;
  aggregateId: string | null;
  aggregateType: string | null;
  eventHash: string;
  eventType: string;
  occurredAt: Date;
  payload: unknown;
  sequence: number;
  streamId: string;
}

@ApiTags('admin-audit')
@ApiCookieAuth('admin-session')
@ApiUnauthorizedResponse({ type: ErrorResponseDto })
@Controller('admin/audit')
@UseGuards(AdminAuthGuard)
@UseInterceptors(AdminNoStoreInterceptor)
export class AuditController {
  constructor(@Inject(DATABASE_POOL) private readonly pool: pg.Pool) {}

  @Get()
  @ApiOkResponse({ description: 'Read-only append-only audit events' })
  async list(
    @Query('streamId') streamId?: string,
    @Query('eventType') eventType?: string,
  ): Promise<AuditPublicRow[]> {
    const result = await this.pool.query<AuditPublicRow>(
      `SELECT actor_id AS "actorId", actor_type AS "actorType",
              aggregate_id AS "aggregateId", aggregate_type AS "aggregateType",
              event_hash AS "eventHash", event_type AS "eventType", occurred_at AS "occurredAt",
              payload, sequence::int, stream_id AS "streamId"
         FROM audit.audit_event
        WHERE ($1::text IS NULL OR stream_id = $1)
          AND ($2::text IS NULL OR event_type = $2)
        ORDER BY sequence DESC LIMIT 200`,
      [streamId?.slice(0, 255) || null, eventType?.slice(0, 120) || null],
    );
    return result.rows;
  }
}
