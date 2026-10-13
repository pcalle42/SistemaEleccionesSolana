import { ApiProperty } from '@nestjs/swagger';

export class VersionResponseDto {
  @ApiProperty({ example: '1.0.0-rc.1' })
  appVersion!: string;

  @ApiProperty({ example: '0123456789abcdef0123456789abcdef01234567' })
  gitCommit!: string;

  @ApiProperty({ example: `sha256:${'a'.repeat(64)}` })
  releaseManifestDigest!: string;

  @ApiProperty({ example: ['anonymous-single-choice-v1'], type: [String] })
  supportedProtocolVersions!: string[];
}
