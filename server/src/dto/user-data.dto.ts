import { Type } from 'class-transformer';
import { IsArray, IsNotEmpty, IsOptional, IsString, MaxLength, ValidateNested } from 'class-validator';

export class SaveFavoriteDto {
  @IsString()
  @IsOptional()
  @MaxLength(128)
  templateId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  id?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1024)
  image?: string;
}

class DraftElementDto {
  [key: string]: unknown;
}

export class SaveDraftDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  id: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  templateId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1024)
  coverImage?: string;

  @IsOptional()
  @Type(() => Number)
  templateWidth?: number;

  @IsOptional()
  @Type(() => Number)
  templateHeight?: number;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DraftElementDto)
  elements: DraftElementDto[];
}
