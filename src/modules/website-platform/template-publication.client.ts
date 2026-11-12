import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * Client HTTP ke publisher & runtime template
 * (bagdja-website-template-runtime: src/publisher.mjs, src/server.mjs).
 * Website API tidak pernah mengunduh atau membuka package npm sendiri.
 */

export const CANDIDATE_FIXTURES = [
  'home',
  'page',
  'empty',
  'header_only',
  'cart',
  'orders',
  'order_detail',
  'tagihan',
  'invoice_detail',
  'calendar',
  'gathering_plan',
] as const;

/** Halaman sistem di manifest → fixture standar yang wajib lolos render. */
export const PAGE_OVERRIDE_FIXTURE: Record<string, CandidateFixture> = {
  header: 'header_only',
  cart: 'cart',
  orders: 'orders',
  order_detail: 'order_detail',
  tagihan: 'tagihan',
  invoice_detail: 'invoice_detail',
  calendar: 'calendar',
  gathering_plan: 'gathering_plan',
};
export type CandidateFixture = (typeof CANDIDATE_FIXTURES)[number];

/** Galat terstruktur dari publisher/runtime (mis. 422 `integrity_mismatch`). */
export class TemplateServiceError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'TemplateServiceError';
  }
}

export interface IntakeResult {
  packageName: string;
  version: string;
  tarballIntegrity: string;
  digest: string;
  manifest: unknown;
  serverBundleBytes: number;
  clientBundleBytes: number;
}

export interface ReleaseResult {
  slug: string;
  version: string;
  digest: string;
}

export interface CandidateRenderResult {
  digest: string;
  fixture: CandidateFixture;
  html: string;
  htmlBytes: number;
  durationMs: number;
}

export interface CandidateFileResult {
  digest: string;
  file: 'client.js' | 'manifest.json';
  content: string | null;
  bytes: number;
}

const DIGEST_PATTERN = /^[a-f0-9]{64}$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

@Injectable()
export class TemplatePublicationClient {
  constructor(private readonly config: ConfigService) {}

  async intake(packageName: string, version: string): Promise<IntakeResult> {
    const result = await this.call('publisher', '/v1/admin/intake', { packageName, version }, 45_000);
    if (
      result.packageName !== packageName ||
      result.version !== version ||
      typeof result.digest !== 'string' ||
      !DIGEST_PATTERN.test(result.digest) ||
      typeof result.tarballIntegrity !== 'string'
    ) {
      throw new TemplateServiceError(502, 'publisher_invalid_response', 'Publisher mengembalikan hasil intake yang tidak cocok.');
    }
    return result as unknown as IntakeResult;
  }

  async release(slug: string, version: string, digest: string): Promise<ReleaseResult> {
    const result = await this.call('publisher', '/v1/admin/release', { slug, version, digest });
    if (result.slug !== slug || result.version !== version || result.digest !== digest) {
      throw new TemplateServiceError(502, 'publisher_invalid_response', 'Publisher mengembalikan versi rilis yang tidak cocok.');
    }
    return { slug, version, digest };
  }

  async withdraw(slug: string, version: string): Promise<void> {
    const result = await this.call('publisher', '/v1/admin/withdraw', { slug, version });
    if (result.slug !== slug || result.version !== version) {
      throw new TemplateServiceError(502, 'publisher_invalid_response', 'Publisher mengembalikan versi yang tidak cocok.');
    }
  }

  async renderCandidate(digest: string, fixture: CandidateFixture): Promise<CandidateRenderResult> {
    const result = await this.call('runtime', '/v1/render-candidate', { digest, fixture });
    if (result.digest !== digest || result.fixture !== fixture || typeof result.html !== 'string') {
      throw new TemplateServiceError(502, 'runtime_invalid_response', 'Runtime mengembalikan hasil render yang tidak cocok.');
    }
    return result as unknown as CandidateRenderResult;
  }

  async candidateFile(digest: string, file: 'client.js' | 'manifest.json'): Promise<CandidateFileResult> {
    const result = await this.call('runtime', '/v1/candidate-file', { digest, file });
    if (result.digest !== digest || result.file !== file) {
      throw new TemplateServiceError(502, 'runtime_invalid_response', 'Runtime mengembalikan file kandidat yang tidak cocok.');
    }
    return result as unknown as CandidateFileResult;
  }

  private endpoint(service: 'publisher' | 'runtime'): { baseUrl: string; token: string } {
    const baseUrl = this.config
      .get<string>(service === 'publisher' ? 'TEMPLATE_PUBLISHER_URL' : 'TEMPLATE_RUNTIME_URL')
      ?.trim();
    const token = this.config
      .get<string>(service === 'publisher' ? 'TEMPLATE_PUBLISHER_TOKEN' : 'TEMPLATE_RUNTIME_TOKEN')
      ?.trim();
    if (!baseUrl || !token) {
      throw new ServiceUnavailableException(`Template ${service} service is not configured`);
    }
    return { baseUrl: baseUrl.replace(/\/+$/, ''), token };
  }

  private async call(
    service: 'publisher' | 'runtime',
    path: string,
    body: Record<string, unknown>,
    timeoutMs = 30_000,
  ): Promise<Record<string, unknown>> {
    const { baseUrl, token } = this.endpoint(service);
    let response: Response;
    try {
      response = await fetch(`${baseUrl}${path}`, {
        method: 'POST',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch {
      throw new TemplateServiceError(503, `${service}_unavailable`, `Layanan template ${service} tidak dapat dihubungi.`);
    }
    let result: unknown;
    try {
      result = await response.json();
    } catch {
      throw new TemplateServiceError(502, `${service}_invalid_response`, `Layanan template ${service} mengembalikan JSON tidak valid (${response.status}).`);
    }
    if (!isRecord(result)) {
      throw new TemplateServiceError(502, `${service}_invalid_response`, `Layanan template ${service} mengembalikan respons tidak valid (${response.status}).`);
    }
    if (!response.ok) {
      const error = isRecord(result.error) ? result.error : {};
      throw new TemplateServiceError(
        response.status,
        typeof error.code === 'string' ? error.code : `${service}_request_failed`,
        typeof error.message === 'string'
          ? error.message.slice(0, 500)
          : `Layanan template ${service} gagal (${response.status}).`,
      );
    }
    return result;
  }
}
