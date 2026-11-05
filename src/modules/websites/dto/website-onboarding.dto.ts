import { ApiProperty } from '@nestjs/swagger';

/**
 * `GET /api/websites/:websiteId/onboarding-status` — sinyal checklist
 * "Siapkan website kamu" di Studio Beranda (template-contract.md §1.3).
 * Semua flag dihitung server; client hanya menyaring langkah per modul aktif.
 */
export class WebsiteOnboardingStatusDto {
  @ApiProperty({ example: true, description: '`websites.logo_url` terisi (bukan string kosong).' })
  hasLogo: boolean;

  @ApiProperty({
    example: false,
    description:
      'Halaman depan sudah disesuaikan: ada section di halaman Home (`is_home` atau slug `home`) yang dibuat user atau section contoh template yang `type`/`content`-nya sudah diubah (`website_sections.is_seed = false`). Hanya mengubah urutan atau menghapus section tidak dihitung.',
  })
  homeEdited: boolean;

  @ApiProperty({
    example: false,
    description: 'Ada minimal satu produk/layanan milik sendiri (`metadata.is_seed` bukan `true`), termasuk varian dan produk gathering.',
  })
  hasOwnProduct: boolean;

  @ApiProperty({
    example: 6,
    minimum: 0,
    description: 'Jumlah produk/layanan contoh dari template (`metadata.is_seed = true`) yang masih ada.',
  })
  seedProductCount: number;

  @ApiProperty({
    example: false,
    description: 'Lokasi utama (`is_primary`) punya `address_line` dan `city` yang tidak kosong.',
  })
  primaryLocationComplete: boolean;

  @ApiProperty({ example: false, description: 'Ada minimal satu alur pengerjaan (`fulfillment_flows`).' })
  hasFlow: boolean;

  @ApiProperty({ example: false, description: 'Ada minimal satu produk bertipe `gathering` (acara).' })
  hasGathering: boolean;

  @ApiProperty({
    example: 1,
    minimum: 1,
    description: 'Jumlah anggota tim aktif (`tenant_staff.is_active`), termasuk owner. Langkah "Undang tim" selesai bila > 1.',
  })
  teamCount: number;

  @ApiProperty({
    type: String,
    format: 'date-time',
    nullable: true,
    example: null,
    description: 'Pertama kali link website disalin dari Beranda (ISO 8601); `null` = belum pernah.',
  })
  linkSharedAt: string | null;
}

/** `POST /api/websites/:websiteId/onboarding-status/link-shared`. */
export class WebsiteOnboardingLinkSharedResponseDto {
  @ApiProperty({
    type: String,
    format: 'date-time',
    example: '2026-11-05T08:15:30.000Z',
    description: 'Waktu link pertama kali ditandai dibagikan. Panggilan berikutnya mengembalikan nilai yang sama (idempotent).',
  })
  linkSharedAt: string;
}
