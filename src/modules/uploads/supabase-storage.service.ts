import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

const ALLOWED_MIME = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/svg+xml',
]);

const MAX_LOGO_BYTES = 5 * 1024 * 1024;

/** Ambil project ref dari connection string Supabase Postgres pooler/direct. */
function deriveSupabaseUrl(databaseUrl: string | undefined): string | null {
  if (!databaseUrl) return null;
  const poolerMatch = databaseUrl.match(/postgres(?:ql)?:\/\/postgres\.([a-z0-9]+):/i);
  if (poolerMatch) return `https://${poolerMatch[1]}.supabase.co`;
  const directMatch = databaseUrl.match(/@db\.([a-z0-9]+)\.supabase\.co/i);
  if (directMatch) return `https://${directMatch[1]}.supabase.co`;
  return null;
}

@Injectable()
export class SupabaseStorageService {
  private readonly logger = new Logger(SupabaseStorageService.name);
  private readonly client: SupabaseClient | null;
  private readonly bucket: string;

  constructor(private readonly config: ConfigService) {
    const key = this.config.get<string>('SUPABASE_SERVICE_ROLE_KEY');
    const url =
      this.config.get<string>('SUPABASE_URL') ??
      deriveSupabaseUrl(this.config.get<string>('DATABASE_URL'));
    this.bucket = this.config.get<string>('SUPABASE_STORAGE_BUCKET', 'website-assets');

    if (url && key) {
      this.client = createClient(url, key, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
    } else {
      this.client = null;
      this.logger.warn(
        'Supabase Storage disabled — set SUPABASE_URL (or DATABASE_URL with Supabase ref) and SUPABASE_SERVICE_ROLE_KEY',
      );
    }
  }

  isConfigured(): boolean {
    return this.client !== null;
  }

  assertConfigured(): void {
    if (!this.client) {
      throw new BadRequestException(
        'Penyimpanan file belum dikonfigurasi. Hubungi administrator (SUPABASE_URL / SERVICE_ROLE_KEY).',
      );
    }
  }

  validateLogoFile(mimetype: string, size: number): void {
    if (!ALLOWED_MIME.has(mimetype)) {
      throw new BadRequestException('Format logo harus JPEG, PNG, WebP, GIF, atau SVG');
    }
    if (size > MAX_LOGO_BYTES) {
      throw new BadRequestException('Ukuran logo maksimal 5 MB');
    }
  }

  extensionForMime(mimetype: string): string {
    const map: Record<string, string> = {
      'image/jpeg': 'jpg',
      'image/png': 'png',
      'image/webp': 'webp',
      'image/gif': 'gif',
      'image/svg+xml': 'svg',
    };
    return map[mimetype] ?? 'bin';
  }

  async uploadLogo(
    buffer: Buffer,
    mimetype: string,
    userId: string,
    websiteId?: string,
  ): Promise<{ url: string; path: string }> {
    return this.uploadImage(buffer, mimetype, userId, websiteId, 'logo');
  }

  async uploadAsset(
    buffer: Buffer,
    mimetype: string,
    userId: string,
    websiteId?: string,
    folder = 'assets',
  ): Promise<{ url: string; path: string }> {
    return this.uploadImage(buffer, mimetype, userId, websiteId, folder);
  }

  private async uploadImage(
    buffer: Buffer,
    mimetype: string,
    userId: string,
    websiteId: string | undefined,
    folder: string,
  ): Promise<{ url: string; path: string }> {
    this.assertConfigured();
    this.validateLogoFile(mimetype, buffer.length);

    const ext = this.extensionForMime(mimetype);
    const stamp = Date.now();
    const path = websiteId
      ? `websites/${websiteId}/${folder}/${stamp}.${ext}`
      : `drafts/${userId}/${folder}/${stamp}.${ext}`;

    const { error } = await this.client!.storage.from(this.bucket).upload(path, buffer, {
      contentType: mimetype,
      upsert: false,
      cacheControl: '3600',
    });

    if (error) {
      this.logger.error(`Upload failed: ${error.message}`);
      throw new BadRequestException(`Gagal mengunggah file: ${error.message}`);
    }

    const { data } = this.client!.storage.from(this.bucket).getPublicUrl(path);
    return { url: data.publicUrl, path };
  }
}
