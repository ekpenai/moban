import { Type } from 'class-transformer';
import { IsArray, IsNotEmpty, IsOptional, IsString, MaxLength, ValidateNested } from 'class-validator';

export class SaveFavoriteDto {
  @IsOptional()
  @IsString()
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
  @MaxLength(128)
  template_id?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1024)
  coverImage?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1024)
  cover_image?: string;

  @IsOptional()
  @Type(() => Number)
  templateWidth?: number;

  @IsOptional()
  @Type(() => Number)
  template_width?: number;

  @IsOptional()
  @Type(() => Number)
  templateHeight?: number;

  @IsOptional()
  @Type(() => Number)
  template_height?: number;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DraftElementDto)
  elements?: DraftElementDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DraftElementDto)
  layers?: DraftElementDto[];

  @IsOptional()
  @IsString()
  elementsJson?: string;

  @IsOptional()
  @IsString()
  elements_json?: string;

  @IsOptional()
  updatedAt?: number;
}
