import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { MODULE_KEYS, type ModuleKey } from '../../websites/business-profile.registry';
import type { SectionCategory, SectionDataSource, SectionFieldType } from '../section-schema.registry';

const FIELD_TYPES: SectionFieldType[] = [
  'text', 'textarea', 'richtext', 'number', 'url', 'phone', 'email', 'select', 'iconPicker', 'faqCategoryPicker', 'switch', 'image', 'gallery', 'list',
  'productPicker', 'postPicker', 'flowPicker',
];
const CATEGORIES: SectionCategory[] = ['opening', 'story', 'sell', 'info', 'blog'];
const DATA_SOURCES: SectionDataSource[] = ['products', 'categories', 'locations', 'faqs', 'blog', 'flow'];

export class SectionFieldOptionDto {
  @ApiProperty({ example: 'left' })
  value: string;

  @ApiProperty({ example: 'Kiri' })
  label: string;
}

export class SectionFieldShowWhenDto {
  @ApiProperty({ example: 'button_action', description: 'Kunci field lain (level yang sama) yang dijadikan syarat.' })
  field: string;

  @ApiProperty({
    oneOf: [{ type: 'string' }, { type: 'array', items: { type: 'string' } }],
    example: 'whatsapp',
    description: 'Field tampil bila nilai `field` sama dengan nilai ini (atau salah satu bila array).',
  })
  equals: string | string[];
}

export class SectionFieldDefDto {
  @ApiProperty({ example: 'title', description: 'Kunci di `content` section.' })
  key: string;

  @ApiProperty({ example: 'Judul', description: 'Label bahasa awam (Indonesia).' })
  label: string;

  @ApiProperty({
    enum: FIELD_TYPES,
    example: 'text',
    description: '`phone`: nomor telepon Indonesia tanpa "+" (Studio memberi awalan +62). `email`: alamat email.',
  })
  type: SectionFieldType;

  @ApiPropertyOptional({ example: 'Kosongkan untuk memakai nama usaha.' })
  description?: string;

  @ApiPropertyOptional({ example: 'Premium Barbershop' })
  placeholder?: string;

  @ApiPropertyOptional({ example: false })
  required?: boolean;

  @ApiPropertyOptional({ description: 'Nilai awal field (tipe mengikuti `type`).', example: 'Layanan Kami' })
  default?: unknown;

  @ApiPropertyOptional({ type: [SectionFieldOptionDto], description: 'Pilihan untuk `select`.' })
  options?: SectionFieldOptionDto[];

  @ApiPropertyOptional({
    type: () => [SectionFieldDefDto],
    description: 'Field tiap item untuk `list` dan `gallery` (tanpa list bersarang).',
  })
  itemFields?: SectionFieldDefDto[];

  @ApiPropertyOptional({ example: 0 })
  minItems?: number;

  @ApiPropertyOptional({ example: 3 })
  maxItems?: number;

  @ApiPropertyOptional({ example: true, description: 'Nilai berupa array (picker atau select multi).' })
  multiple?: boolean;

  @ApiPropertyOptional({
    type: SectionFieldShowWhenDto,
    description: 'Tampilkan field hanya bila syarat terpenuhi. Hanya memengaruhi form; nilai yang disembunyikan tetap disimpan.',
  })
  showWhen?: SectionFieldShowWhenDto;

  @ApiPropertyOptional({ enum: ['segmented'], example: 'segmented', description: '`select` satu pilihan ditampilkan sebagai chip/segmen, bukan dropdown.' })
  display?: 'segmented';
}

export class SectionSchemaDto {
  @ApiProperty({ example: 'services_grid' })
  type: string;

  @ApiProperty({ example: 1, description: 'Naik bila bentuk `content` berubah.' })
  schemaVersion: number;

  @ApiProperty({ example: 'Daftar Layanan' })
  label: string;

  @ApiProperty({ example: 'Menampilkan layanan dari menu Produk & Layanan secara otomatis.' })
  description: string;

  @ApiProperty({ enum: CATEGORIES, example: 'sell' })
  category: SectionCategory;

  @ApiProperty({ example: 'services', description: 'Kunci ikon; dipetakan di admin.' })
  icon: string;

  @ApiPropertyOptional({ enum: MODULE_KEYS, example: 'catalog', description: 'Section hanya ditawarkan bila modul ini aktif.' })
  requiredModule?: ModuleKey;

  @ApiPropertyOptional({ enum: DATA_SOURCES, example: 'products', description: 'Section "Otomatis": isi diambil dari data website.' })
  dataSource?: SectionDataSource;

  @ApiPropertyOptional({ example: true, description: 'Maksimal satu per halaman (hero).' })
  singleton?: boolean;

  @ApiPropertyOptional({ enum: ['top'], example: 'top', description: 'Selalu dirender paling atas (hero).' })
  pinned?: 'top';

  @ApiProperty({ type: [SectionFieldDefDto] })
  fields: SectionFieldDefDto[];

  @ApiProperty({
    type: 'object',
    additionalProperties: true,
    example: { title: 'Layanan Kami', filter_type: 'service' },
    description: '`content` awal saat section ditambahkan. Semua kunci ada di `fields`.',
  })
  defaults: Record<string, unknown>;
}

export class SectionSchemasResponseDto {
  @ApiProperty({ example: 1, description: 'Versi katalog section.' })
  catalogVersion: number;

  @ApiProperty({ type: [SectionSchemaDto] })
  sections: SectionSchemaDto[];
}
