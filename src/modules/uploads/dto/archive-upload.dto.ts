import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export const ARCHIVE_UPLOAD_MAX_BYTES = 50 * 1024 * 1024;
export const ARCHIVE_UPLOAD_MIME_TYPES = ['application/zip', 'application/x-zip-compressed', 'application/octet-stream'] as const;

export class CreateArchiveUploadTicketDto {
  @ApiProperty({ format: 'uuid', description: 'Website pemilik arsip; peminta harus staf aktif website ini.' })
  @IsUUID()
  website_id: string;
}

export class ArchiveUploadTicketResponseDto {
  @ApiProperty({ example: 'eyJ3IjoiLi4uIiwidSI6Ii4uLiIsImUiOjE3NjMyMDAwMDB9.3q2-…' })
  ticket: string;

  @ApiProperty({ example: '2026-11-15T12:10:00.000Z' })
  expires_at: string;

  @ApiProperty({ example: ARCHIVE_UPLOAD_MAX_BYTES })
  max_bytes: number;

  @ApiProperty({ type: [String], example: ARCHIVE_UPLOAD_MIME_TYPES })
  mime_types: string[];
}

export class ArchiveUploadResultDto {
  @ApiProperty({ example: 'https://cdn.bagdja.com/org/app/company-documents.zip' })
  url: string;

  @ApiProperty({ example: 'org/app/company-documents.zip' })
  path: string;
}
