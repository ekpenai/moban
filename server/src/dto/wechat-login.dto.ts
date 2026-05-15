import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class WechatUserInfoDto {
  @IsOptional()
  @IsString()
  nickName?: string;

  @IsOptional()
  @IsString()
  avatarUrl?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(255)
  gender?: number;

  @IsOptional()
  @IsString()
  country?: string;

  @IsOptional()
  @IsString()
  province?: string;

  @IsOptional()
  @IsString()
  city?: string;

  @IsOptional()
  @IsString()
  language?: string;
}

export class WechatLoginDto {
  @IsString()
  @IsNotEmpty()
  code: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => WechatUserInfoDto)
  userInfo?: WechatUserInfoDto;
}
