import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { TenantStaff } from '../../entities';
import type { AuthUser } from '../../common/auth';
import { StorageClientService } from '../storage/storage-client.service';
import { VIDEO_UPLOAD_MAX_BYTES, VIDEO_UPLOAD_MIME_TYPES } from './dto/video-upload.dto';
import { createUploadTicket, uploadTicketSecret, verifyUploadTicket } from './upload-ticket';

@Injectable()
export class UploadsService {
  constructor(
    private readonly storage: StorageClientService,
    @InjectRepository(TenantStaff)
    private readonly staffRepo: Repository<TenantStaff>,
    private readonly config: ConfigService,
  ) {}

  /** Tiket unggah video untuk staf website (lihat upload-ticket.ts). */
  async createVideoUploadTicket(user: AuthUser, websiteId: string) {
    await this.ensureStaff(user, websiteId);
    const { ticket, expiresAt } = createUploadTicket({ w: websiteId, u: user.userId }, this.ticketSecret());
    return {
      ticket,
      expires_at: expiresAt.toISOString(),
      max_bytes: VIDEO_UPLOAD_MAX_BYTES,
      mime_types: [...VIDEO_UPLOAD_MIME_TYPES],
    };
  }

  /** Video produk lewat tiket → storage-service (`POST /files`, sama seperti foto). */
  async uploadVideoWithTicket(ticket: string | undefined, file: Express.Multer.File | undefined) {
    const claims = verifyUploadTicket(ticket, this.ticketSecret());
    if (!claims) throw new UnauthorizedException('Tiket unggah tidak valid atau sudah kedaluwarsa. Coba unggah ulang.');
    if (!file) throw new BadRequestException('File video wajib diunggah');
    if (!(VIDEO_UPLOAD_MIME_TYPES as readonly string[]).includes(file.mimetype)) {
      throw new BadRequestException('Video harus MP4, WebM, atau MOV.');
    }
    if (file.size > VIDEO_UPLOAD_MAX_BYTES) throw new BadRequestException('Ukuran video maksimal 15 MB.');
    // Akses dicek ulang saat unggah (staf bisa dinonaktifkan setelah tiket dibuat).
    await this.ensureStaff({ userId: claims.u } as AuthUser, claims.w);
    const uploaded = await this.storage.uploadFile(file.buffer, file.mimetype, file.originalname, 'product_video');
    if (!uploaded.url) throw new ServiceUnavailableException('Storage tidak mengembalikan URL publik video.');
    return { url: uploaded.url, path: uploaded.path };
  }

  private ticketSecret(): string {
    const secret = uploadTicketSecret({
      UPLOAD_TICKET_SECRET: this.config.get<string>('UPLOAD_TICKET_SECRET'),
      CLIENT_APP_SECRET: this.config.get<string>('CLIENT_APP_SECRET'),
    });
    if (!secret) throw new ServiceUnavailableException('Unggah video belum dikonfigurasi (secret tiket).');
    return secret;
  }

  private async ensureStaff(user: Pick<AuthUser, 'userId'>, websiteId: string): Promise<void> {
    const staff = await this.staffRepo.findOne({
      where: { website_id: websiteId, user_id: user.userId, is_active: true },
    });
    if (!staff) throw new ForbiddenException('You do not have access to this website');
  }

  async uploadLogo(
    user: AuthUser,
    file: Express.Multer.File,
    websiteId?: string,
  ): Promise<{ url: string; path: string }> {
    if (websiteId) {
      const staff = await this.staffRepo.findOne({
        where: {
          website_id: websiteId,
          user_id: user.userId,
          is_active: true,
        },
      });
      if (!staff) {
        throw new ForbiddenException('You do not have access to this website');
      }
    }

    return this.storage.uploadFile(file.buffer, file.mimetype, file.originalname, 'logo');
  }

  async uploadAsset(
    user: AuthUser,
    file: Express.Multer.File,
    websiteId?: string,
    folder?: string,
  ): Promise<{ url: string; path: string }> {
    if (websiteId) {
      const staff = await this.staffRepo.findOne({
        where: {
          website_id: websiteId,
          user_id: user.userId,
          is_active: true,
        },
      });
      if (!staff) {
        throw new ForbiddenException('You do not have access to this website');
      }
    }

    return this.storage.uploadFile(
      file.buffer,
      file.mimetype,
      file.originalname,
      folder ?? 'assets',
    );
  }
}
