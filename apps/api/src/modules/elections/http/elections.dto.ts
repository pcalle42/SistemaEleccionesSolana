import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class ElectionOptionInputDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  id?: string;

  @ApiProperty({ maxLength: 200 })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  label!: string;

  @ApiPropertyOptional({ maxLength: 1_000, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(1_000)
  description?: string | null;

  @ApiProperty({ minimum: 0 })
  @IsInt()
  @Min(0)
  displayOrder!: number;
}

export class CreateElectionDto {
  @ApiProperty({ maxLength: 200 })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title!: string;

  @ApiPropertyOptional({ maxLength: 2_000, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(2_000)
  description?: string | null;

  @ApiProperty({ format: 'date-time' })
  @IsISO8601({ strict: true, strictSeparator: true })
  opensAt!: string;

  @ApiProperty({ format: 'date-time' })
  @IsISO8601({ strict: true, strictSeparator: true })
  closesAt!: string;

  @ApiPropertyOptional({ enum: ['SINGLE_CHOICE'] })
  @IsOptional()
  @IsIn(['SINGLE_CHOICE'])
  votingMethod?: 'SINGLE_CHOICE';

  @ApiPropertyOptional({ maxLength: 64 })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  protocolVersion?: string;

  @ApiPropertyOptional({ maxLength: 64 })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  circuitVersion?: string;

  @ApiPropertyOptional({ type: () => [ElectionOptionInputDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ElectionOptionInputDto)
  options?: ElectionOptionInputDto[];
}

export class UpdateDraftElectionDto {
  @ApiPropertyOptional({ maxLength: 200 })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title?: string;

  @ApiPropertyOptional({ maxLength: 2_000, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(2_000)
  description?: string | null;

  @ApiPropertyOptional({ format: 'date-time' })
  @IsOptional()
  @IsISO8601({ strict: true, strictSeparator: true })
  opensAt?: string;

  @ApiPropertyOptional({ format: 'date-time' })
  @IsOptional()
  @IsISO8601({ strict: true, strictSeparator: true })
  closesAt?: string;

  @ApiPropertyOptional({ enum: ['SINGLE_CHOICE'] })
  @IsOptional()
  @IsIn(['SINGLE_CHOICE'])
  votingMethod?: 'SINGLE_CHOICE';

  @ApiPropertyOptional({ maxLength: 64, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  protocolVersion?: string | null;

  @ApiPropertyOptional({ maxLength: 64, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  circuitVersion?: string | null;

  @ApiPropertyOptional({ type: () => [ElectionOptionInputDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ElectionOptionInputDto)
  options?: ElectionOptionInputDto[];
}

export class ElectionTransitionReasonDto {
  @ApiProperty({ maxLength: 1_000, minLength: 3 })
  @IsString()
  @MinLength(3)
  @MaxLength(1_000)
  reason!: string;
}

export class ElectionOptionResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;
  @ApiProperty()
  label!: string;
  @ApiProperty({ nullable: true })
  description!: string | null;
  @ApiProperty()
  displayOrder!: number;
}

export class ElectionResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;
  @ApiProperty()
  title!: string;
  @ApiProperty({ nullable: true })
  description!: string | null;
  @ApiProperty({
    enum: ['DRAFT', 'READY', 'OPEN', 'CLOSED', 'COUNTING', 'RESULTS_PUBLISHED', 'CANCELLED'],
  })
  status!: string;
  @ApiProperty({ enum: ['SINGLE_CHOICE'] })
  votingMethod!: string;
  @ApiProperty({ format: 'date-time' })
  opensAt!: string;
  @ApiProperty({ format: 'date-time' })
  closesAt!: string;
  @ApiProperty({ format: 'date-time' })
  createdAt!: string;
  @ApiProperty({ format: 'date-time' })
  updatedAt!: string;
  @ApiProperty({ minimum: 0 })
  configurationVersion!: number;
  @ApiProperty({ nullable: true })
  cancellationReason!: string | null;
  @ApiProperty({ nullable: true })
  eligibilityConfigurationRef!: string | null;
  @ApiProperty({ nullable: true })
  protocolVersion!: string | null;
  @ApiProperty({ nullable: true })
  circuitVersion!: string | null;
  @ApiProperty({ type: () => [ElectionOptionResponseDto] })
  options!: ElectionOptionResponseDto[];
}
