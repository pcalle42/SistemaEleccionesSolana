import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

export class AdminLoginDto {
  @ApiProperty({ maxLength: 256, writeOnly: true })
  @IsString()
  @MaxLength(256)
  password!: string;

  @ApiProperty({ maxLength: 64 })
  @IsString()
  @MaxLength(64)
  @MinLength(1)
  username!: string;
}

export class AdminLoginResponseDto {
  @ApiProperty({ format: 'uuid' })
  adminId!: string;

  @ApiProperty({ description: 'Send this value in x-csrf-token for authenticated mutations.' })
  csrfToken!: string;
}

export class AdminSessionResponseDto extends AdminLoginResponseDto {}

export class ChangeAdminPasswordDto {
  @ApiProperty({ maxLength: 256, writeOnly: true })
  @IsString()
  @MaxLength(256)
  currentPassword!: string;

  @ApiProperty({ maxLength: 256, minLength: 16, writeOnly: true })
  @IsString()
  @MaxLength(256)
  @MinLength(16)
  newPassword!: string;
}
