import { randomBytes } from 'crypto';
import { resolveTxt } from 'dns/promises';

import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Not, Repository } from 'typeorm';

import { Website } from '../../entities';
import { TraefikDynamicConfig } from './dto/traefik-dynamic-config.dto';

/** Hostname DNS valid (huruf kecil, termasuk punycode `xn--`). Hanya nilai yang lolos ini yang boleh masuk ke rule Traefik. */
const HOSTNAME_PATTERN = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z](?:[a-z0-9-]{0,61}[a-z0-9])$/;
const TRAEFIK_SERVICE_NAME = 'website-custom-domain-svc';

export function isValidCustomDomain(domain: string): boolean {
  return HOSTNAME_PATTERN.test(domain);
}

/**
 * Custom domain website — pola Auction Market/Bookpedia
 * (plan/architecture/custom-domain-setup.md):
 * 1. kepemilikan dibuktikan lewat TXT `_bagdja-verify.<domain>`;
 * 2. routing ke renderer publik lewat file dynamic-config Traefik yang
 *    di-sync cron host dari `GET /api/internal/traefik-config/yaml`
 *    (lihat `TraefikConfigController`) — tanpa Coolify API, tanpa redeploy;
 * 3. TLS publik ditangani Cloudflare milik tenant (proxy + SSL "Full").
 */
@Injectable()
export class DomainsService {
  private readonly logger = new Logger(DomainsService.name);

  constructor(
    @InjectRepository(Website)
    private readonly websiteRepo: Repository<Website>,
    private readonly config: ConfigService,
  ) {}

  private async findWebsite(websiteId: string) {
    const website = await this.websiteRepo.findOne({ where: { id: websiteId } });
    if (!website) throw new NotFoundException('Website not found');
    return website;
  }

  private verificationRecordName(domain: string): string {
    return `_bagdja-verify.${domain}`;
  }

  async startVerification(websiteId: string) {
    const website = await this.findWebsite(websiteId);
    if (!website.domain) {
      throw new BadRequestException('Website does not have a custom domain set');
    }

    if (!website.domain_verification_token) {
      website.domain_verification_token = randomBytes(16).toString('hex');
      await this.websiteRepo.save(website);
    }

    const dnsTargetIp = this.config.get<string>('CUSTOM_DOMAIN_TARGET_IP') || '';

    return {
      recordType: 'TXT',
      recordName: this.verificationRecordName(website.domain),
      recordValue: website.domain_verification_token,
      // Selain TXT (bukti kepemilikan), domain juga wajib diarahkan ke server
      // kita supaya benar-benar bisa diakses — tanpa ini tenant cuma
      // "verified" di database tapi domainnya tidak pernah bisa dibuka.
      //
      // SELALU kirim object (bukan `null` kalau CUSTOM_DOMAIN_TARGET_IP
      // kosong) — samakan kontrak dengan bagdja-auction-api
      // (DomainVerificationResponseDto), `recordValue` cuma string kosong
      // kalau belum dikonfigurasi. Ini SENGAJA TIDAK auto-detect IP lewat
      // layanan pihak ketiga (api.ipify.org) seperti Auction Market —
      // Auction sendiri pernah kena insiden nyata karena hasil auto-detect
      // (IP proses API) berbeda dari IP tempat renderer publik benar-benar
      // berjalan (lihat plan/architecture/custom-domain-setup.md §4.6).
      // Isi CUSTOM_DOMAIN_TARGET_IP manual di .env, jangan tebak otomatis.
      dnsTarget: { recordType: 'A', recordName: website.domain, recordValue: dnsTargetIp },
    };
  }

  async checkVerification(websiteId: string) {
    const website = await this.findWebsite(websiteId);
    if (!website.domain) {
      throw new BadRequestException('Website does not have a custom domain set');
    }
    if (!website.domain_verification_token) {
      throw new BadRequestException('Call domain/verify first to get the TXT record to add');
    }
    if (!isValidCustomDomain(website.domain.trim().toLowerCase())) {
      throw new BadRequestException('Custom domain is not a valid hostname (e.g. tokosaya.com)');
    }

    let records: string[][];
    try {
      records = await resolveTxt(this.verificationRecordName(website.domain));
    } catch {
      throw new BadRequestException('TXT record not found yet — DNS may still be propagating');
    }

    const found = records.some((chunks) => chunks.join('') === website.domain_verification_token);
    if (!found) {
      throw new BadRequestException('TXT record found but value does not match — check your DNS provider');
    }

    // Router Traefik untuk domain ini otomatis muncul di sync cron berikutnya (≤1 menit).
    website.domain_verified_at = new Date();
    await this.websiteRepo.save(website);

    return { verified: true, domain: website.domain, verified_at: website.domain_verified_at };
  }

  /**
   * Satu router Traefik eksplisit `Host(\`<domain>\`)` per website aktif yang
   * domain-nya sudah terverifikasi, semuanya ke satu service renderer publik
   * (`WEBSITE_APP_INTERNAL_URL`). Domain yang tidak lolos validasi hostname
   * dilewati (defense in depth — mencegah injeksi ke rule Traefik). Bila
   * `WEBSITE_APP_INTERNAL_URL` kosong, dikembalikan config kosong (bukan
   * router tanpa service yang membuat Traefik error).
   */
  async buildTraefikDynamicConfig(): Promise<TraefikDynamicConfig> {
    const internalUrl = (this.config.get<string>('WEBSITE_APP_INTERNAL_URL') || '').trim();
    if (!internalUrl) {
      this.logger.warn('WEBSITE_APP_INTERNAL_URL is not set — returning empty Traefik config');
      return { http: { routers: {}, services: {} } };
    }

    const websites = await this.websiteRepo.find({
      where: { domain: Not(IsNull()), domain_verified_at: Not(IsNull()), is_active: true },
      select: { id: true, slug: true, domain: true },
      order: { slug: 'ASC' },
    });

    const routers: TraefikDynamicConfig['http']['routers'] = {};
    for (const website of websites) {
      const domain = website.domain?.trim().toLowerCase() ?? '';
      if (!isValidCustomDomain(domain)) {
        this.logger.warn(`Skipping invalid custom domain for website ${website.id}`);
        continue;
      }
      routers[`website-custom-domain-${website.slug}`] = {
        rule: `Host(\`${domain}\`)`,
        entryPoints: ['https'],
        tls: {},
        service: TRAEFIK_SERVICE_NAME,
      };
    }

    const services: TraefikDynamicConfig['http']['services'] =
      Object.keys(routers).length > 0
        ? { [TRAEFIK_SERVICE_NAME]: { loadBalancer: { passHostHeader: true, servers: [{ url: internalUrl }] } } }
        : {};

    return { http: { routers, services } };
  }

  async removeDomain(websiteId: string) {
    const website = await this.findWebsite(websiteId);
    // Router Traefik hilang sendiri di sync cron berikutnya karena domain_verified_at dikosongkan.
    website.domain = null;
    website.domain_verification_token = null;
    website.domain_verified_at = null;
    await this.websiteRepo.save(website);
    return { deleted: true };
  }
}
