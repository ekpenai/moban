import { IsArray, IsIn, IsObject, IsOptional, IsString } from 'class-validator';

export class RenderTextLayerDto {
  @IsObject()
  layer: Record<string, any>;

  @IsArray()
  @IsOptional()
  fonts?: Record<string, any>[];

  @IsString()
  @IsOptional()
  @IsIn(['url', 'base64', 'both'])
  deliveryMode?: 'url' | 'base64' | 'both';
}

export class RenderTextBatchDto {
  @IsArray()
  layers: Record<string, any>[];

  @IsArray()
  @IsOptional()
  fonts?: Record<string, any>[];

  @IsString()
  @IsOptional()
  @IsIn(['url', 'base64', 'both'])
  deliveryMode?: 'url' | 'base64' | 'both';
}
