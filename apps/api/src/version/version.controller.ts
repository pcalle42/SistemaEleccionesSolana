import { Controller, Get, Inject } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { PROTOCOL_VERSION_V1 } from '@votaciones/zk-protocol';

import type { AppConfig } from '../config/app-config.js';
import { APP_CONFIG } from '../config/config.tokens.js';
import { VersionResponseDto } from './version.dto.js';

@ApiTags('version')
@Controller('version')
export class VersionController {
  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {}

  @Get()
  @ApiOkResponse({ type: VersionResponseDto })
  version(): VersionResponseDto {
    return {
      appVersion: this.config.release.appVersion,
      gitCommit: this.config.release.gitCommit,
      releaseManifestDigest: this.config.release.manifestDigest,
      supportedProtocolVersions: [PROTOCOL_VERSION_V1],
    };
  }
}
