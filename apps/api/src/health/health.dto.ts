import { ApiProperty } from '@nestjs/swagger';

export class LiveHealthResponseDto {
  @ApiProperty({ enum: ['ok'], example: 'ok' })
  status!: 'ok';
}

export class DependencyHealthDto {
  @ApiProperty({ enum: ['healthy'], example: 'healthy' })
  postgresql!: 'healthy';

  @ApiProperty({ enum: ['healthy', 'degraded', 'unavailable'], example: 'healthy' })
  valkey!: 'healthy' | 'degraded' | 'unavailable';
}

export class ReadyHealthResponseDto {
  @ApiProperty({ type: DependencyHealthDto })
  dependencies!: DependencyHealthDto;

  @ApiProperty({ enum: ['ready', 'degraded'], example: 'ready' })
  status!: 'ready' | 'degraded';
}
