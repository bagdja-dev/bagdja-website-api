import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { ANDROID_DISPLAY_MODES, type AndroidDisplayMode } from '../../../entities/website-android-app.entity';

export class AndroidAppConfigurationResponseDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ format: 'uuid' })
  website_id: string;

  @ApiProperty({ example: 'Toko Saya', maxLength: 50 })
  app_name: string;

  @ApiProperty({ example: 'com.example.shop' })
  package_name: string;

  @ApiProperty({ example: '1.0.0' })
  version_name: string;

  @ApiProperty({ example: 1 })
  version_code: number;

  @ApiProperty({ example: false, description: 'true setelah build release pertama berhasil; package name tidak bisa diubah lagi.' })
  package_name_locked: boolean;

  @ApiProperty({ example: true })
  has_release_keystore: boolean;

  @ApiProperty({ nullable: true, example: 'release' })
  keystore_alias: string | null;

  @ApiProperty({ nullable: true, example: 'https://storage.example.com/app-icon.png' })
  icon_url: string | null;

  @ApiProperty({ nullable: true, example: 'https://storage.example.com/splash.png' })
  splash_image_url: string | null;

  @ApiProperty({ example: '#7C3AED', description: 'Warna status bar (atas).' })
  primary_color: string;

  @ApiProperty({ example: '#0F172A', description: 'Warna latar splash screen.' })
  splash_color: string;

  @ApiProperty({ nullable: true, example: null, description: 'Warna navigation bar (bawah); null = mengikuti splash_color.' })
  navigation_bar_color: string | null;

  @ApiProperty({ nullable: true, example: null, description: 'Warna garis pemisah di atas navigation bar; null = tanpa garis.' })
  navigation_bar_divider_color: string | null;

  @ApiProperty({ enum: ANDROID_DISPLAY_MODES, example: 'standalone' })
  display_mode: AndroidDisplayMode;

  @ApiProperty({ type: [String], description: 'Fingerprint SHA-256 sertifikat release aktif (Digital Asset Links).' })
  release_signing_cert_sha256: string[];

  @ApiProperty({ type: [String], description: 'Fingerprint SHA-256 Google Play App Signing.' })
  play_store_signing_cert_sha256: string[];

  @ApiProperty({ type: [String], description: 'Fingerprint yang sudah dipensiunkan.' })
  retired_signing_cert_sha256: string[];

  @ApiPropertyOptional({ example: 'https://toko.sites.bagdja.com', description: 'URL website yang dibuka TWA; hanya pada GET.' })
  target_url?: string;

  @ApiProperty()
  created_at: Date;

  @ApiProperty()
  updated_at: Date;
}
