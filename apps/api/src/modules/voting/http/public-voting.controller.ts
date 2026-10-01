import { Body, Controller, Inject, Param, ParseUUIDPipe, Post, Req } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOperation,
  ApiPayloadTooLargeResponse,
  ApiServiceUnavailableResponse,
  ApiTags,
  ApiTooManyRequestsResponse,
} from '@nestjs/swagger';

import { ApplicationError } from '../../../common/errors/application-error.js';
import { ErrorResponseDto } from '../../../common/errors/error-response.dto.js';
import type { RequestWithId } from '../../../common/logging/request-id.js';
import { CastVoteService } from '../application/cast-vote.service.js';
import type { VoteAdmission } from '../application/ports/vote-admission.port.js';
import { VotingError } from '../domain/voting-errors.js';
import { VOTE_ADMISSION } from '../voting.tokens.js';
import { CastVoteDto, CastVoteResponseDto } from './voting.dto.js';

@ApiTags('public-voting')
@Controller('elections/:electionId/votes')
export class PublicVotingController {
  constructor(
    private readonly castVote: CastVoteService,
    @Inject(VOTE_ADMISSION) private readonly admission: VoteAdmission,
  ) {}

  @Post()
  @ApiOperation({
    summary: 'Cast one anonymous vote using a ZK eligibility proof',
    description:
      'No authenticated identity, credential, voter secret, Merkle path, or verification artifact is accepted.',
  })
  @ApiCreatedResponse({ type: CastVoteResponseDto })
  @ApiBadRequestResponse({ type: ErrorResponseDto })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  @ApiConflictResponse({ type: ErrorResponseDto })
  @ApiPayloadTooLargeResponse({ type: ErrorResponseDto })
  @ApiTooManyRequestsResponse({ type: ErrorResponseDto })
  @ApiServiceUnavailableResponse({ type: ErrorResponseDto })
  async create(
    @Param('electionId', ParseUUIDPipe) electionId: string,
    @Body() body: CastVoteDto,
    @Req() request: RequestWithId,
  ): Promise<CastVoteResponseDto> {
    try {
      const result = await this.admission.execute(request.ip || 'unavailable', () =>
        this.castVote.cast({
          electionId,
          proof: body.proof,
          protocolVersion: body.protocolVersion,
          publicSignals: body.publicSignals,
        }),
      );
      return {
        receipt: {
          acceptedAt: result.receipt.acceptedAt.toISOString(),
          electionId: result.receipt.electionId,
          nullifier: result.receipt.nullifier,
          receiptCommitment: result.receipt.receiptCommitment,
          receiptVersion: result.receipt.receiptVersion,
        },
        status: result.status,
      };
    } catch (error: unknown) {
      if (error instanceof VotingError && error.code === 'VOTE_RATE_LIMITED') {
        throw new ApplicationError(error.code, error.message, 'rate-limit', { cause: error });
      }
      throw error;
    }
  }
}
