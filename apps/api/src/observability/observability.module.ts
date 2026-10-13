import { Global, Module } from '@nestjs/common';

import { MetricsController } from './metrics.controller.js';
import { OperationalMetricsService } from './metrics.service.js';

@Global()
@Module({
  controllers: [MetricsController],
  exports: [OperationalMetricsService],
  providers: [OperationalMetricsService],
})
export class ObservabilityModule {}
