import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiServiceUnavailableResponse, ApiTags } from '@nestjs/swagger';

import { ErrorResponseDto } from '../common/errors/error-response.dto.js';
import { LiveHealthResponseDto, ReadyHealthResponseDto } from './health.dto.js';
import { HealthService } from './health.service.js';

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(private readonly health: HealthService) {}

  @Get('live')
  @ApiOkResponse({ type: LiveHealthResponseDto })
  live(): LiveHealthResponseDto {
    return this.health.live();
  }

  @Get('ready')
  @ApiOkResponse({ type: ReadyHealthResponseDto })
  @ApiServiceUnavailableResponse({ type: ErrorResponseDto })
  ready(): Promise<ReadyHealthResponseDto> {
    return this.health.ready();
  }
}
