import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export class ListRenderJobsDto {
  @IsOptional()
  @IsString()
  @MaxLength(32)
  status?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  source?: string;
}

export class CreateRenderEventDto {
  @IsString()
  @MaxLength(64)
  userId: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  status?: string;

  @IsString()
  @MaxLength(128)
  stage: string;

  @IsString()
  @MaxLength(16)
  @IsIn(['info', 'warn', 'error'])
  level: 'info' | 'warn' | 'error';

  @IsString()
  @MaxLength(1024)
  message: string;

  @IsOptional()
  @IsString()
  @MaxLength(1024)
  imageUrl?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(1024)
  failedReason?: string | null;

  @IsOptional()
  progress?: number;

  @IsOptional()
  @IsString()
  startedAt?: string | null;

  @IsOptional()
  @IsString()
  completedAt?: string | null;

  @IsOptional()
  meta?: Record<string, unknown> | null;
}
