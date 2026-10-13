import { NotFoundException, UnauthorizedException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import type { AppConfig } from '../config/app-config.js';
import { MetricsController } from './metrics.controller.js';
import { OperationalMetricsService } from './metrics.service.js';

const token = 'a-secure-observability-token-32chars';

function config(metricsEnabled: boolean): AppConfig {
  return {
    observability: { metricsEnabled, metricsToken: metricsEnabled ? token : '' },
  } as AppConfig;
}

function responseDouble() {
  return {
    setHeader: vi.fn(),
    type: vi.fn(),
  };
}

describe('MetricsController', () => {
  it('looks absent when metrics are disabled', () => {
    const controller = new MetricsController(config(false), new OperationalMetricsService());

    expect(() => controller.metricsSnapshot(undefined, responseDouble() as never)).toThrow(
      NotFoundException,
    );
  });

  it('requires the private token and emits no-store OpenMetrics', () => {
    const metrics = new OperationalMetricsService();
    metrics.recordHttp('/health/live', 200, 1);
    const controller = new MetricsController(config(true), metrics);
    const response = responseDouble();

    expect(() => controller.metricsSnapshot('wrong-token', response as never)).toThrow(
      UnauthorizedException,
    );
    expect(controller.metricsSnapshot(token, response as never)).toContain(
      'http_requests_total{route="/health/live",service="votaciones-api",status_class="2xx"}',
    );
    expect(response.setHeader).toHaveBeenCalledWith('cache-control', 'no-store');
    expect(response.type).toHaveBeenCalledWith(
      'application/openmetrics-text; version=1.0.0; charset=utf-8',
    );
  });
});
