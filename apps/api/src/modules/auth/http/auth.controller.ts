import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Post,
  Req,
  Res,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiCookieAuth,
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiServiceUnavailableResponse,
  ApiTags,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type { Response } from 'express';

import type { AppConfig } from '../../../config/app-config.js';
import { APP_CONFIG } from '../../../config/config.tokens.js';
import { ErrorResponseDto } from '../../../common/errors/error-response.dto.js';
import { AdminAuthService } from '../application/admin-auth.service.js';
import { AdminAuthGuard } from './admin-auth.guard.js';
import { AdminNoStoreInterceptor } from './admin-no-store.interceptor.js';
import {
  AdminLoginDto,
  AdminLoginResponseDto,
  AdminSessionResponseDto,
  ChangeAdminPasswordDto,
} from './auth.dto.js';
import {
  clearAdminSessionCookie,
  readCookie,
  readCsrfHeader,
  setAdminSessionCookie,
  validateMutationOrigin,
  type AdminRequest,
} from './auth-http.js';
import { CsrfGuard } from './csrf.guard.js';

@ApiTags('admin-auth')
@Controller('admin/auth')
@UseInterceptors(AdminNoStoreInterceptor)
export class AuthController {
  constructor(
    private readonly auth: AdminAuthService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Authenticate the administrative account' })
  @ApiOkResponse({ type: AdminLoginResponseDto })
  @ApiUnauthorizedResponse({ description: 'Credentials are invalid.' })
  @ApiTooManyRequestsResponse({ type: ErrorResponseDto })
  @ApiServiceUnavailableResponse({ type: ErrorResponseDto })
  async login(
    @Body() body: AdminLoginDto,
    @Req() request: AdminRequest,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AdminLoginResponseDto> {
    const result = await this.auth.login({
      networkSignal: request.socket.remoteAddress ?? 'unknown',
      password: body.password,
      requestId: request.id,
      username: body.username,
    });
    setAdminSessionCookie(response, this.config, result.sessionToken);
    return { adminId: result.adminId, csrfToken: result.csrfToken };
  }

  @Get('session')
  @UseGuards(AdminAuthGuard)
  @ApiCookieAuth('admin-session')
  @ApiOkResponse({ type: AdminSessionResponseDto })
  @ApiUnauthorizedResponse({ type: ErrorResponseDto })
  @ApiServiceUnavailableResponse({ type: ErrorResponseDto })
  session(@Req() request: AdminRequest): AdminSessionResponseDto {
    const token = readCookie(request, this.config.auth.cookieName)!;
    return {
      adminId: request.adminPrincipal!.adminId,
      csrfToken: this.auth.csrfToken(token),
    };
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiCookieAuth('admin-session')
  @ApiNoContentResponse({ description: 'Session invalidated when present.' })
  @ApiForbiddenResponse({ type: ErrorResponseDto })
  @ApiServiceUnavailableResponse({ type: ErrorResponseDto })
  async logout(
    @Req() request: AdminRequest,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    validateMutationOrigin(request, this.config);
    await this.auth.logout(
      readCookie(request, this.config.auth.cookieName),
      readCsrfHeader(request, this.config.auth.csrfHeaderName),
      request.id,
    );
    clearAdminSessionCookie(response, this.config);
  }

  @Post('change-password')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(AdminAuthGuard, CsrfGuard)
  @ApiCookieAuth('admin-session')
  @ApiNoContentResponse({ description: 'Password changed and all sessions revoked.' })
  @ApiBadRequestResponse({ type: ErrorResponseDto })
  @ApiUnauthorizedResponse({ type: ErrorResponseDto })
  @ApiForbiddenResponse({ type: ErrorResponseDto })
  @ApiServiceUnavailableResponse({ type: ErrorResponseDto })
  async changePassword(
    @Body() body: ChangeAdminPasswordDto,
    @Req() request: AdminRequest,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    await this.auth.changePassword(
      request.adminPrincipal!,
      body.currentPassword,
      body.newPassword,
      request.id,
    );
    clearAdminSessionCookie(response, this.config);
  }
}
