import {
  BadRequestException,
  ConflictException,
  HttpStatus,
  NotFoundException,
} from '@nestjs/common';
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
    icon_storage_file_id: null,
    icon_url: null,
    splash_storage_file_id: null,
    splash_image_url: null,
    keystore_alias: null,
    store_password_encrypted: null,
    key_password_encrypted: null,
    release_signing_cert_sha256: [],
    retired_signing_cert_sha256: [],
    play_store_signing_cert_sha256: [],
    created_at: new Date('2026-01-01T00:00:00.000Z'),
    updated_at: new Date('2026-01-01T00:00:00.000Z'),
  });

  const createService = (overrides: {
    website?: Partial<Website> | null;
    jobs?: AndroidBuilderClientService['listJobs'];
    idempotencyFound?: boolean;
    requestCount?: number;
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
    const transactionManager = {
      query: jest.fn().mockImplementation(async (query: string) => {
        if (query.includes('FROM website_android_apps') && query.includes('FOR UPDATE')) {
          return [{ id: app.id }];
        }
        if (query.includes('SELECT builder_job_id')) {
          return overrides.idempotencyFound ? [{ builder_job_id: 'job-previous' }] : [];
        }
        if (query.includes('COUNT(*)')) {
          return [{ count: overrides.requestCount ?? 0 }];
        }
        return [];
      }),
    };
    const database = {
      transaction: jest.fn(
        async (callback: (manager: typeof transactionManager) => Promise<unknown>) =>
          callback(transactionManager),
      ),
    };
    const androidAppRepo = {
      findOne: jest.fn().mockResolvedValue(app),
      createQueryBuilder: jest.fn().mockReturnValue(queryBuilder),
      save: jest.fn().mockImplementation(async (value) => value),
      manager: database,
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
      enqueue: jest.fn().mockResolvedValue({
        jobId: 'job-1',
        status: 'queued',
        progress: 0,
        stage: 'queued',
      }),
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
    return {
      service,
      websiteRepo,
      androidAppRepo,
      builder,
      storage,
      secrets,
      app,
      transactionManager,
      database,
    };
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

  it('admits a build and records the idempotency key under a per-website database lock', async () => {
    const { service, builder, transactionManager, database } = createService();

    const result = await service.createBuild(
      websiteId,
      { buildType: 'debug', outputFormat: 'apk' },
      'build-key-1',
    );

    expect(result.id).toBe('job-1');
    expect(database.transaction).toHaveBeenCalledTimes(1);
    expect(transactionManager.query).toHaveBeenCalledWith(
      expect.stringContaining('FOR UPDATE'),
      [websiteId],
    );
    expect(transactionManager.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO website_android_build_requests'),
      [websiteId, expect.stringMatching(/^[a-f0-9]{64}$/), 'job-1'],
    );
    expect(builder.enqueue).toHaveBeenCalledTimes(1);
    expect(builder.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({ idempotencyKey: expect.stringMatching(/^[a-f0-9]{64}$/) }),
    );
  });

  it('passes configured Android icon and splash URLs to TWA Builder', async () => {
    const { service, builder, app } = createService();
    app.icon_url = 'https://storage.example.com/app-icon.png';
    app.splash_image_url = 'https://storage.example.com/splash.png';

    await service.createBuild(
      websiteId,
      { buildType: 'debug', outputFormat: 'apk' },
      'assets-build-key',
    );

    expect(builder.enqueue).toHaveBeenCalledWith(expect.objectContaining({
      payload: expect.objectContaining({
        iconUrl: 'https://storage.example.com/app-icon.png',
        splashImageUrl: 'https://storage.example.com/splash.png',
      }),
    }));
  });

  it('does not count an idempotent retry as a new build request', async () => {
    const { service, builder, transactionManager } = createService({
      idempotencyFound: true,
      jobs: jest.fn().mockResolvedValue([
        {
          id: 'job-previous',
          status: 'success',
          progress: 100,
          stage: 'complete',
          platformId: websiteId,
          tenantId: websiteId,
          updatedAt: '2026-01-01T00:00:00.000Z',
          artifactUrl: null,
          logUrl: null,
          errorMessage: null,
        },
      ]),
    });

    await service.createBuild(
      websiteId,
      { buildType: 'debug', outputFormat: 'apk' },
      'build-key-1',
    );

    expect(builder.enqueue).not.toHaveBeenCalled();
    expect(builder.listJobs).toHaveBeenCalledWith(websiteId);
    expect(transactionManager.query).not.toHaveBeenCalledWith(
      expect.stringContaining('COUNT(*)'),
      expect.anything(),
    );
    expect(transactionManager.query).not.toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO website_android_build_requests'),
      expect.anything(),
    );
  });

  it('does not create a duplicate if an idempotent build has aged out of Builder history', async () => {
    const { service, builder } = createService({ idempotencyFound: true });

    await expect(
      service.createBuild(websiteId, { buildType: 'debug', outputFormat: 'apk' }, 'build-key-1'),
    ).rejects.toThrow(ConflictException);
    expect(builder.enqueue).not.toHaveBeenCalled();
  });

  it('rejects a second build while another build is active for the website', async () => {
    const { service, builder } = createService({
      jobs: jest.fn().mockResolvedValue([
        {
          id: 'active-job',
          status: 'signing',
          progress: 60,
          stage: 'release_signing',
          platformId: websiteId,
          tenantId: websiteId,
          updatedAt: '2026-01-01T00:00:00.000Z',
          artifactUrl: null,
          logUrl: null,
          errorMessage: null,
        },
      ]),
    });

    await expect(
      service.createBuild(websiteId, { buildType: 'debug', outputFormat: 'apk' }, 'build-key-2'),
    ).rejects.toThrow(ConflictException);
    expect(builder.enqueue).not.toHaveBeenCalled();
  });

  it('rejects a sixth new build request within one hour', async () => {
    const { service, builder } = createService({ requestCount: 5 });

    await expect(
      service.createBuild(websiteId, { buildType: 'debug', outputFormat: 'apk' }, 'build-key-6'),
    ).rejects.toMatchObject({
      status: HttpStatus.TOO_MANY_REQUESTS,
    });
    expect(builder.enqueue).not.toHaveBeenCalled();
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

  it('uploads app images publicly for the Builder and saves their URLs per website', async () => {
    const { service, storage, app } = createService();
    storage.uploadFile.mockResolvedValue({
      fileId: 'public-icon-file',
      url: 'https://storage.example.com/icon.png',
    });
    const file = {
      buffer: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      size: 8,
      originalname: 'app-icon.png',
      mimetype: 'image/png',
    } as Express.Multer.File;

    const result = await service.uploadImageAsset(websiteId, 'icon', file);

    expect(storage.uploadFile).toHaveBeenCalledWith(
      file.buffer,
      'image/png',
      `website-${websiteId}-android-icon.png`,
      'website-android-assets',
      true,
    );
    expect(app.icon_storage_file_id).toBe('public-icon-file');
    expect(app.icon_url).toBe('https://storage.example.com/icon.png');
    expect(result.icon_url).toBe('https://storage.example.com/icon.png');
  });

  it('rejects image data whose signature does not match the extension', async () => {
    const { service, storage } = createService();
    const invalidImage = {
      buffer: Buffer.from('not an image'),
      size: 12,
      originalname: 'app-icon.png',
      mimetype: 'image/png',
    } as Express.Multer.File;

    await expect(service.uploadImageAsset(websiteId, 'icon', invalidImage)).rejects.toThrow(
      BadRequestException,
    );
    expect(storage.uploadFile).not.toHaveBeenCalled();
  });

  it('removes the saved app icon and its public Storage object', async () => {
    const { service, storage, app } = createService();
    app.icon_storage_file_id = 'old-icon-file';
    app.icon_url = 'https://storage.example.com/old-icon.png';

    const result = await service.removeImageAsset(websiteId, 'icon');

    expect(storage.removeFile).toHaveBeenCalledWith('old-icon-file');
    expect(app.icon_storage_file_id).toBeNull();
    expect(app.icon_url).toBeNull();
    expect(result.icon_url).toBeNull();
  });

  it('adds Google Play App Signing fingerprints for Digital Asset Links', async () => {
    const { service, app } = createService();
    const fingerprint = 'AA:AA:AA:AA:AA:AA:AA:AA:AA:AA:AA:AA:AA:AA:AA:AA:AA:AA:AA:AA:AA:AA:AA:AA:AA:AA:AA:AA:AA:AA:AA:AA';
    app.retired_signing_cert_sha256 = [fingerprint];

    const result = await service.addPlayStoreFingerprints(websiteId, [fingerprint.toLowerCase()]);

    expect(app.play_store_signing_cert_sha256).toEqual([fingerprint]);
    expect(app.retired_signing_cert_sha256).toEqual([]);
    expect(result.play_store_signing_cert_sha256).toEqual([fingerprint]);
  });

  it('rejects invalid Google Play fingerprints', async () => {
    const { service, app } = createService();

    await expect(service.addPlayStoreFingerprints(websiteId, ['invalid'])).rejects.toThrow(
      BadRequestException,
    );
    expect(app.play_store_signing_cert_sha256).toEqual([]);
  });

  it('limits Google Play signing fingerprints to ten entries', async () => {
    const { service, app } = createService();
    const fingerprints = Array.from({ length: 11 }, (_, index) =>
      Array.from({ length: 32 }, () => index.toString(16).padStart(2, '0').toUpperCase()).join(':'),
    );

    await expect(service.addPlayStoreFingerprints(websiteId, fingerprints)).rejects.toThrow(
      BadRequestException,
    );
    expect(app.play_store_signing_cert_sha256).toEqual([]);
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
