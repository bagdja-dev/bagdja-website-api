import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsIn, IsObject, IsString, MaxLength, ValidateNested } from 'class-validator';

/** Jenis blok yang bisa disusun di komponen footer global. */
export const FOOTER_BLOCK_TYPES = ['brand', 'page_links', 'contact', 'social_links', 'text', 'copyright'] as const;

export class FooterBlockDto {
  @ApiProperty({ example: 'b1f0c2', description: 'ID unik blok (dibuat di client), dipakai untuk urutan & key render.' })
  @IsString()
  @MaxLength(64)
  id: string;

  @ApiProperty({ enum: FOOTER_BLOCK_TYPES, example: 'contact' })
  @IsIn([...FOOTER_BLOCK_TYPES])
  type: string;

  @ApiProperty({
    type: 'object',
    additionalProperties: true,
    example: { title: 'Kontak', show_address: true, show_whatsapp: true, show_phone: false, show_email: true },
    description: 'Setting blok; field tergantung `type`. Divalidasi ulang oleh renderer.',
  })
  @IsObject()
  content: Record<string, unknown>;
}

export class WebsiteFooterSettingsDto {
  @ApiProperty({
    type: [FooterBlockDto],
    description: 'Blok footer sesuai urutan tampil. Kosong = footer tidak dirender.',
  })
  @IsArray()
  @ArrayMaxSize(12)
  @ValidateNested({ each: true })
  @Type(() => FooterBlockDto)
  blocks: FooterBlockDto[];
}
