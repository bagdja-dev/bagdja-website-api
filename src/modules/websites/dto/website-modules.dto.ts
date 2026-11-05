import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ArrayUnique, IsArray, IsBoolean, IsIn, IsOptional } from 'class-validator';

import {
  BUSINESS_PROFILE_IDS,
  MODULE_KEYS,
  SELECTABLE_BUSINESS_PROFILE_IDS,
  type AvailabilityStatus,
  type BusinessProfileId,
  type ModuleKey,
} from '../business-profile.registry';

const AVAILABILITY_STATUSES: AvailabilityStatus[] = ['available', 'coming_soon'];

export class WebsiteModuleStateDto {
  @ApiProperty({ enum: MODULE_KEYS, example: 'orders' })
  key: ModuleKey;

  @ApiProperty({ example: true, description: 'Aktif di website ini (himpunan efektif).' })
  enabled: boolean;

  @ApiProperty({ example: false })
  core: boolean;

  @ApiProperty({ enum: AVAILABILITY_STATUSES, example: 'available' })
  status: AvailabilityStatus;

  @ApiProperty({ enum: MODULE_KEYS, isArray: true, example: ['catalog'] })
  dependsOn: ModuleKey[];

  @ApiProperty({
    type: String,
    nullable: true,
    example: 'Masih ada 2 transaksi berjalan (menunggu pembayaran, dana ditahan, atau sengketa).',
    description: 'Alasan modul aktif ini tidak bisa dimatikan sekarang; `null` bila bisa dimatikan atau modul tidak aktif.',
  })
  blockedReason: string | null;
}

export class WebsiteModulesResponseDto {
  @ApiProperty({ enum: BUSINESS_PROFILE_IDS, example: 'online_store' })
  businessProfile: BusinessProfileId;

  @ApiProperty({
    enum: MODULE_KEYS,
    isArray: true,
    example: ['site_content', 'team', 'subscription', 'wallet', 'settings', 'catalog', 'orders', 'locations', 'customer_chat', 'faq'],
    description: 'Modul efektif. Untuk `legacy` dengan snapshot kosong = semua modul `available`.',
  })
  enabledModules: ModuleKey[];

  @ApiProperty({ type: [WebsiteModuleStateDto], description: 'Status setiap modul di registry, urut tampil di halaman Fitur.' })
  modules: WebsiteModuleStateDto[];
}

export class UpdateWebsiteModulesDto {
  @ApiPropertyOptional({
    enum: MODULE_KEYS,
    isArray: true,
    example: ['quotes'],
    description: 'Modul yang diaktifkan. Dependensi ikut aktif otomatis. Modul `coming_soon` ditolak (400).',
  })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsIn([...MODULE_KEYS], { each: true })
  enable?: ModuleKey[];

  @ApiPropertyOptional({
    enum: MODULE_KEYS,
    isArray: true,
    example: ['blog'],
    description:
      'Modul yang dinonaktifkan. Ditolak (409) bila modul inti, masih dipakai modul aktif lain, atau masih ada data berjalan (transaksi untuk `orders`, gathering untuk `events`). Data tidak dihapus.',
  })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsIn([...MODULE_KEYS], { each: true })
  disable?: ModuleKey[];
}

export class UpdateWebsiteBusinessProfileDto {
  @ApiProperty({ enum: SELECTABLE_BUSINESS_PROFILE_IDS, example: 'project_quotation', description: 'Profile baru (bukan `legacy`, harus `available`).' })
  @IsIn([...SELECTABLE_BUSINESS_PROFILE_IDS])
  businessProfile: BusinessProfileId;

  @ApiProperty({
    example: true,
    description:
      '`true` = aktifkan modul preset profile baru (ditambahkan ke modul yang sudah aktif; tidak ada modul yang dimatikan). `false` = hanya ganti profile.',
  })
  @IsBoolean()
  applyPreset: boolean;
}
