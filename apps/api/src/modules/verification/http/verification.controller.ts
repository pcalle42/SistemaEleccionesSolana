import {
  Controller,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  Res,
  StreamableFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import {
  ApiConflictResponse,
  ApiCookieAuth,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type { Response } from 'express';

import { ErrorResponseDto } from '../../../common/errors/error-response.dto.js';
import { ApplicationError } from '../../../common/errors/application-error.js';
import { AdminAuthGuard } from '../../auth/http/admin-auth.guard.js';
import { AdminNoStoreInterceptor } from '../../auth/http/admin-no-store.interceptor.js';
import type { AdminRequest } from '../../auth/http/auth-http.js';
import { CsrfGuard } from '../../auth/http/csrf.guard.js';
import { VerificationService } from '../application/verification.service.js';

@ApiTags('public-verification')
@Controller('elections')
export class PublicVerificationController {
  constructor(private readonly verification: VerificationService) {}

  @Get(':id/manifest')
  @Header('Cache-Control', 'public, max-age=300, stale-while-revalidate=60')
  @ApiOperation({ summary: 'Get the immutable public election manifest' })
  @ApiOkResponse({ description: 'Canonical manifest and digest' })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  async manifest(
    @Param('id', ParseUUIDPipe) id: string,
    @Res({ passthrough: true }) response: Response,
  ) {
    const envelope = await this.verification.getManifest(id);
    response.setHeader('ETag', `"${envelope.manifestDigest}"`);
    return envelope;
  }

  @Get(':id/verification')
  @Header('Cache-Control', 'public, max-age=60')
  @ApiOkResponse({ description: 'Published verification package metadata and report' })
  verificationPackage(@Param('id', ParseUUIDPipe) id: string) {
    return this.verification.getVerification(id);
  }

  @Get(':id/verification/files/:fileName')
  @ApiOkResponse({ description: 'One immutable file from the portable verification package' })
  async verificationFile(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('fileName') fileName: string,
    @Res({ passthrough: true }) response: Response,
  ) {
    const artifact = await this.verification.getVerificationFile(id, fileName);
    response.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    response.setHeader('ETag', `"${artifact.digest}"`);
    response.setHeader(
      'Content-Type',
      fileName.endsWith('.json') || fileName.endsWith('.jsonl')
        ? 'application/json; charset=utf-8'
        : 'text/markdown; charset=utf-8',
    );
    return new StreamableFile(artifact.bytes);
  }

  @Get(':id/results')
  @Header('Cache-Control', 'public, max-age=60')
  @ApiOkResponse({ description: 'Published tally' })
  results(@Param('id', ParseUUIDPipe) id: string) {
    return this.verification.getResults(id);
  }

  @Get(':id/results/:resultVersion')
  @Header('Cache-Control', 'public, max-age=31536000, immutable')
  @ApiOkResponse({ description: 'One immutable published result version' })
  resultVersion(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('resultVersion') rawResultVersion: string,
  ) {
    if (!/^[1-9][0-9]*$/u.test(rawResultVersion)) {
      throw new ApplicationError(
        'INVALID_RESULT_VERSION',
        'Result version is invalid.',
        'validation',
      );
    }
    return this.verification.getResults(id, Number(rawResultVersion));
  }

  @Get(':id/verification/receipts/:receiptCommitment')
  @Header('Cache-Control', 'public, max-age=60')
  @ApiOkResponse({ description: 'Receipt membership in the frozen accepted vote set' })
  receipt(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('receiptCommitment') receiptCommitment: string,
  ) {
    if (!/^[0-9a-f]{64}$/u.test(receiptCommitment)) {
      throw new ApplicationError('INVALID_RECEIPT', 'Receipt is invalid.', 'validation');
    }
    return this.verification.getReceipt(id, receiptCommitment);
  }
}

@ApiTags('admin-verification')
@ApiCookieAuth('admin-session')
@ApiUnauthorizedResponse({ type: ErrorResponseDto })
@ApiConflictResponse({ type: ErrorResponseDto })
@Controller('admin/elections')
@UseGuards(AdminAuthGuard)
@UseInterceptors(AdminNoStoreInterceptor)
export class AdminVerificationController {
  constructor(private readonly verification: VerificationService) {}

  @Post(':id/checkpoints')
  @HttpCode(HttpStatus.OK)
  @UseGuards(CsrfGuard)
  createCheckpoint(@Param('id', ParseUUIDPipe) id: string, @Req() request: AdminRequest) {
    return this.verification.createCheckpoint(id, request.adminPrincipal!);
  }

  @Post(':id/compute-tally')
  @HttpCode(HttpStatus.OK)
  @UseGuards(CsrfGuard)
  computeTally(@Param('id', ParseUUIDPipe) id: string, @Req() request: AdminRequest) {
    return this.verification.computeTally(id, request.adminPrincipal!);
  }

  @Post(':id/enter-counting')
  @HttpCode(HttpStatus.OK)
  @UseGuards(CsrfGuard)
  enterCounting(@Param('id', ParseUUIDPipe) id: string, @Req() request: AdminRequest) {
    return this.verification.enterCounting(id, request.adminPrincipal!);
  }

  @Post(':id/verification-package')
  @HttpCode(HttpStatus.OK)
  @UseGuards(CsrfGuard)
  generatePackage(@Param('id', ParseUUIDPipe) id: string, @Req() request: AdminRequest) {
    return this.verification.generatePackage(id, request.adminPrincipal!);
  }

  @Post(':id/publish-results')
  @HttpCode(HttpStatus.OK)
  @UseGuards(CsrfGuard)
  publishResults(@Param('id', ParseUUIDPipe) id: string, @Req() request: AdminRequest) {
    return this.verification.publishResults(id, request.adminPrincipal!);
  }
}
