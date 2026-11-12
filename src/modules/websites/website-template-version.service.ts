import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';

import { Website, WebsiteTemplate, WebsiteTemplateVersion } from '../../entities';
import { WebsitePlatformTemplateSubmission } from '../../entities/website-platform-template-submission.entity';
import { compareSemver } from '../templates/external-template-manifest';

export interface WebsiteTemplatePin {
  template_version_id: string | null;
  template_runtime_version: string | null;
}

export interface WebsiteTemplateVersionSummary {
  versionId: string;
  version: string;
  status: WebsiteTemplateVersion['status'];
  changelog: string | null;
  publishedAt: Date;
}

export interface WebsiteTemplateVersionStatus {
  websiteId: string;
  templateId: string | null;
  source: 'builtin' | 'package' | null;
  current: WebsiteTemplateVersionSummary | null;
  latest: WebsiteTemplateVersionSummary | null;
  updateAvailable: boolean;
}

/**
 * Pin versi template eksternal per website (plan/website-builder/
 * template-submission-review-publication-flow.md §4.4). Versi hanya berubah saat
 * seller memilih template lain atau menekan "Update" — tidak pernah otomatis.
 */
@Injectable()
export class WebsiteTemplateVersionService {
  constructor(
    @InjectRepository(WebsiteTemplateVersion)
    private readonly versions: Repository<WebsiteTemplateVersion>,
    @InjectRepository(Website)
    private readonly websites: Repository<Website>,
    @InjectRepository(WebsitePlatformTemplateSubmission)
    private readonly submissions: Repository<WebsitePlatformTemplateSubmission>,
  ) {}

  /** Pin untuk pemasangan baru: template bawaan = tanpa pin; package = versi published terbaru. */
  async resolveInstallPin(template: WebsiteTemplate): Promise<WebsiteTemplatePin> {
    if (template.source !== 'package') {
      return { template_version_id: null, template_runtime_version: null };
    }
    const latest = await this.latestPublished(template.id);
    if (!latest) {
      throw new BadRequestException('Template ini belum memiliki versi yang terbit.');
    }
    return { template_version_id: latest.id, template_runtime_version: latest.version };
  }

  async getStatus(websiteId: string): Promise<WebsiteTemplateVersionStatus> {
    const website = await this.findWebsite(websiteId);
    const template = website.template ?? null;
    if (!template || template.source !== 'package') {
      return {
        websiteId,
        templateId: website.template_id,
        source: template?.source ?? null,
        current: null,
        latest: null,
        updateAvailable: false,
      };
    }
    const [current, latest] = await Promise.all([
      website.template_version_id
        ? this.versions.findOne({ where: { id: website.template_version_id } })
        : Promise.resolve(null),
      this.latestPublished(template.id),
    ]);
    const summaries = await this.summarize([current, latest].filter((row): row is WebsiteTemplateVersion => Boolean(row)));
    return {
      websiteId,
      templateId: template.id,
      source: 'package',
      current: current ? summaries.get(current.id)! : null,
      latest: latest ? summaries.get(latest.id)! : null,
      updateAvailable: Boolean(latest && (!current || compareSemver(latest.version, current.version) > 0)),
    };
  }

  /** Aksi "Update" seller: pindah ke versi published yang lebih baru dari template yang sama. */
  async upgrade(websiteId: string, versionId: string): Promise<WebsiteTemplateVersionStatus> {
    const website = await this.findWebsite(websiteId);
    const target = await this.versions.findOne({ where: { id: versionId } });
    if (!target || target.template_id !== website.template_id) {
      throw new NotFoundException('Versi template tidak ditemukan untuk website ini.');
    }
    if (target.status !== 'published') {
      throw new ConflictException('Versi ini tidak lagi tersedia untuk dipasang.');
    }
    if (website.template_runtime_version && compareSemver(target.version, website.template_runtime_version) <= 0) {
      throw new ConflictException('Pilih versi yang lebih baru dari versi yang terpasang.');
    }
    website.template_version_id = target.id;
    website.template_runtime_version = target.version;
    await this.websites.save(website);
    return this.getStatus(websiteId);
  }

  private async latestPublished(templateId: string): Promise<WebsiteTemplateVersion | null> {
    const published = await this.versions.find({ where: { template_id: templateId, status: 'published' } });
    return published.sort((a, b) => compareSemver(b.version, a.version))[0] ?? null;
  }

  private async summarize(rows: WebsiteTemplateVersion[]): Promise<Map<string, WebsiteTemplateVersionSummary>> {
    const submissions = rows.length
      ? await this.submissions.find({
          where: { id: In(rows.map((row) => row.submission_id)) },
          select: ['id', 'changelog'],
        })
      : [];
    const changelogs = new Map(submissions.map((submission) => [submission.id, submission.changelog]));
    return new Map(
      rows.map((row) => [
        row.id,
        {
          versionId: row.id,
          version: row.version,
          status: row.status,
          changelog: changelogs.get(row.submission_id) ?? null,
          publishedAt: row.published_at,
        },
      ]),
    );
  }

  private async findWebsite(websiteId: string): Promise<Website> {
    const website = await this.websites.findOne({ where: { id: websiteId }, relations: { template: true } });
    if (!website) throw new NotFoundException('Website not found');
    return website;
  }
}
