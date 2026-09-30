import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';

import { ErrorResponseDto } from '../../../common/errors/error-response.dto.js';
import { AdminAuthGuard } from '../../auth/http/admin-auth.guard.js';
import { AdminNoStoreInterceptor } from '../../auth/http/admin-no-store.interceptor.js';
import type { AdminRequest } from '../../auth/http/auth-http.js';
import { CsrfGuard } from '../../auth/http/csrf.guard.js';
import { EligibilityService } from '../application/eligibility.service.js';
import type { EligibleVoterState } from '../domain/eligible-voter.js';
import type { ElectoralCredentialState } from '../domain/electoral-credential.js';
import type { EligibilitySnapshotState } from '../domain/eligibility-snapshot.js';
import {
  ElectoralCredentialResponseDto,
  EligibilitySnapshotResponseDto,
  EligibleVoterResponseDto,
  ImportEligibleVotersDto,
  ImportEligibleVotersResponseDto,
  RegisterElectoralCredentialDto,
  RegisterEligibleVoterDto,
} from './eligibility.dto.js';

function voterResponse(state: EligibleVoterState): EligibleVoterResponseDto {
  return {
    createdAt: state.createdAt.toISOString(),
    displayName: state.displayName,
    externalReference: state.externalReference,
    id: state.id,
    status: state.status,
    updatedAt: state.updatedAt.toISOString(),
  };
}

function credentialResponse(state: ElectoralCredentialState): ElectoralCredentialResponseDto {
  return {
    activatedAt: state.activatedAt?.toISOString() ?? null,
    createdAt: state.createdAt.toISOString(),
    eligibleVoterId: state.eligibleVoterId,
    id: state.id,
    identityCommitment: state.identityCommitment,
    revokedAt: state.revokedAt?.toISOString() ?? null,
    schemeVersion: state.schemeVersion,
    status: state.status,
  };
}

function snapshotResponse(state: EligibilitySnapshotState): EligibilitySnapshotResponseDto {
  return {
    commitmentSchemeVersion: state.commitmentSchemeVersion,
    configurationVersion: state.configurationVersion,
    createdAt: state.createdAt.toISOString(),
    electionId: state.electionId,
    frozenAt: state.frozenAt?.toISOString() ?? null,
    id: state.id,
    leafCount: state.leafCount,
    merkleRoot: state.merkleRoot,
    status: state.status,
    treeDepth: state.treeDepth,
    version: state.version,
  };
}

@ApiTags('admin-eligibility')
@ApiCookieAuth('admin-session')
@ApiUnauthorizedResponse({ type: ErrorResponseDto })
@UseGuards(AdminAuthGuard)
@UseInterceptors(AdminNoStoreInterceptor)
@Controller('admin')
export class EligibilityController {
  constructor(private readonly eligibility: EligibilityService) {}

  @Post('eligible-voters')
  @UseGuards(CsrfGuard)
  @ApiCreatedResponse({ type: EligibleVoterResponseDto })
  @ApiBadRequestResponse({ type: ErrorResponseDto })
  async registerVoter(
    @Body() body: RegisterEligibleVoterDto,
    @Req() request: AdminRequest,
  ): Promise<EligibleVoterResponseDto> {
    return voterResponse(
      await this.eligibility.registerVoter(body, request.adminPrincipal!, request.id),
    );
  }

  @Get('eligible-voters')
  @ApiOkResponse({ type: EligibleVoterResponseDto, isArray: true })
  async listVoters(): Promise<EligibleVoterResponseDto[]> {
    return (await this.eligibility.listVoters()).map(voterResponse);
  }

  @Post('eligible-voters/import')
  @HttpCode(HttpStatus.OK)
  @UseGuards(CsrfGuard)
  @ApiOkResponse({ type: ImportEligibleVotersResponseDto })
  async importVoters(
    @Body() body: ImportEligibleVotersDto,
    @Req() request: AdminRequest,
  ): Promise<ImportEligibleVotersResponseDto> {
    return this.eligibility.importVoters(
      body.records,
      body.dryRun ?? true,
      request.adminPrincipal!,
      request.id,
    );
  }

  @Post('eligible-voters/:id/deactivate')
  @HttpCode(HttpStatus.OK)
  @UseGuards(CsrfGuard)
  @ApiOkResponse({ type: EligibleVoterResponseDto })
  @ApiConflictResponse({ type: ErrorResponseDto })
  async deactivateVoter(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() request: AdminRequest,
  ): Promise<EligibleVoterResponseDto> {
    return voterResponse(
      await this.eligibility.deactivateVoter(id, request.adminPrincipal!, request.id),
    );
  }

  @Post('electoral-credentials')
  @UseGuards(CsrfGuard)
  @ApiCreatedResponse({ type: ElectoralCredentialResponseDto })
  async registerCredential(
    @Body() body: RegisterElectoralCredentialDto,
    @Req() request: AdminRequest,
  ): Promise<ElectoralCredentialResponseDto> {
    return credentialResponse(
      await this.eligibility.registerCredential(body, request.adminPrincipal!, request.id),
    );
  }

  @Post('electoral-credentials/:id/revoke')
  @HttpCode(HttpStatus.OK)
  @UseGuards(CsrfGuard)
  @ApiOkResponse({ type: ElectoralCredentialResponseDto })
  async revokeCredential(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() request: AdminRequest,
  ): Promise<ElectoralCredentialResponseDto> {
    return credentialResponse(
      await this.eligibility.revokeCredential(id, request.adminPrincipal!, request.id),
    );
  }

  @Post('elections/:id/eligibility-snapshots')
  @UseGuards(CsrfGuard)
  @ApiCreatedResponse({ type: EligibilitySnapshotResponseDto })
  async buildSnapshot(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() request: AdminRequest,
  ): Promise<EligibilitySnapshotResponseDto> {
    return snapshotResponse(
      await this.eligibility.buildSnapshot(id, request.adminPrincipal!, request.id),
    );
  }

  @Post('elections/:id/eligibility-snapshots/:snapshotId/freeze')
  @HttpCode(HttpStatus.OK)
  @UseGuards(CsrfGuard)
  @ApiOkResponse({ type: EligibilitySnapshotResponseDto })
  async freezeSnapshot(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('snapshotId', ParseUUIDPipe) snapshotId: string,
    @Req() request: AdminRequest,
  ): Promise<EligibilitySnapshotResponseDto> {
    return snapshotResponse(
      await this.eligibility.freezeSnapshot(id, snapshotId, request.adminPrincipal!, request.id),
    );
  }
}
