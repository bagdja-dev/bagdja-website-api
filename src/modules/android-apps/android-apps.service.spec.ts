import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Repository } from 'typeorm';

import { Website, WebsiteAndroidApp } from '../../entities';
import { StorageClientService } from '../storage/storage-client.service';

import { AndroidAppsService } from './android-apps.service';
import { AndroidBuilderClientService } from './android-builder-client.service';
import { KeystoreSecretsService } from './keystore-secrets.service';

describe('AndroidAppsService', () => {
  const websiteId = 'website-1';

  const createApp = (): WebsiteAndroidApp => ({
    id: 'app-1',
    website_id: websiteId,
    website: undefined,
    app_name: 'Shop',
    package_name: 'com.example.shop',
    version_name: '1.0.0',
    version_code: 1,
    package_name_locked: false,
    keystore_storage_file_id: null,
    keystore_alias: null,
    store_password_encrypted: null,
    key_password_encrypted: null,
    release_signing_cert_sha256: [],
    retired_signing_cert_sha256: [],
    created_at: new Date('2026-01-01T00:00:00.000Z'),
    updated_at: new Date('2026-01-01T00:00:00.000Z'),
  });

  const createService = (overrides: {
    website?: Partial<Website> | null;
    jobs?: AndroidBuilderClientService['listJobs'];
  } = {}) => {
    const app = createApp();
    const websiteRepo = {
      findOne: jest.fn().mockResolvedValue(
        overrides.website === null
          ? null
          : {
              id: websiteId,
              slug: 'shop',
              is_active: true,
              domain: null,
              domain_verified_at: null,
              ...overrides.website,
            },
      ),
    };
    const queryBuilder = {
      where: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      getOne: jest.fn().mockResolvedValue(app),
    };
    const androidAppRepo = {
      findOne: jest.fn().mockResolvedValue(app),
      createQueryBuilder: jest.fn().mockReturnValue(queryBuilder),
      save: jest.fn().mockImplementation(async (value) => value),
    };
    const storage = {
      uploadFile: jest.fn().mockResolvedValue({ fileId: 'private-keystore-file' }),
      getAccessUrl: jest.fn(),
      removeFile: jest.fn().mockResolvedValue(undefined),
    };
    const secrets = {
      encrypt: jest.fn((plaintext: string) => `encrypted:${plaintext}`),
      decrypt: jest.fn((ciphertext: string) => ciphertext),
    };
    const builder = {
      listJobs: overrides.jobs ?? jest.fn().mockResolvedValue([]),
      enqueue: jest.fn(),
    };
    const config = {
      get: jest.fn((_key: string, fallback?: string) => fallback ?? 'sites.bagdja.com'),
    };

    const service = new AndroidAppsService(
      websiteRepo as unknown as Repository<Website>,
      androidAppRepo as unknown as Repository<WebsiteAndroidApp>,
      config as unknown as ConfigService,
      storage as unknown as StorageClientService,
      builder as unknown as AndroidBuilderClientService,
      secrets as unknown as KeystoreSecretsService,
    );
    return { service, websiteRepo, androidAppRepo, builder, storage, secrets, app };
  };

  it('does not return build history for another tenant even if Builder response includes it', async () => {
    const { service, builder } = createService({
      jobs: jest.fn().mockResolvedValue([
        {
          id: 'job-1',
          status: 'success',
          progress: 100,
          stage: 'complete',
          platformId: websiteId,
          tenantId: websiteId,
          updatedAt: '2026-01-01T00:00:00.000Z',
          artifactUrl: 'https://storage.example.com/job-1.apk',
          artifactUrlExpiresAt: '2026-01-01T00:15:00.000Z',
          logUrl: null,
          errorMessage: null,
        },
        {
          id: 'job-2',
          status: 'success',
          progress: 100,
          stage: 'complete',
          platformId: 'other-website',
          tenantId: 'other-website',
          updatedAt: '2026-01-01T00:00:00.000Z',
          artifactUrl: 'https://storage.example.com/job-2.apk',
          logUrl: null,
          errorMessage: null,
        },
      ]),
    });

    const result = await service.listBuilds(websiteId);

    expect(builder.listJobs).toHaveBeenCalledWith(websiteId);
    expect(result.map((job) => job.id)).toEqual(['job-1']);
    expect(result[0].artifact_url_expires_at).toBe('2026-01-01T00:15:00.000Z');
  });

  it('fails when the website is not active', async () => {
    const { service, builder } = createService({ website: null });

    await expect(service.listBuilds(websiteId)).rejects.toThrow(NotFoundException);
    expect(builder.listJobs).not.toHaveBeenCalled();
  });

  it('returns only safe configuration and resolves an unverified domain to the platform host', async () => {
    const { service } = createService({
      website: {
        domain: 'unverified.example.com',
        domain_verified_at: null,
      },
    });

    const result = await service.getConfiguration(websiteId);

    expect(result.target_url).toBe('https://shop.sites.bagdja.com');
    expect(result).not.toHaveProperty('store_password_encrypted');
    expect(result).not.toHaveProperty('key_password_encrypted');
  });

  it('uses only a verified custom domain and rejects an invalid verified host', async () => {
    const { service } = createService({
      website: {
        domain: 'shop.example.com',
        domain_verified_at: new Date('2026-01-01T00:00:00.000Z'),
      },
    });
    const result = await service.getConfiguration(websiteId);
    expect(result.target_url).toBe('https://shop.example.com');

    const invalidHost = createService({
      website: {
        domain: 'https://shop.example.com/path',
        domain_verified_at: new Date('2026-01-01T00:00:00.000Z'),
      },
    });
    await expect(invalidHost.service.getConfiguration(websiteId)).rejects.toThrow(
      BadRequestException,
    );
  });

  it('stores signing files privately and keeps passwords out of configuration responses', async () => {
    const { service, storage, secrets, app } = createService();
    const file = {
      buffer: Buffer.from('keystore bytes'),
      size: 14,
      originalname: 'tenant-release.jks',
      mimetype: 'application/octet-stream',
    } as Express.Multer.File;

    const response = await service.uploadKeystore(websiteId, file, {
      alias: 'release-key',
      storePassword: 'store-password',
      keyPassword: 'key-password',
    });

    expect(storage.uploadFile).toHaveBeenCalledWith(
      file.buffer,
      file.mimetype,
      `website-${websiteId}-release.jks`,
      'website-android-keystores',
      false,
    );
    expect(secrets.encrypt).toHaveBeenNthCalledWith(1, 'store-password', websiteId);
    expect(secrets.encrypt).toHaveBeenNthCalledWith(2, 'key-password', websiteId);
    expect(app.keystore_storage_file_id).toBe('private-keystore-file');
    expect(response).toMatchObject({
      has_release_keystore: true,
      keystore_alias: 'release-key',
    });
    expect(response).not.toHaveProperty('store_password_encrypted');
    expect(response).not.toHaveProperty('key_password_encrypted');
  });

  it('does not allow signing files to be uploaded for an inactive website', async () => {
    const { service, storage } = createService({ website: null });
    const file = {
      buffer: Buffer.from('keystore bytes'),
      size: 14,
      originalname: 'tenant-release.jks',
    } as Express.Multer.File;

    await expect(service.uploadKeystore(websiteId, file, {
      alias: 'release-key',
      storePassword: 'store-password',
      keyPassword: 'key-password',
    })).rejects.toThrow(NotFoundException);
    expect(storage.uploadFile).not.toHaveBeenCalled();
  });

  it('retires a release fingerprint so future history sync cannot reactivate it', async () => {
    const fingerprint = 'AA:AA:AA:AA:AA:AA:AA:AA:AA:AA:AA:AA:AA:AA:AA:AA:AA:AA:AA:AA:AA:AA:AA:AA:AA:AA:AA:AA:AA:AA:AA:AA';
    const { service, app, androidAppRepo, builder } = createService({
      jobs: jest.fn().mockResolvedValue([{
        id: 'release-job',
        status: 'success',
        progress: 100,
        stage: 'complete',
        platformId: websiteId,
        tenantId: websiteId,
        buildType: 'release',
        bundleId: 'com.example.shop',
        signingCertSha256: fingerprint,
        updatedAt: '2026-01-01T00:00:00.000Z',
        artifactUrl: null,
        logUrl: null,
        errorMessage: null,
      }]),
    });
    app.release_signing_cert_sha256 = [fingerprint];

    await service.retireSigningFingerprint(websiteId, fingerprint.toLowerCase());
    await service.listBuilds(websiteId);

    expect(app.release_signing_cert_sha256).toEqual([]);
    expect(app.retired_signing_cert_sha256).toEqual([fingerprint]);
    expect(androidAppRepo.save).toHaveBeenCalled();
    expect(builder.listJobs).toHaveBeenCalledWith(websiteId);
  });

  it('locks a package name based on release history before allowing a package change', async () => {
    const releaseJob = {
      id: 'release-job',
      status: 'success',
      progress: 100,
      stage: 'complete',
      platformId: websiteId,
      tenantId: websiteId,
      buildType: 'release' as const,
      bundleId: 'com.example.shop',
      signingCertSha256: 'AA:AA:AA:AA:AA:AA:AA:AA:AA:AA:AA:AA:AA:AA:AA:AA:AA:AA:AA:AA:AA:AA:AA:AA:AA:AA:AA:AA:AA:AA:AA:AA',
      updatedAt: '2026-01-01T00:00:00.000Z',
      artifactUrl: null,
      logUrl: null,
      errorMessage: null,
    };
    const { service, androidAppRepo, app } = createService({
      jobs: jest.fn().mockResolvedValue([releaseJob]),
    });

    await expect(service.updateConfiguration(websiteId, {
      appName: 'Shop',
      packageName: 'com.example.newshop',
    })).rejects.toThrow(ConflictException);
    expect(app.package_name_locked).toBe(true);
    expect(androidAppRepo.save).toHaveBeenCalled();
  });
});
