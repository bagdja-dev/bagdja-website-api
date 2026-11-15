import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Not, Repository } from 'typeorm';

import { WebsitePlatformTemplateSubmission } from '../../entities/website-platform-template-submission.entity';
import { WebsiteTemplateVersion } from '../../entities/website-template-version.entity';
import { StorageClientService } from '../storage/storage-client.service';
import { TemplatePublicationClient, TemplateServiceError } from './template-publication.client';

export interface UploadedBrowserBundle {
  url: string;
  sha256: string;
}

const SHA256_PATTERN = /^[a-f0-9]{64}$/;

/**
 * Unggah browser.js artefak kandidat ke R2 (lewat storage-service) — sekali saat "Cek package".
 * Plan: plan/website-builder/template-client-rendering-plan.md §6 (D3, D6).
 *
 * Publisher tidak punya egress selain registry npm, jadi Website API yang mengambil bytes dari
 * publisher (SHA-256 diverifikasi) lalu mengunggahnya. Isi yang sama (SHA-256 sama) tidak diunggah
 * ulang: URL yang sudah tercatat di kandidat/versi lain dipakai lagi.
 */
@Injectable()
export class TemplateBrowserBundleService {
  constructor(
    private readonly publication: TemplatePublicationClient,
    private readonly storage: StorageClientService,
    @InjectRepository(WebsitePlatformTemplateSubmission)
    private readonly submissions: Repository<WebsitePlatformTemplateSubmission>,
    @InjectRepository(WebsiteTemplateVersion)
    private readonly versions: Repository<WebsiteTemplateVersion>,
  ) {}

  async upload(params: {
    digest: string;
    sha256: string;
    slug: string;
    version: string;
    /** Bundle hasil cek sebelumnya pada kandidat yang sama (sudah dikosongkan dari baris saat cek dimulai). */
    previous?: UploadedBrowserBundle | null;
  }): Promise<UploadedBrowserBundle> {
    const { digest, sha256, slug, version, previous } = params;
    if (!SHA256_PATTERN.test(sha256)) {
      throw new TemplateServiceError(502, 'browser_bundle_integrity_failed', 'SHA-256 browser.js dari publisher tidak valid.');
    }
    if (previous?.sha256 === sha256 && previous.url) return { url: previous.url, sha256 };
    const existing = await this.findUploaded(sha256);
    if (existing) return existing;

    const bytes = await this.publication.browserBundle(digest, sha256);
    let url: string | null;
    try {
      ({ url } = await this.storage.uploadFile(
        bytes,
        'text/javascript',
        `${slug}-${version}-browser.js`,
        'template_browser_bundle',
        true,
      ));
    } catch {
      throw new TemplateServiceError(502, 'browser_bundle_upload_failed', 'browser.js gagal diunggah ke storage.');
    }
    if (!url || !/^https?:\/\//.test(url)) {
      throw new TemplateServiceError(502, 'browser_bundle_upload_failed', 'Storage tidak mengembalikan URL publik browser.js.');
    }
    return { url, sha256 };
  }

  /** URL yang sudah pernah diunggah untuk isi yang sama (kandidat ulang / versi terbit). */
  private async findUploaded(sha256: string): Promise<UploadedBrowserBundle | null> {
    const where = { browser_bundle_sha256: sha256, browser_bundle_url: Not(IsNull()) };
    const row =
      (await this.versions.findOne({ where, select: ['id', 'browser_bundle_url'] })) ??
      (await this.submissions.findOne({ where, select: ['id', 'browser_bundle_url'] }));
    return row?.browser_bundle_url ? { url: row.browser_bundle_url, sha256 } : null;
  }
}
