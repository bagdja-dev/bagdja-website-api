import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { Website, WebsiteAndroidApp } from '../../entities';

const SHA256_FINGERPRINT = /^(?:[0-9A-F]{2}:){31}[0-9A-F]{2}$/i;
const PACKAGE_NAME = /^[A-Za-z][A-Za-z0-9_]*(\.[A-Za-z][A-Za-z0-9_]*)+$/;
const ASSET_LINK_RELATION = 'delegate_permission/common.handle_all_urls';

@Injectable()
export class AndroidAssetLinksService {
  constructor(
    @InjectRepository(Website)
    private readonly websiteRepo: Repository<Website>,
    @InjectRepository(WebsiteAndroidApp)
    private readonly androidAppRepo: Repository<WebsiteAndroidApp>,
    private readonly config: ConfigService,
  ) {}

  async getAssetLinks(host: string) {
    const hostname = this.normalizeRequestHost(host);
    const website = await this.findWebsiteForHost(hostname);
    if (!website) throw new NotFoundException('Website host not found or not verified');

    const app = await this.androidAppRepo.findOne({
      where: { website_id: website.id },
    });
    if (!app || !PACKAGE_NAME.test(app.package_name)) {
      throw new NotFoundException('Android app is not configured for this website');
    }

    const retired = new Set(
      (app.retired_signing_cert_sha256 ?? []).map((fingerprint) => fingerprint.toUpperCase()),
    );
    const fingerprints = [...new Set(
      (app.release_signing_cert_sha256 ?? [])
        .filter((fingerprint) => SHA256_FINGERPRINT.test(fingerprint))
        .map((fingerprint) => fingerprint.toUpperCase())
        .filter((fingerprint) => !retired.has(fingerprint)),
    )];
    if (!fingerprints.length) {
      throw new NotFoundException('No active Android release signing fingerprint is configured');
    }

    return [{
      relation: [ASSET_LINK_RELATION],
      target: {
        namespace: 'android_app',
        package_name: app.package_name,
        sha256_cert_fingerprints: fingerprints,
      },
    }];
  }

  private async findWebsiteForHost(hostname: string): Promise<Website | null> {
    const platformHost = this.normalizeConfiguredHost(
      this.config.get<string>('PLATFORM_HOST', 'sites.bagdja.com'),
    );
    if (hostname === platformHost) return null;

    const platformSuffix = `.${platformHost}`;
    if (hostname.endsWith(platformSuffix)) {
      const slug = hostname.slice(0, -platformSuffix.length);
      if (!/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(slug)) return null;
      return this.websiteRepo.findOne({ where: { slug, is_active: true } });
    }

    const website = await this.websiteRepo.findOne({
      where: { domain: hostname, is_active: true },
    });
    return website?.domain_verified_at ? website : null;
  }

  private normalizeRequestHost(value: string): string {
    const input = value?.trim();
    if (!input || !/^[a-z0-9.-]+(?::\d{1,5})?\.?$/i.test(input)) {
      throw new NotFoundException('Website host not found');
    }

    let parsed: URL;
    try {
      parsed = new URL(`https://${input}`);
    } catch {
      throw new NotFoundException('Website host not found');
    }
    if (
      parsed.username ||
      parsed.password ||
      parsed.pathname !== '/' ||
      parsed.search ||
      parsed.hash
    ) {
      throw new NotFoundException('Website host not found');
    }
    const hostname = parsed.hostname.toLowerCase().replace(/\.$/, '');
    if (!this.isHostname(hostname)) throw new NotFoundException('Website host not found');
    return hostname;
  }

  private normalizeConfiguredHost(value: string): string {
    let parsed: URL;
    try {
      parsed = new URL(`https://${value}`);
    } catch {
      throw new Error('PLATFORM_HOST must be a hostname without a scheme or path');
    }
    if (
      parsed.username ||
      parsed.password ||
      parsed.port ||
      parsed.pathname !== '/' ||
      parsed.search ||
      parsed.hash
    ) {
      throw new Error('PLATFORM_HOST must be a hostname without a scheme or path');
    }
    const hostname = parsed.hostname.toLowerCase().replace(/\.$/, '');
    if (!this.isHostname(hostname)) {
      throw new Error('PLATFORM_HOST must be a valid hostname');
    }
    return hostname;
  }

  private isHostname(hostname: string): boolean {
    return hostname.length <= 253 && hostname.split('.').every(
      (label) => label.length > 0 && label.length <= 63 &&
        /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/i.test(label),
    );
  }
}
