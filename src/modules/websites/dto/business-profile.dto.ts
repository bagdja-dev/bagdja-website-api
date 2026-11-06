import { ApiProperty } from '@nestjs/swagger';

import {
  MODULE_KEYS,
  SELECTABLE_BUSINESS_PROFILE_IDS,
  type AvailabilityStatus,
  type BusinessProfileId,
  type ModuleKey,
} from '../business-profile.registry';

const AVAILABILITY_STATUSES: AvailabilityStatus[] = ['available', 'coming_soon'];

export class BusinessProfileItemDto {
  @ApiProperty({ enum: SELECTABLE_BUSINESS_PROFILE_IDS, example: 'service_business', description: 'ID profile (tanpa `legacy`).' })
  id: BusinessProfileId;

  @ApiProperty({ example: 'Jasa', description: 'Label kartu di wizard onboarding.' })
  label: string;

  @ApiProperty({ example: 'Barbershop, salon, klinik, bengkel, laundry', description: 'Contoh usaha yang ditampilkan di kartu.' })
  examples: string;

  @ApiProperty({ example: 'scissors', description: 'Kunci ikon; dipetakan ke komponen ikon di admin.' })
  icon: string;

  @ApiProperty({
    enum: AVAILABILITY_STATUSES,
    example: 'available',
    description: '`coming_soon` = kartu "Segera hadir" + tombol "Kabari saya"; belum bisa dipilih untuk membuat website.',
  })
  status: AvailabilityStatus;

  @ApiProperty({
    enum: MODULE_KEYS,
    isArray: true,
    example: ['site_content', 'team', 'subscription', 'wallet', 'settings', 'catalog', 'orders', 'fulfillment', 'locations', 'customer_chat', 'faq', 'appointments'],
    description:
      'Preset modul yang sudah di-resolve (dependensi + inti). Modul `coming_soon` tetap dicantumkan agar wizard bisa menampilkannya sebagai "segera hadir"; saat website dibuat, modul `coming_soon` tidak ikut aktif.',
  })
  defaultModules: ModuleKey[];

  @ApiProperty({ example: 1, description: 'Urutan tampil di wizard (naik).' })
  sortOrder: number;
}

export class ModuleDefinitionDto {
  @ApiProperty({ enum: MODULE_KEYS, example: 'orders' })
  key: ModuleKey;

  @ApiProperty({ example: 'Pesanan', description: 'Nama menu.' })
  label: string;

  @ApiProperty({ example: 'Terima pesanan dan pembayaran dari pembeli.' })
  description: string;

  @ApiProperty({ example: false, description: 'Modul inti selalu aktif dan tidak bisa dimatikan.' })
  core: boolean;

  @ApiProperty({ enum: MODULE_KEYS, isArray: true, example: ['catalog'], description: 'Modul yang ikut aktif bila modul ini diaktifkan.' })
  dependsOn: ModuleKey[];

  @ApiProperty({ enum: AVAILABILITY_STATUSES, example: 'available' })
  status: AvailabilityStatus;

  @ApiProperty({ example: false, description: 'Hanya tampil untuk owner (`wallet`, `subscription`).' })
  ownerOnly: boolean;
}

export class BusinessProfilesResponseDto {
  @ApiProperty({ type: [BusinessProfileItemDto], description: '9 business profile, urut `sortOrder`. `legacy` tidak disertakan.' })
  profiles: BusinessProfileItemDto[];

  @ApiProperty({ type: [ModuleDefinitionDto], description: 'Registry modul lengkap, urut tampil di halaman Fitur.' })
  modules: ModuleDefinitionDto[];
}

export class BusinessProfileWaitlistResponseDto {
  @ApiProperty({ example: true, description: 'Selalu `true`; endpoint idempoten (daftar dua kali tidak membuat baris ganda).' })
  registered: boolean;
}
