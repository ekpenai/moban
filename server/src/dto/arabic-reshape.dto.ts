import { IsOptional, IsString, MaxLength } from 'class-validator';

export class ArabicReshapeDto {
  @IsString()
  @MaxLength(20000)
  text: string;

  @IsOptional()
  @IsString()
  mode?: 'arabic' | 'persian';
}
