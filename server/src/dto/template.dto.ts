import { IsString, IsNumber, IsObject, IsArray, IsOptional, IsNotEmpty } from 'class-validator';

export class SaveTemplateDto {
  @IsString()
  @IsOptional()
  id?: string;

  @IsString()
  @IsNotEmpty()
  name: string;

  @IsNumber()
  width: number;

  @IsNumber()
  height: number;

  @IsArray()
  layers: any[];

  @IsString()
  @IsOptional()
  thumbnail?: string;

  @IsString()
  @IsOptional()
  category?: string;
}

export class RenderTemplateDto {
  @IsObject()
  template: {
    width: number;
    height: number;
    layers: any[];
  };
}
