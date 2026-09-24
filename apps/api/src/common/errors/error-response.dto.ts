import { ApiProperty } from '@nestjs/swagger';

export class ErrorDetailDto {
  @ApiProperty({ example: 'VALIDATION_FAILED' })
  code!: string;

  @ApiProperty({ example: 'Request validation failed.' })
  message!: string;

  @ApiProperty({ example: '018f47b5-a345-7c89-b012-3456789abcde' })
  requestId!: string;
}

export class ErrorResponseDto {
  @ApiProperty({ type: ErrorDetailDto })
  error!: ErrorDetailDto;
}
