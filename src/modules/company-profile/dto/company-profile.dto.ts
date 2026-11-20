import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsBoolean, IsIn, IsInt, IsNotEmpty, IsOptional, IsString, IsUUID, Matches, MaxLength, Min, ValidateNested } from 'class-validator';

export class UpsertWebsiteLanguageDto {
  @ApiPropertyOptional({ example: 'en' }) @IsString() @Matches(/^[a-z]{2}(?:-[A-Z]{2})?$/) locale: string;
  @ApiPropertyOptional({ example: 'English' }) @IsString() @MaxLength(100) label: string;
  @IsOptional() @IsBoolean() is_default?: boolean;
  @IsOptional() @IsBoolean() is_active?: boolean;
  @IsOptional() @IsInt() @Min(0) sort_order?: number;
}

export class CreateClientDto {
  @IsOptional() @IsString() @MaxLength(255) name?: string;
  @IsOptional() @IsString() @MaxLength(1000) logo_url?: string | null;
  @IsOptional() @IsString() @MaxLength(1000) website_url?: string | null;
  @IsOptional() @IsBoolean() is_provider?: boolean;
  @IsOptional() @IsBoolean() is_public?: boolean;
  @IsOptional() @IsBoolean() is_active?: boolean;
  @IsOptional() @IsInt() @Min(0) sort_order?: number;
}

export class UpdateClientDto extends CreateClientDto {}

export class CreatePartnerDto {
  @IsString() @IsNotEmpty() @MaxLength(255) name: string;
  @IsOptional() @IsString() @MaxLength(1000) logo_url?: string | null;
  @IsOptional() @IsString() @MaxLength(1000) website_url?: string | null;
  @IsOptional() @IsString() @MaxLength(50) contact_whatsapp?: string | null;
  @IsOptional() @IsString() notes?: string | null;
  @IsBoolean() is_client: boolean;
  @IsBoolean() is_provider: boolean;
  @IsOptional() @IsBoolean() is_public?: boolean;
  @IsOptional() @IsBoolean() is_active?: boolean;
  @IsOptional() @IsInt() @Min(0) sort_order?: number;
  @IsOptional() @IsArray() @IsString({ each: true }) category_ids?: string[];
  @IsOptional() @IsArray() @IsString({ each: true }) location_ids?: string[];
}

export class UpdatePartnerDto {
  @IsOptional() @IsString() @IsNotEmpty() @MaxLength(255) name?: string;
  @IsOptional() @IsString() @MaxLength(1000) logo_url?: string | null;
  @IsOptional() @IsString() @MaxLength(1000) website_url?: string | null;
  @IsOptional() @IsString() @MaxLength(50) contact_whatsapp?: string | null;
  @IsOptional() @IsString() notes?: string | null;
  @IsOptional() @IsBoolean() is_client?: boolean;
  @IsOptional() @IsBoolean() is_provider?: boolean;
  @IsOptional() @IsBoolean() is_public?: boolean;
  @IsOptional() @IsBoolean() is_active?: boolean;
  @IsOptional() @IsInt() @Min(0) sort_order?: number;
  @IsOptional() @IsArray() @IsString({ each: true }) category_ids?: string[];
  @IsOptional() @IsArray() @IsString({ each: true }) location_ids?: string[];
}

export class UpsertPartnerCategoryDto {
  @IsOptional() @IsString() @MaxLength(100) slug?: string;
  @IsString() @IsNotEmpty() @MaxLength(255) name: string;
  @IsOptional() @IsString() @MaxLength(500) description?: string | null;
  @IsOptional() @IsBoolean() is_public?: boolean;
  @IsOptional() @IsBoolean() is_active?: boolean;
  @IsOptional() @IsInt() @Min(0) sort_order?: number;
}

export class CreatePartnerAccountDto {
  @IsUUID() bagdja_account_id: string;
  @IsString() @IsNotEmpty() @MaxLength(100) role: string;
}

export class ClientTranslationDto {
  @IsString() @Matches(/^[a-z]{2}(?:-[A-Z]{2})?$/) locale: string;
  @IsString() @MaxLength(255) name: string;
  @IsOptional() @IsString() @MaxLength(500) description?: string | null;
}

export class PartnerTranslationDto extends ClientTranslationDto {}

export class PortfolioPhotoDto {
  @IsString() @IsNotEmpty() @MaxLength(1000) url: string;
  @IsOptional() @IsString() @MaxLength(255) alt?: string;
  @IsOptional() @IsString() @MaxLength(500) caption?: string;
}

export class CreatePortfolioProjectDto {
  @IsOptional() @IsString() @MaxLength(255) name?: string;
  @IsOptional() @IsString() @MaxLength(255) slug?: string;
  @IsOptional() @IsString() @MaxLength(255) title?: string;
  @IsOptional() @IsString() @MaxLength(500) excerpt?: string | null;
  @IsOptional() @IsString() detail?: string | null;
  @IsOptional() @IsArray() @ArrayMaxSize(20) @IsString({ each: true }) @MaxLength(100, { each: true }) tags?: string[];
  @IsOptional() @IsString() @MaxLength(500) summary?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsString() @MaxLength(1000) cover_image?: string | null;
  @IsOptional() @IsArray() @ArrayMaxSize(4) @ValidateNested({ each: true }) @Type(() => PortfolioPhotoDto) photos?: PortfolioPhotoDto[];
  @IsOptional() @IsString() @MaxLength(1000) video_url?: string | null;
  @IsOptional() @IsString() @MaxLength(1000) model3d_url?: string | null;
  @IsOptional() @IsString() @MaxLength(1000) project_url?: string | null;
  @IsOptional() @IsString() @MaxLength(100) project_type?: string | null;
  @IsOptional() @IsInt() year?: number;
  @IsOptional() @IsString() client_id?: string | null;
  @IsOptional() @IsInt() @Min(0) sort_order?: number;
  @IsOptional() @IsBoolean() is_published?: boolean;
  @IsOptional() @IsBoolean() seo_no_index?: boolean;
  @IsOptional() @IsString() @MaxLength(255) seo_title?: string | null;
  @IsOptional() @IsString() @MaxLength(500) seo_description?: string | null;
  @IsOptional() @IsString() @MaxLength(1000) seo_image?: string | null;
}

export class UpdatePortfolioProjectDto extends CreatePortfolioProjectDto {}

export class PortfolioProjectTranslationDto {
  @IsString() @Matches(/^[a-z]{2}(?:-[A-Z]{2})?$/) locale: string;
  @IsString() @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/) @MaxLength(255) slug: string;
  @IsString() @MaxLength(255) title: string;
  @IsOptional() @IsString() @MaxLength(500) excerpt?: string | null;
  @IsOptional() @IsString() detail?: string | null;
  @IsOptional() @IsString() @MaxLength(500) summary?: string | null;
  @IsOptional() @IsString() description?: string | null;
  @IsOptional() @IsString() @MaxLength(255) seo_title?: string | null;
  @IsOptional() @IsString() @MaxLength(500) seo_description?: string | null;
  @IsOptional() @IsString() @MaxLength(1000) seo_image?: string | null;
  @IsOptional() @IsBoolean() seo_no_index?: boolean;
  @IsOptional() @IsBoolean() is_published?: boolean;
}

export class CreateMenuItemDto {
  @IsString() @MaxLength(100) menu_key: string;
  @IsOptional() @IsString() parent_id?: string | null;
  @IsIn(['internal', 'external']) target_type: 'internal' | 'external';
  @IsOptional() @IsString() @MaxLength(255) target_key?: string | null;
  @IsOptional() @IsString() @MaxLength(1000) external_url?: string | null;
  @IsOptional() @IsInt() @Min(0) sort_order?: number;
  @IsOptional() @IsBoolean() is_active?: boolean;
}

export class UpdateMenuItemDto {
  @IsOptional() @IsString() @MaxLength(100) menu_key?: string;
  @IsOptional() @IsString() parent_id?: string | null;
  @IsOptional() @IsIn(['internal', 'external']) target_type?: 'internal' | 'external';
  @IsOptional() @IsString() @MaxLength(255) target_key?: string | null;
  @IsOptional() @IsString() @MaxLength(1000) external_url?: string | null;
  @IsOptional() @IsInt() @Min(0) sort_order?: number;
  @IsOptional() @IsBoolean() is_active?: boolean;
}

export class MenuItemTranslationDto {
  @IsString() @Matches(/^[a-z]{2}(?:-[A-Z]{2})?$/) locale: string;
  @IsString() @MaxLength(255) label: string;
  @IsOptional() @IsString() @MaxLength(255) internal_slug?: string | null;
  @IsOptional() @IsString() @MaxLength(1000) external_url?: string | null;
  @IsOptional() @IsIn(['_self', '_blank']) target?: '_self' | '_blank';
  @IsOptional() @IsString() @MaxLength(255) rel?: string | null;
  @IsOptional() @IsBoolean() is_active?: boolean;
}
