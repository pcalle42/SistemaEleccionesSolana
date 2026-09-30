import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class RegisterEligibleVoterDto {
  @ApiPropertyOptional({ maxLength: 128 })
  @IsOptional()
  @IsString()
  @MaxLength(128)
  externalReference?: string;

  @ApiPropertyOptional({ maxLength: 200 })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  displayName?: string;
}

export class ImportEligibleVotersDto {
  @ApiProperty({ type: () => [RegisterEligibleVoterDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(1_000)
  @ValidateNested({ each: true })
  @Type(() => RegisterEligibleVoterDto)
  records!: RegisterEligibleVoterDto[];

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  dryRun?: boolean;
}

export class RegisterElectoralCredentialDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  eligibleVoterId!: string;

  @ApiProperty({
    description: 'Opaque, circuit-compatible commitment. Never the voter secret.',
    maxLength: 256,
  })
  @IsString()
  @MinLength(1)
  @MaxLength(256)
  identityCommitment!: string;

  @ApiProperty({ maxLength: 64 })
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  schemeVersion!: string;
}

export class EligibleVoterResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;
  @ApiPropertyOptional({ nullable: true })
  externalReference!: string | null;
  @ApiPropertyOptional({ nullable: true })
  displayName!: string | null;
  @ApiProperty({ enum: ['ACTIVE', 'INACTIVE', 'REVOKED'] })
  status!: string;
  @ApiProperty({ format: 'date-time' })
  createdAt!: string;
  @ApiProperty({ format: 'date-time' })
  updatedAt!: string;
}

export class ElectoralCredentialResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;
  @ApiProperty({ format: 'uuid' })
  eligibleVoterId!: string;
  @ApiProperty()
  identityCommitment!: string;
  @ApiProperty()
  schemeVersion!: string;
  @ApiProperty({ enum: ['PENDING', 'ACTIVE', 'REVOKED', 'ROTATED'] })
  status!: string;
  @ApiProperty({ format: 'date-time' })
  createdAt!: string;
  @ApiPropertyOptional({ format: 'date-time', nullable: true })
  activatedAt!: string | null;
  @ApiPropertyOptional({ format: 'date-time', nullable: true })
  revokedAt!: string | null;
}

export class EligibilitySnapshotResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;
  @ApiProperty({ format: 'uuid' })
  electionId!: string;
  @ApiProperty()
  configurationVersion!: number;
  @ApiProperty()
  version!: number;
  @ApiProperty({ enum: ['BUILDING', 'FROZEN', 'SUPERSEDED'] })
  status!: string;
  @ApiProperty()
  merkleRoot!: string;
  @ApiProperty()
  leafCount!: number;
  @ApiProperty()
  treeDepth!: number;
  @ApiProperty()
  commitmentSchemeVersion!: string;
  @ApiProperty({ format: 'date-time' })
  createdAt!: string;
  @ApiPropertyOptional({ format: 'date-time', nullable: true })
  frozenAt!: string | null;
}

export class ImportEligibleVotersResponseDto {
  @ApiProperty()
  validated!: number;
  @ApiProperty()
  created!: number;
  @ApiProperty()
  updated!: number;
}
