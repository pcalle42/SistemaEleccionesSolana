import {
  Controller,
  Get,
  Headers,
  Inject,
  NotFoundException,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import type { Response } from 'express';
import { timingSafeEqual } from 'node:crypto';

import type { AppConfig } from '../config/app-config.js';
import { APP_CONFIG } from '../config/config.tokens.js';
import { OperationalMetricsService } from './metrics.service.js';

function tokenMatches(actual: string | undefined, expected: string): boolean {
  if (!actual) return false;
  const actualBuffer = Buffer.from(actual);
  const expectedBuffer = Buffer.from(expected);
  return (
    actualBuffer.length === expectedBuffer.length && timingSafeEqual(actualBuffer, expectedBuffer)
  );
}

@ApiExcludeController()
@Controller('internal/metrics')
export class MetricsController {
  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly metrics: OperationalMetricsService,
  ) {}

  @Get()
  metricsSnapshot(
    @Headers('x-observability-token') token: string | undefined,
    @Res({ passthrough: true }) response: Response,
  ): string {
    if (!this.config.observability.metricsEnabled) throw new NotFoundException();
    if (!tokenMatches(token, this.config.observability.metricsToken)) {
      throw new UnauthorizedException();
    }
    response.setHeader('cache-control', 'no-store');
    response.type('application/openmetrics-text; version=1.0.0; charset=utf-8');
    return this.metrics.renderOpenMetrics();
  }
}
