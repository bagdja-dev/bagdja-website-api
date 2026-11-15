import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

/** Batas video produk (unggah langsung browser → website-api → storage-service, tidak lewat Vercel). */
export const VIDEO_UPLOAD_MAX_BYTES = 15 * 1024 * 1024;
export const VIDEO_UPLOAD_MIME_TYPES = ['video/mp4', 'video/webm', 'video/quicktime'] as const;

export class CreateVideoUploadTicketDto {
  @ApiProperty({ format: 'uuid', description: 'Website pemilik video; peminta harus staf aktif website ini.' })
  @IsUUID()
  website_id: string;
}

export class VideoUploadTicketResponseDto {
  @ApiProperty({
    example: 'eyJ3IjoiLi4uIiwidSI6Ii4uLiIsImUiOjE3NjMyMDAwMDB9.3q2-…',
    description: 'Tiket bertanda tangan (10 menit, satu website). Kirim sebagai header `X-Upload-Ticket`.',
  })
  ticket: string;

  @ApiProperty({ example: '2026-11-15T12:10:00.000Z' })
  expires_at: string;

  @ApiProperty({ example: VIDEO_UPLOAD_MAX_BYTES, description: 'Ukuran maksimal file (byte).' })
  max_bytes: number;

  @ApiProperty({ type: [String], example: VIDEO_UPLOAD_MIME_TYPES })
  mime_types: string[];
}

export class VideoUploadResultDto {
  @ApiProperty({ example: 'https://cdn.bagdja.com/org/app/uuid-demo.mp4', description: 'URL publik video (simpan di video_urls produk).' })
  url: string;

  @ApiProperty({ example: 'org/app/uuid-demo.mp4' })
  path: string;
}
