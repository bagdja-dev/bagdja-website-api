import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import type { Repository } from 'typeorm';

import type { Website, WebsiteTemplate, WebsiteTemplateVersion } from '../../entities';
import type { WebsitePlatformTemplateSubmission } from '../../entities/website-platform-template-submission.entity';

import { WebsiteTemplateVersionService } from './website-template-version.service';

const packageTemplate = { id: 'tpl', source: 'package' } as WebsiteTemplate;

const version = (id: string, semver: string, status: WebsiteTemplateVersion['status'] = 'published') =>
  ({
    id,
    template_id: 'tpl',
    version: semver,
    status,
    submission_id: `sub-${id}`,
    published_at: new Date('2026-11-12T00:00:00Z'),
  }) as WebsiteTemplateVersion;

function setup(rows: WebsiteTemplateVersion[], website: Partial<Website>) {
  const site = { id: 'site', template: packageTemplate, template_id: 'tpl', ...website } as Website;
  const versions = {
    find: jest.fn(async ({ where }: { where: { template_id: string; status: string } }) =>
      rows.filter((row) => row.template_id === where.template_id && row.status === where.status)),
    findOne: jest.fn(async ({ where }: { where: { id: string } }) => rows.find((row) => row.id === where.id) ?? null),
  };
  const websites = {
    findOne: jest.fn(async () => site),
    save: jest.fn(async (value: Website) => value),
  };
  const submissions = {
    find: jest.fn(async () => rows.map((row) => ({ id: row.submission_id, changelog: `Changelog ${row.version}` }))),
  };
  const service = new WebsiteTemplateVersionService(
    versions as unknown as Repository<WebsiteTemplateVersion>,
    websites as unknown as Repository<Website>,
    submissions as unknown as Repository<WebsitePlatformTemplateSubmission>,
  );
  return { service, site, websites };
}

describe('WebsiteTemplateVersionService', () => {
  it('installs the newest published version by semver, not by insertion order', async () => {
    const { service } = setup([version('v10', '1.10.0'), version('v9', '1.9.0'), version('v2', '2.0.0', 'revoked')], {});
    await expect(service.resolveInstallPin(packageTemplate)).resolves.toEqual({
      template_version_id: 'v10',
      template_runtime_version: '1.10.0',
    });
  });

  it('does not pin built-in templates and refuses package templates without a published version', async () => {
    const { service } = setup([version('v1', '1.0.0', 'deprecated')], {});
    await expect(service.resolveInstallPin({ id: 'b', source: 'builtin' } as WebsiteTemplate)).resolves.toEqual({
      template_version_id: null,
      template_runtime_version: null,
    });
    await expect(service.resolveInstallPin(packageTemplate)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('reports an available update with its changelog', async () => {
    const { service } = setup([version('v1', '1.0.0'), version('v2', '1.1.0')], {
      template_version_id: 'v1',
      template_runtime_version: '1.0.0',
    });
    await expect(service.getStatus('site')).resolves.toMatchObject({
      source: 'package',
      current: { versionId: 'v1', version: '1.0.0' },
      latest: { versionId: 'v2', version: '1.1.0', changelog: 'Changelog 1.1.0' },
      updateAvailable: true,
    });
  });

  it('upgrades only to a newer published version of the same template', async () => {
    const rows = [version('v1', '1.0.0'), version('v2', '1.1.0'), version('v3', '1.2.0', 'deprecated')];
    const { service, site, websites } = setup(rows, { template_version_id: 'v2', template_runtime_version: '1.1.0' });

    await expect(service.upgrade('site', 'v1')).rejects.toBeInstanceOf(ConflictException);
    await expect(service.upgrade('site', 'v3')).rejects.toBeInstanceOf(ConflictException);
    await expect(service.upgrade('site', 'missing')).rejects.toBeInstanceOf(NotFoundException);
    expect(websites.save).not.toHaveBeenCalled();

    site.template_version_id = 'v1';
    site.template_runtime_version = '1.0.0';
    await service.upgrade('site', 'v2');
    expect(site).toMatchObject({ template_version_id: 'v2', template_runtime_version: '1.1.0' });
  });

  it('lets the seller pick any published version, including older ones, and ends a running trial', async () => {
    const activePackage = { ...packageTemplate, is_active: true } as WebsiteTemplate;
    const withTemplate = (row: WebsiteTemplateVersion) => Object.assign(row, { template: activePackage });
    const { service, site } = setup(
      [withTemplate(version('v1', '1.0.0')), withTemplate(version('v2', '1.1.0')), withTemplate(version('v0', '0.9.0', 'deprecated'))],
      { template_id: null, template_version_id: 'v2', template_runtime_version: '1.1.0', trial_submission_id: 'sub-trial' },
    );

    const status = await service.select('site', 'v1');
    expect(site).toMatchObject({
      template_id: 'tpl',
      template_version_id: 'v1',
      template_runtime_version: '1.0.0',
      trial_submission_id: null,
    });
    expect(status.current?.version).toBe('1.0.0');
    expect(status.updateAvailable).toBe(true);

    await expect(service.select('site', 'v0')).rejects.toBeInstanceOf(ConflictException);
    await expect(service.select('site', 'missing')).rejects.toBeInstanceOf(NotFoundException);
  });
});
