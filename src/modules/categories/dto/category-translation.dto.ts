import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class CategoryTranslationDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  label: string;

  @IsOptional()
  @IsString()
  description?: string | null;
}
