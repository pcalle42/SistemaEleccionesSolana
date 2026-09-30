import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
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
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';

import { ErrorResponseDto } from '../../../common/errors/error-response.dto.js';
import { AdminAuthGuard } from '../../auth/http/admin-auth.guard.js';
import { AdminNoStoreInterceptor } from '../../auth/http/admin-no-store.interceptor.js';
import type { AdminRequest } from '../../auth/http/auth-http.js';
import { CsrfGuard } from '../../auth/http/csrf.guard.js';
import { ElectionsService } from '../application/elections.service.js';
import type {
  DraftElectionChanges,
  ElectionConfigurationReferences,
  ElectionState,
} from '../domain/election.js';
import { electionOptionId, newElectionOptionId } from '../domain/election-id.js';
import {
  CreateElectionDto,
  ElectionResponseDto,
  ElectionTransitionReasonDto,
  UpdateDraftElectionDto,
} from './elections.dto.js';

function optionInputs(options: NonNullable<CreateElectionDto['options']>) {
  return options.map((option) => ({
    ...(option.description !== undefined ? { description: option.description } : {}),
    displayOrder: option.displayOrder,
    id: option.id ? electionOptionId(option.id) : newElectionOptionId(),
    label: option.label,
  }));
}

function referenceInputs(
  body: CreateElectionDto | UpdateDraftElectionDto,
): Partial<ElectionConfigurationReferences> {
  return {
    ...(body.circuitVersion !== undefined ? { circuitVersion: body.circuitVersion } : {}),
    ...(body.protocolVersion !== undefined ? { protocolVersion: body.protocolVersion } : {}),
  };
}

function response(state: ElectionState): ElectionResponseDto {
  return {
    cancellationReason: state.cancellationReason,
    circuitVersion: state.references.circuitVersion,
    closesAt: state.closesAt.toISOString(),
    configurationVersion: state.configurationVersion,
    createdAt: state.createdAt.toISOString(),
    description: state.description,
    eligibilityConfigurationRef: state.references.eligibilityConfigurationRef,
    id: state.id,
    opensAt: state.opensAt.toISOString(),
    options: state.options.map((option) => ({ ...option })),
    protocolVersion: state.references.protocolVersion,
    status: state.status,
    title: state.title,
    updatedAt: state.updatedAt.toISOString(),
    votingMethod: state.votingMethod,
  };
}

@ApiTags('admin-elections')
@ApiCookieAuth('admin-session')
@ApiUnauthorizedResponse({ type: ErrorResponseDto })
@Controller('admin/elections')
@UseGuards(AdminAuthGuard)
@UseInterceptors(AdminNoStoreInterceptor)
export class ElectionsController {
  constructor(private readonly elections: ElectionsService) {}

  @Post()
  @UseGuards(CsrfGuard)
  @ApiOperation({ summary: 'Create a draft election' })
  @ApiCreatedResponse({ type: ElectionResponseDto })
  @ApiBadRequestResponse({ type: ErrorResponseDto })
  async create(@Body() body: CreateElectionDto): Promise<ElectionResponseDto> {
    const state = await this.elections.create({
      closesAt: new Date(body.closesAt),
      ...(body.description !== undefined ? { description: body.description } : {}),
      opensAt: new Date(body.opensAt),
      ...(body.options ? { options: optionInputs(body.options) } : {}),
      references: referenceInputs(body),
      title: body.title,
      ...(body.votingMethod ? { votingMethod: body.votingMethod } : {}),
    });
    return response(state);
  }

  @Get()
  @ApiOkResponse({ type: ElectionResponseDto, isArray: true })
  async list(): Promise<ElectionResponseDto[]> {
    return (await this.elections.list()).map(response);
  }

  @Get(':id')
  @ApiOkResponse({ type: ElectionResponseDto })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  async get(@Param('id', ParseUUIDPipe) id: string): Promise<ElectionResponseDto> {
    return response(await this.elections.get(id));
  }

  @Patch(':id')
  @UseGuards(CsrfGuard)
  @ApiOkResponse({ type: ElectionResponseDto })
  @ApiBadRequestResponse({ type: ErrorResponseDto })
  @ApiConflictResponse({ type: ErrorResponseDto })
  async updateDraft(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateDraftElectionDto,
  ): Promise<ElectionResponseDto> {
    const changes: DraftElectionChanges = {
      ...(body.closesAt ? { closesAt: new Date(body.closesAt) } : {}),
      ...(body.description !== undefined ? { description: body.description } : {}),
      ...(body.opensAt ? { opensAt: new Date(body.opensAt) } : {}),
      ...(body.options ? { options: optionInputs(body.options) } : {}),
      references: referenceInputs(body),
      ...(body.title !== undefined ? { title: body.title } : {}),
      ...(body.votingMethod ? { votingMethod: body.votingMethod } : {}),
    };
    return response(await this.elections.updateDraft(id, changes));
  }

  @Post(':id/ready')
  @HttpCode(HttpStatus.OK)
  @UseGuards(CsrfGuard)
  @ApiOkResponse({ type: ElectionResponseDto })
  @ApiConflictResponse({ type: ErrorResponseDto })
  async prepare(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() request: AdminRequest,
  ): Promise<ElectionResponseDto> {
    return response(await this.elections.prepare(id, request.adminPrincipal!, request.id));
  }

  @Post(':id/reopen-draft')
  @HttpCode(HttpStatus.OK)
  @UseGuards(CsrfGuard)
  @ApiOkResponse({ type: ElectionResponseDto })
  async reopenDraft(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: ElectionTransitionReasonDto,
    @Req() request: AdminRequest,
  ): Promise<ElectionResponseDto> {
    return response(
      await this.elections.reopenDraft(id, request.adminPrincipal!, body.reason, request.id),
    );
  }

  @Post(':id/open')
  @HttpCode(HttpStatus.OK)
  @UseGuards(CsrfGuard)
  @ApiOkResponse({ type: ElectionResponseDto })
  async open(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() request: AdminRequest,
  ): Promise<ElectionResponseDto> {
    return response(await this.elections.open(id, request.adminPrincipal!, request.id));
  }

  @Post(':id/close')
  @HttpCode(HttpStatus.OK)
  @UseGuards(CsrfGuard)
  @ApiOkResponse({ type: ElectionResponseDto })
  async close(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() request: AdminRequest,
  ): Promise<ElectionResponseDto> {
    return response(await this.elections.close(id, request.adminPrincipal!, request.id));
  }

  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  @UseGuards(CsrfGuard)
  @ApiOkResponse({ type: ElectionResponseDto })
  async cancel(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: ElectionTransitionReasonDto,
    @Req() request: AdminRequest,
  ): Promise<ElectionResponseDto> {
    return response(
      await this.elections.cancel(id, request.adminPrincipal!, body.reason, request.id),
    );
  }
}
