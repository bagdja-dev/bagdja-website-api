import { NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Repository } from 'typeorm';

import { Website, WebsiteAndroidApp } from '../../entities';

import { AndroidAssetLinksService } from './android-asset-links.service';

describe('AndroidAssetLinksService', () => {
  const activeFingerprint = 'AA:AA:AA:AA:AA:AA:AA:AA:AA:AA:AA:AA:AA:AA:AA:AA:AA:AA:AA:AA:AA:AA:AA:AA:AA:AA:AA:AA:AA:AA:AA:AA';
  const rotatedFingerprint = 'BB:BB:BB:BB:BB:BB:BB:BB:BB:BB:BB:BB:BB:BB:BB:BB:BB:BB:BB:BB:BB:BB:BB:BB:BB:BB:BB:BB:BB:BB:BB:BB';

  const createService = (input: {
    website?: Website | null;
    app?: WebsiteAndroidApp | null;
    platformHost?: string;
  } = {}) => {
    const websiteRepo = {
      findOne: jest.fn(async (options: { where: Record<string, unknown> }) => {
        if (options.where.slug === 'shop') {
          return input.website !== undefined ? input.website : {
            id: 'website-1',
            slug: 'shop',
            is_active: true,
            domain: null,
            domain_verified_at: null,
          } as Website;
        }
        if (options.where.domain === 'shop.example.com') {
          return input.website !== undefined ? input.website : {
            id: 'website-1',
            slug: 'shop',
            is_active: true,
            domain: 'shop.example.com',
            domain_verified_at: new Date('2026-01-01T00:00:00.000Z'),
          } as Website;
        }
        return null;
      }),
    };
    const app: WebsiteAndroidApp = input.app ?? {
      id: 'android-app-1',
      website_id: 'website-1',
      website: undefined,
      app_name: 'Shop',
      package_name: 'com.example.shop',
      version_name: '1.0.0',
      version_code: 1,
      package_name_locked: true,
      keystore_storage_file_id: 'keystore-file',
      keystore_alias: 'release',
      store_password_encrypted: null,
      key_password_encrypted: null,
      release_signing_cert_sha256: [activeFingerprint, rotatedFingerprint, 'not-a-fingerprint'],
      retired_signing_cert_sha256: [],
      created_at: new Date('2026-01-01T00:00:00.000Z'),
      updated_at: new Date('2026-01-01T00:00:00.000Z'),
    };
    const androidAppRepo = { findOne: jest.fn().mockResolvedValue(app) };
    const config = {
      get: jest.fn((_key: string, fallback?: string) => input.platformHost ?? fallback),
    };
    const service = new AndroidAssetLinksService(
      websiteRepo as unknown as Repository<Website>,
      androidAppRepo as unknown as Repository<WebsiteAndroidApp>,
      config as unknown as ConfigService,
    );
    return { service, websiteRepo, androidAppRepo, app };
  };

  it.each([
    ['shop.sites.bagdja.com', 'platform subdomain'],
    ['SHOP.SITES.BAGDJA.COM:443', 'case-insensitive host with port'],
    ['shop.sites.bagdja.com.', 'trailing-dot host'],
  ])('resolves a valid %s (%s) to tenant-specific DAL', async (host) => {
    const { service, websiteRepo } = createService();

    const response = await service.getAssetLinks(host);

    expect(websiteRepo.findOne).toHaveBeenCalledWith({
      where: { slug: 'shop', is_active: true },
    });
    expect(response).toEqual([{
      relation: ['delegate_permission/common.handle_all_urls'],
      target: {
        namespace: 'android_app',
        package_name: 'com.example.shop',
        sha256_cert_fingerprints: [activeFingerprint, rotatedFingerprint],
      },
    }]);
  });

  it('resolves only verified custom domains', async () => {
    const { service, websiteRepo } = createService();

    await service.getAssetLinks('SHOP.EXAMPLE.COM:443');

    expect(websiteRepo.findOne).toHaveBeenCalledWith({
      where: { domain: 'shop.example.com', is_active: true },
    });
  });

  it('does not return DAL for an unverified custom domain', async () => {
    const unverifiedWebsite = {
      id: 'website-1',
      slug: 'shop',
      is_active: true,
      domain: 'shop.example.com',
      domain_verified_at: null,
    } as Website;
    const { service, androidAppRepo } = createService({ website: unverifiedWebsite });

    await expect(service.getAssetLinks('shop.example.com')).rejects.toThrow(NotFoundException);
    expect(androidAppRepo.findOne).not.toHaveBeenCalled();
  });

  it.each([
    'sites.bagdja.com',
    'other.sites.bagdja.com',
    'shop.other.com',
    'shop.sites.bagdja.com/path',
    'shop.sites.bagdja.com?other=site',
    'two.labels.sites.bagdja.com',
  ])('does not associate an unknown or malformed host: %s', async (host) => {
    const { service, androidAppRepo } = createService({ website: null });

    await expect(service.getAssetLinks(host)).rejects.toThrow(NotFoundException);
    expect(androidAppRepo.findOne).not.toHaveBeenCalled();
  });

  it('returns no association before a successful release signing fingerprint exists', async () => {
    const app = {
      ...createService().app,
      release_signing_cert_sha256: [],
    };
    const { service } = createService({ app });

    await expect(service.getAssetLinks('shop.sites.bagdja.com')).rejects.toThrow(NotFoundException);
  });

  it('omits retired fingerprints while preserving the remaining rotation fingerprints', async () => {
    const app = {
      ...createService().app,
      retired_signing_cert_sha256: [activeFingerprint.toLowerCase()],
    };
    const { service } = createService({ app });

    const response = await service.getAssetLinks('shop.sites.bagdja.com');

    expect(response[0].target.sha256_cert_fingerprints).toEqual([rotatedFingerprint]);
  });
});
