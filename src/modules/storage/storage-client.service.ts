import { BadGatewayException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BagdjaLogger } from '@bagdja/node-sdk';

interface StorageFileResponse {
  id: string;
  org_id: string;
  app_id: string;
  bucket: string;
  key: string;
  kind: string | null;
  is_public: boolean;
  mime_type: string;
  size_bytes: number;
  public_url: string | null;
  created_at: string | null;
}

/**
 * Client proxy ke bagdja-storage-service — upload file, dipakai
 * `UploadsService` sebagai pengganti `SupabaseStorageService` (lihat
 * plan/storage-services/overview.md §9 Fase 3: file lama tetap diserve dari
 * Supabase, upload baru lewat sini). Pola client-credential + token cache
 * SAMA dengan `ShippingClientService`/`EscrowClientService` — reuse
 * `CLIENT_APP_ID`/`CLIENT_APP_SECRET`/`BAGDJA_AUTH_API` yang sudah
 * teregistrasi untuk `website-builder`, tidak perlu identitas client-app
 * baru untuk storage.
 */
@Injectable()
export class StorageClientService {
  private readonly apiUrl: string;
  private readonly authApiUrl: string;
  private readonly clientAppId: string;
  private readonly clientAppSecret: string;
  private tokenCache: { token: string; expiresAt: number } | null = null;

  constructor(
    private readonly config: ConfigService,
    private readonly logger: BagdjaLogger,
  ) {
    const appId = this.config.get<string>('CLIENT_APP_ID') || 'bagdja-website';
    this.logger.init(appId, 'system');

    this.apiUrl = (
      this.config.get<string>('BAGDJA_STORAGE_API') || 'http://localhost:4008'
    ).replace(/\/$/, '');
    this.authApiUrl = (
      this.config.get<string>('BAGDJA_AUTH_API') || 'http://localhost:4001'
    ).replace(/\/$/, '');
    this.clientAppId = this.config.get<string>('CLIENT_APP_ID') || '';
    this.clientAppSecret = this.config.get<string>('CLIENT_APP_SECRET') || '';
  }

  private async getAuthToken(): Promise<string> {
    const now = Date.now();
    if (this.tokenCache && this.tokenCache.expiresAt > now + 60_000) {
      return this.tokenCache.token;
    }

    if (!this.clientAppId || !this.clientAppSecret) {
      throw new Error('CLIENT_APP_ID or CLIENT_APP_SECRET is not configured');
    }

    const response = await fetch(`${this.authApiUrl}/auth/client`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        app_id: this.clientAppId,
        app_secret: this.clientAppSecret,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `Failed to get auth token: ${response.status} ${errorText}`,
      );
    }

    const data = (await response.json()) as {
      'x-api-token': string;
      expires_in?: number;
    };
    const token = data['x-api-token'];
    const expiresIn = data.expires_in || 3600;

    this.tokenCache = { token, expiresAt: now + expiresIn * 1000 };
    return token;
  }

  private async parseErrorMessage(response: Response): Promise<string> {
    const rawText = await response.text();
    try {
      return JSON.parse(rawText).message || rawText;
    } catch {
      return rawText;
    }
  }

  /**
   * Upload satu file ke bagdja-storage-service. `kind` dipetakan dari
   * `folder`/tujuan upload lama (`'logo'`, `'assets'`, `'products'`,
   * `'blog'`, `'sections'`, ...) — cuma label informasional di sisi
   * storage-service, tidak mempengaruhi lokasi fisik file.
   */
  async uploadFile(
    buffer: Buffer,
    mimetype: string,
    filename: string,
    kind: string,
  ): Promise<{ url: string; path: string }> {
    let token: string;
    try {
      token = await this.getAuthToken();
    } catch (error: any) {
      this.logger.bagdjaLog(
        'error',
        'Failed to obtain client token (upload-file)',
        {
          data: { message: error?.message },
          tags: ['storage-client', 'upload-file', 'auth-token'],
        },
      );
      throw new BadGatewayException(
        error?.message || 'Failed to authenticate with auth service',
      );
    }

    const form = new FormData();
    form.append('file', new Blob([buffer as unknown as ArrayBuffer], { type: mimetype }), filename);
    form.append('is_public', 'true');
    form.append('kind', kind);

    let response: Response;
    try {
      response = await fetch(`${this.apiUrl}/files`, {
        method: 'POST',
        headers: { 'x-api-token': token },
        body: form,
      });
    } catch (error: any) {
      this.logger.bagdjaLog('error', 'Storage API unreachable (upload-file)', {
        data: { message: error?.message },
        tags: ['storage-client', 'upload-file', 'network'],
      });
      throw new BadGatewayException('Storage service is unreachable');
    }

    if (!response.ok) {
      const message = await this.parseErrorMessage(response);
      this.logger.bagdjaLog('error', 'Storage API error (upload-file)', {
        data: { filename, kind, status: response.status, message },
        tags: ['storage-client', 'upload-file'],
      });
      throw new BadGatewayException(message || 'Failed to upload file');
    }

    const data = (await response.json()) as StorageFileResponse;
    if (!data.public_url) {
      throw new BadGatewayException('Storage service did not return a public URL');
    }
    return { url: data.public_url, path: data.key };
  }
}
