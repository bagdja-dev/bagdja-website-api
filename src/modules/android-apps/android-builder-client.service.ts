import { BadGatewayException, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface AndroidBuilderJob {
  id: string;
  status: string;
  progress: number;
  stage: string | null;
  buildType?: 'release' | 'debug' | null;
  bundleId?: string | null;
  signingCertSha256?: string | null;
  tenantId: string;
  outputFormat?: 'aab' | 'apk' | null;
  artifactUrl: string | null;
  logUrl: string | null;
  errorMessage: string | null;
  updatedAt: string;
  createdAt?: string;
  startedAt?: string | null;
  finishedAt?: string | null;
  platformId: string;
  artifactUrlExpiresAt?: string | null;
}

interface BuilderCreateResponse {
  jobId?: string;
  status?: string;
  progress?: number;
  stage?: string;
  createdAt?: string;
}

@Injectable()
export class AndroidBuilderClientService {
  private readonly logger = new Logger(AndroidBuilderClientService.name);
  private readonly builderUrl: string;
  private readonly authUrl: string;
  private readonly clientAppId: string;
  private readonly clientAppSecret: string;
  private tokenCache: { token: string; expiresAt: number } | null = null;

  constructor(private readonly config: ConfigService) {
    this.builderUrl = (config.get<string>('TWA_BUILDER_URL') ?? '').replace(/\/$/, '');
    this.authUrl = (
      config.get<string>('BAGDJA_AUTH_API') ??
      config.get<string>('BAGDJA_AUTH_URL') ??
      'http://localhost:4001'
    ).replace(/\/$/, '');
    this.clientAppId = config.get<string>('CLIENT_APP_ID') ?? '';
    this.clientAppSecret = config.get<string>('CLIENT_APP_SECRET') ?? '';
  }

  async enqueue(input: {
    websiteId: string;
    idempotencyKey: string;
    payload: Record<string, unknown>;
  }): Promise<BuilderCreateResponse> {
    const response = await this.request('/build-jobs', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': input.idempotencyKey,
      },
      body: JSON.stringify({
        source: this.clientAppId,
        appId: this.clientAppId,
        tenantId: input.websiteId,
        platformId: input.websiteId,
        payload: input.payload,
      }),
    });
    const data = await this.parseJson<BuilderCreateResponse>(response, 'create-job');
    if (typeof data.jobId !== 'string' || !data.jobId) {
      this.logger.error('TWA Builder accepted a Website build request without returning a job ID');
      throw new BadGatewayException('TWA Builder returned an invalid create-job response');
    }
    return data;
  }

  async listJobs(websiteId: string): Promise<AndroidBuilderJob[]> {
    const query = new URLSearchParams({ platformId: websiteId, tenantId: websiteId });
    const response = await this.request(`/build-jobs?${query.toString()}`);
    const data = await this.parseJson<unknown>(response, 'build history');
    if (!Array.isArray(data) || !data.every((job) => this.isBuilderJob(job))) {
      this.logger.error('TWA Builder returned an invalid build history response');
      throw new BadGatewayException('TWA Builder returned an invalid build history response');
    }
    return data;
  }

  private async request(path: string, init: RequestInit = {}): Promise<Response> {
    if (!this.builderUrl) {
      throw new ServiceUnavailableException('TWA_BUILDER_URL is not configured');
    }
    let builderUrl: URL;
    try {
      builderUrl = new URL(this.builderUrl);
    } catch {
      throw new ServiceUnavailableException('TWA_BUILDER_URL is invalid');
    }
    if (
      !['http:', 'https:'].includes(builderUrl.protocol) ||
      builderUrl.username ||
      builderUrl.password ||
      (builderUrl.pathname !== '/' && builderUrl.pathname !== '') ||
      builderUrl.search ||
      builderUrl.hash
    ) {
      throw new ServiceUnavailableException('TWA_BUILDER_URL must be an HTTP(S) URL without credentials');
    }
    if (this.config.get<string>('NODE_ENV') === 'production' && builderUrl.protocol !== 'https:') {
      throw new ServiceUnavailableException('TWA_BUILDER_URL must use HTTPS in production');
    }
    if (!this.clientAppId || !this.clientAppSecret) {
      throw new ServiceUnavailableException('Website Builder client credentials are not configured');
    }

    const token = await this.getClientToken();
    try {
      const response = await fetch(`${this.builderUrl}${path}`, {
        ...init,
        headers: {
          ...(init.headers as Record<string, string> | undefined),
          'x-api-token': token,
        },
        signal: AbortSignal.timeout(15_000),
      });
      if (!response.ok) {
        this.logger.warn(`TWA Builder request failed with HTTP ${response.status}`);
        throw new BadGatewayException(`TWA Builder request failed with HTTP ${response.status}`);
      }
      return response;
    } catch (error) {
      if (error instanceof BadGatewayException) throw error;
      if (error instanceof Error && error.name === 'TimeoutError') {
        throw new BadGatewayException('TWA Builder request timed out');
      }
      this.logger.error(`TWA Builder is unreachable: ${error instanceof Error ? error.message : 'network error'}`);
      throw new BadGatewayException('TWA Builder service is unreachable');
    }
  }

  private async getClientToken(): Promise<string> {
    if (this.tokenCache && this.tokenCache.expiresAt > Date.now() + 60_000) {
      return this.tokenCache.token;
    }

    let response: Response;
    try {
      response = await fetch(`${this.authUrl}/auth/client`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          app_id: this.clientAppId,
          app_secret: this.clientAppSecret,
        }),
        signal: AbortSignal.timeout(15_000),
      });
    } catch (error) {
      this.logger.error(`Bagdja Auth is unreachable: ${error instanceof Error ? error.message : 'network error'}`);
      throw new BadGatewayException('Bagdja Auth service is unreachable');
    }

    if (!response.ok) {
      this.logger.warn(`Bagdja Auth rejected the Website client token request with HTTP ${response.status}`);
      throw new BadGatewayException('Website Builder could not authenticate with Bagdja Auth');
    }

    const data = await this.parseJson<{ 'x-api-token'?: string; expires_in?: number }>(
      response,
      'client-token',
    );
    if (typeof data['x-api-token'] !== 'string' || !data['x-api-token']) {
      this.logger.error('Bagdja Auth response did not contain a client token');
      throw new BadGatewayException('Bagdja Auth returned an invalid client token response');
    }

    const expiresIn = Number.isFinite(data.expires_in) && data.expires_in! > 0 ? data.expires_in! : 3600;
    this.tokenCache = {
      token: data['x-api-token'],
      expiresAt: Date.now() + expiresIn * 1000,
    };
    return this.tokenCache.token;
  }

  private async parseJson<T>(response: Response, label: string): Promise<T> {
    try {
      return await response.json() as T;
    } catch {
      this.logger.error(`Website integration received invalid JSON for ${label}`);
      throw new BadGatewayException('TWA Builder returned an invalid response');
    }
  }

  private isBuilderJob(value: unknown): value is AndroidBuilderJob {
    if (!value || typeof value !== 'object') return false;
    const job = value as Record<string, unknown>;
    return (
      typeof job.id === 'string' &&
      typeof job.status === 'string' &&
      typeof job.progress === 'number' &&
      (typeof job.stage === 'string' || job.stage === null) &&
      typeof job.platformId === 'string' &&
      typeof job.tenantId === 'string' &&
      typeof job.updatedAt === 'string' &&
      this.isNullableHttpsUrl(job.artifactUrl) &&
      this.isNullableHttpsUrl(job.logUrl) &&
      (job.artifactUrlExpiresAt === undefined ||
        job.artifactUrlExpiresAt === null ||
        typeof job.artifactUrlExpiresAt === 'string') &&
      (job.signingCertSha256 === undefined ||
        job.signingCertSha256 === null ||
        typeof job.signingCertSha256 === 'string') &&
      (job.buildType === undefined ||
        job.buildType === null ||
        job.buildType === 'release' ||
        job.buildType === 'debug') &&
      (job.outputFormat === undefined ||
        job.outputFormat === null ||
        job.outputFormat === 'apk' ||
        job.outputFormat === 'aab') &&
      (job.bundleId === undefined || job.bundleId === null || typeof job.bundleId === 'string') &&
      (job.errorMessage === null || typeof job.errorMessage === 'string')
    );
  }

  private isNullableHttpsUrl(value: unknown): value is string | null {
    if (value === null) return true;
    if (typeof value !== 'string') return false;
    try {
      const url = new URL(value);
      return url.protocol === 'https:' && !url.username && !url.password;
    } catch {
      return false;
    }
  }
}
