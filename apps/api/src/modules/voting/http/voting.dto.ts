import { ApiProperty } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayMinSize,
  Equals,
  IsArray,
  IsObject,
  IsString,
  Matches,
} from 'class-validator';
import { PROTOCOL_VERSION_V1 } from '@votaciones/zk-protocol';

const CANONICAL_COORDINATE = /^(0|[1-9][0-9]{0,79})$/u;

export class CastVoteDto {
  @ApiProperty({ enum: [PROTOCOL_VERSION_V1] })
  @Equals(PROTOCOL_VERSION_V1)
  protocolVersion!: string;

  @ApiProperty({
    additionalProperties: true,
    description: 'Groth16 proof. Verification artifacts are selected by the server.',
    type: 'object',
  })
  @IsObject()
  proof!: Record<string, unknown>;

  @ApiProperty({
    description: 'Five canonical BN254 public signals in manifest order.',
    example: ['1', '2', '3', '0', '2'],
    isArray: true,
    type: String,
  })
  @IsArray()
  @ArrayMinSize(5)
  @ArrayMaxSize(5)
  @IsString({ each: true })
  @Matches(CANONICAL_COORDINATE, { each: true })
  publicSignals!: string[];
}

export class VoteReceiptDto {
  @ApiProperty({ enum: ['anonymous-vote-receipt-v1'] })
  receiptVersion!: string;

  @ApiProperty({ format: 'uuid' })
  electionId!: string;

  @ApiProperty({ description: 'Canonical decimal BN254 field element.' })
  nullifier!: string;

  @ApiProperty({ pattern: '^[0-9a-f]{64}$' })
  receiptCommitment!: string;

  @ApiProperty({ format: 'date-time' })
  acceptedAt!: string;
}

export class CastVoteResponseDto {
  @ApiProperty({ enum: ['accepted'] })
  status!: 'accepted';

  @ApiProperty({ type: VoteReceiptDto })
  receipt!: VoteReceiptDto;
}
