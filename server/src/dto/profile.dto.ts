import { IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateProfileDto {
  @IsOptional()
  @IsString()
  @MaxLength(512)
  avatarUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  nickName?: string;
}
