import { randomBytes } from 'crypto';
import { resolveTxt } from 'dns/promises';

import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { Website } from '../../entities';
import { CoolifyService } from './coolify.service';

@Injectable()
export class DomainsService {
  constructor(
    @InjectRepository(Website)
    private readonly websiteRepo: Repository<Website>,
    private readonly coolifyService: CoolifyService,
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

    const registered = await this.coolifyService.addDomain(website.domain);
    if (!registered) {
      throw new BadRequestException(
        'DNS verified, but failed to register the domain with the hosting provider — please retry',
      );
    }

    website.domain_verified_at = new Date();
    await this.websiteRepo.save(website);

    return { verified: true, domain: website.domain, verified_at: website.domain_verified_at };
  }

  async removeDomain(websiteId: string) {
    const website = await this.findWebsite(websiteId);
    if (website.domain) {
      await this.coolifyService.removeDomain(website.domain);
    }
    website.domain = null;
    website.domain_verification_token = null;
    website.domain_verified_at = null;
    await this.websiteRepo.save(website);
    return { deleted: true };
  }
}
