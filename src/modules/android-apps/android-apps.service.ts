import { createHash } from 'crypto';

import {
  BadGatewayException,
  BadRequestException,
  ConflictException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { Website, WebsiteAndroidApp } from '../../entities';
import { StorageClientService } from '../storage/storage-client.service';

import { AndroidBuilderClientService, AndroidBuilderJob } from './android-builder-client.service';
import { CreateAndroidBuildDto } from './dto/create-android-build.dto';
import { UpdateAndroidAppDto } from './dto/update-android-app.dto';
import { KeystoreSecretsService } from './keystore-secrets.service';

const KEYSTORE_MAX_BYTES = 10 * 1024 * 1024;
const ANDROID_IMAGE_MAX_BYTES = 5 * 1024 * 1024;
const KEYSTORE_URL_TTL_SECONDS = 21_600;
const SHA256_FINGERPRINT = /^(?:[0-9A-F]{2}:){31}[0-9A-F]{2}$/i;
const BUILD_REQUEST_LIMIT_PER_HOUR = 5;
const ACTIVE_BUILD_STATUSES = new Set(['queued', 'building', 'signing', 'uploading']);
const ANDROID_IMAGE_TYPES = new Map([
  ['png', { mimeType: 'image/png', signature: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]) }],
  ['jpg', { mimeType: 'image/jpeg', signature: Buffer.from([0xff, 0xd8, 0xff]) }],
  ['jpeg', { mimeType: 'image/jpeg', signature: Buffer.from([0xff, 0xd8, 0xff]) }],
  ['webp', { mimeType: 'image/webp', signature: Buffer.from('RIFF') }],
]);
const MAX_PLAY_STORE_FINGERPRINTS = 10;
type AndroidImageAsset = 'icon' | 'splash';

export interface AndroidKeystoreInput {
  alias: string;
  storePassword: string;
  keyPassword: string;
}

@Injectable()
export class AndroidAppsService {
  private readonly logger = new Logger(AndroidAppsService.name);

  constructor(
    @InjectRepository(Website)
    private readonly websiteRepo: Repository<Website>,
    @InjectRepository(WebsiteAndroidApp)
    private readonly androidAppRepo: Repository<WebsiteAndroidApp>,
    private readonly config: ConfigService,
    private readonly storage: StorageClientService,
    private readonly builder: AndroidBuilderClientService,
    private readonly secrets: KeystoreSecretsService,
  ) {}

  async getConfiguration(websiteId: string) {
    const website = await this.findActiveWebsite(websiteId);
    const app = await this.androidAppRepo.findOne({ where: { website_id: websiteId } });
    if (!app) throw new NotFoundException('Android app is not configured for this website');
    return {
      ...this.toConfigurationResponse(app),
      target_url: this.resolveTargetUrl(website),
    };
  }

  async updateConfiguration(websiteId: string, dto: UpdateAndroidAppDto) {
    await this.findActiveWebsite(websiteId);
    if (!dto.appName.trim()) throw new BadRequestException('App name cannot be empty');
    const app = await this.androidAppRepo.findOne({ where: { website_id: websiteId } });
    const normalizedPackageName = dto.packageName.trim();
    if (
      app &&
      !app.package_name_locked &&
      app.package_name !== normalizedPackageName
    ) {
      await this.syncReleaseMetadata(app, await this.builder.listJobs(websiteId));
    }
    if (app?.package_name_locked && app.package_name !== normalizedPackageName) {
      throw new ConflictException('Package name cannot be changed after the first successful release build');
    }
    const duplicate = await this.androidAppRepo.findOne({ where: { package_name: normalizedPackageName } });
    if (duplicate && duplicate.website_id !== websiteId) {
      throw new ConflictException('Package name is already in use');
    }

    const record = app ?? this.androidAppRepo.create({ website_id: websiteId });
    record.app_name = dto.appName.trim();
    record.package_name = normalizedPackageName;
    if (dto.versionName !== undefined) {
      if (!dto.versionName.trim()) throw new BadRequestException('Version name cannot be empty');
      record.version_name = dto.versionName.trim();
    }
    if (dto.versionCode !== undefined) record.version_code = dto.versionCode;

    try {
      return this.toConfigurationResponse(await this.androidAppRepo.save(record));
    } catch (error) {
      if (this.isUniqueViolation(error)) {
        throw new ConflictException('Package name is already in use');
      }
      throw error;
    }
  }

  async uploadKeystore(
    websiteId: string,
    file: Express.Multer.File,
    input: AndroidKeystoreInput,
  ) {
    await this.findActiveWebsite(websiteId);
    const app = await this.findConfiguredApp(websiteId, true);
    this.validateKeystore(file, input);
    const encryptedStorePassword = this.secrets.encrypt(input.storePassword, websiteId);
    const encryptedKeyPassword = this.secrets.encrypt(input.keyPassword, websiteId);
    const extension = file.originalname.split('.').pop()?.toLowerCase();
    const filename = `website-${websiteId}-release.${extension}`;
    const uploaded = await this.storage.uploadFile(
      file.buffer,
      file.mimetype || 'application/octet-stream',
      filename,
      'website-android-keystores',
      false,
    );

    const previousFileId = app.keystore_storage_file_id;
    app.keystore_storage_file_id = uploaded.fileId;
    app.keystore_alias = input.alias.trim();
    app.store_password_encrypted = encryptedStorePassword;
    app.key_password_encrypted = encryptedKeyPassword;
    try {
      const saved = await this.androidAppRepo.save(app);
      if (previousFileId && previousFileId !== uploaded.fileId) {
        await this.storage.removeFile(previousFileId).catch((error: unknown) => {
          this.logger.warn(`Old Website Android keystore cleanup failed: ${error instanceof Error ? error.message : 'storage error'}`);
        });
      }
      return this.toConfigurationResponse(saved);
    } catch (error) {
      await this.storage.removeFile(uploaded.fileId).catch((cleanupError: unknown) => {
        this.logger.error(`New Website Android keystore cleanup failed: ${cleanupError instanceof Error ? cleanupError.message : 'storage error'}`);
      });
      if (this.isUniqueViolation(error)) {
        throw new ConflictException('Android app configuration changed while the keystore was being uploaded');
      }
      throw error;
    }
  }

  async uploadImageAsset(websiteId: string, assetType: string, file: Express.Multer.File) {
    await this.findActiveWebsite(websiteId);
    const type = this.assertImageAssetType(assetType);
    this.validateAndroidImage(file);
    const app = await this.findConfiguredApp(websiteId);
    const extension = file.originalname.split('.').pop()?.toLowerCase() ?? '';
    const uploaded = await this.storage.uploadFile(
      file.buffer,
      file.mimetype,
      `website-${websiteId}-android-${type}.${extension}`,
      'website-android-assets',
      true,
    );
    try {
      this.assertHttpsUrl(
        uploaded.url ?? '',
        'Storage service returned a non-HTTPS Android image URL',
      );
    } catch (error) {
      await this.storage.removeFile(uploaded.fileId).catch((cleanupError: unknown) => {
        this.logger.error(`Invalid Website Android ${type} cleanup failed: ${cleanupError instanceof Error ? cleanupError.message : 'storage error'}`);
      });
      throw error;
    }

    const previousFileId = type === 'icon' ? app.icon_storage_file_id : app.splash_storage_file_id;
    if (type === 'icon') {
      app.icon_storage_file_id = uploaded.fileId;
      app.icon_url = uploaded.url;
    } else {
      app.splash_storage_file_id = uploaded.fileId;
      app.splash_image_url = uploaded.url;
    }

    try {
      const saved = await this.androidAppRepo.save(app);
      if (previousFileId && previousFileId !== uploaded.fileId) {
        await this.storage.removeFile(previousFileId).catch((error: unknown) => {
          this.logger.warn(`Old Website Android ${type} cleanup failed: ${error instanceof Error ? error.message : 'storage error'}`);
        });
      }
      return this.toConfigurationResponse(saved);
    } catch (error) {
      await this.storage.removeFile(uploaded.fileId).catch((cleanupError: unknown) => {
        this.logger.error(`New Website Android ${type} cleanup failed: ${cleanupError instanceof Error ? cleanupError.message : 'storage error'}`);
      });
      throw error;
    }
  }

  async removeImageAsset(websiteId: string, assetType: string) {
    await this.findActiveWebsite(websiteId);
    const type = this.assertImageAssetType(assetType);
    const app = await this.findConfiguredApp(websiteId);
    const fileId = type === 'icon' ? app.icon_storage_file_id : app.splash_storage_file_id;
    if (type === 'icon') {
      app.icon_storage_file_id = null;
      app.icon_url = null;
    } else {
      app.splash_storage_file_id = null;
      app.splash_image_url = null;
    }
    const saved = await this.androidAppRepo.save(app);
    if (fileId) {
      await this.storage.removeFile(fileId).catch((error: unknown) => {
        this.logger.error(`Website Android ${type} removal failed: ${error instanceof Error ? error.message : 'storage error'}`);
        throw error;
      });
    }
    return this.toConfigurationResponse(saved);
  }

  async createBuild(websiteId: string, dto: CreateAndroidBuildDto, idempotencyKey: string) {
    if (!idempotencyKey?.trim() || idempotencyKey.length > 255) {
      throw new BadRequestException('A non-empty Idempotency-Key of at most 255 characters is required');
    }
    const website = await this.findActiveWebsite(websiteId);
    const app = await this.findConfiguredApp(websiteId, dto.buildType === 'release');
    if (dto.buildType === 'debug' && dto.outputFormat === 'aab') {
      throw new BadRequestException('Debug builds only support APK output');
    }
    if (dto.buildType === 'release' && !app.keystore_storage_file_id) {
      throw new BadRequestException('Upload a private release keystore before requesting a release build');
    }

    const versionName = dto.versionName?.trim() || app.version_name;
    const versionCode = dto.versionCode ?? app.version_code;
    const payload: Record<string, unknown> = {
      appName: app.app_name,
      bundleId: app.package_name,
      targetUrl: this.resolveTargetUrl(website),
      iconUrl: app.icon_url ?? undefined,
      splashImageUrl: app.splash_image_url ?? undefined,
      buildConfig: {
        environment: dto.buildType === 'debug' ? 'dev' : 'prod',
        versionName,
        versionCode,
        buildType: dto.buildType,
        outputFormat: dto.outputFormat,
      },
    };

    if (dto.buildType === 'release') {
      if (!app.store_password_encrypted || !app.key_password_encrypted || !app.keystore_alias) {
        throw new BadRequestException('Release keystore passwords are not configured');
      }
      const access = await this.storage.getAccessUrl(app.keystore_storage_file_id!, KEYSTORE_URL_TTL_SECONDS);
      this.assertHttpsUrl(access.url, 'Storage service returned a non-HTTPS keystore URL');
      payload.signing = {
        fileUrl: access.url,
        alias: app.keystore_alias,
        storePassword: this.secrets.decrypt(app.store_password_encrypted, websiteId),
        keyPassword: this.secrets.decrypt(app.key_password_encrypted, websiteId),
      };
    }

    const normalizedIdempotencyKey = idempotencyKey.trim();
    const scopedIdempotencyKey = createHash('sha256')
      .update(`${websiteId}:${normalizedIdempotencyKey}`)
      .digest('hex');
    const buildRequest = {
      websiteId,
      idempotencyKey: scopedIdempotencyKey,
      payload,
    };
    const result = await this.androidAppRepo.manager.transaction(async (manager) => {
      const lockedApps: Array<{ id: string }> = await manager.query(
        'SELECT id FROM website_android_apps WHERE website_id = $1 FOR UPDATE',
        [websiteId],
      );
      if (lockedApps.length === 0) {
        throw new NotFoundException('Android app is not configured for this website');
      }

      await manager.query(
        `DELETE FROM website_android_build_requests
         WHERE website_id = $1 AND created_at < NOW() - INTERVAL '24 hours'`,
        [websiteId],
      );
      await manager.query(`
        WITH expired_requests AS (
          SELECT id
          FROM website_android_build_requests
          WHERE created_at < NOW() - INTERVAL '24 hours'
          ORDER BY created_at
          LIMIT 500
          FOR UPDATE SKIP LOCKED
        )
        DELETE FROM website_android_build_requests AS requests
        USING expired_requests
        WHERE requests.id = expired_requests.id
      `);

      const existingRequests: Array<{ builder_job_id: string }> = await manager.query(
        `SELECT builder_job_id
         FROM website_android_build_requests
         WHERE website_id = $1 AND idempotency_key = $2`,
        [websiteId, scopedIdempotencyKey],
      );
      if (existingRequests.length > 0) {
        const jobs = await this.builder.listJobs(websiteId);
        const existingJob = jobs.find(
          (job) =>
            job.id === existingRequests[0].builder_job_id &&
            job.platformId === websiteId &&
            job.tenantId === websiteId,
        );
        if (!existingJob) {
          throw new ConflictException('The previous build is no longer available in Builder history');
        }
        return {
          jobId: existingJob.id,
          status: existingJob.status,
          progress: existingJob.progress,
          stage: existingJob.stage ?? undefined,
          createdAt: existingJob.createdAt,
        };
      }

      const jobs = await this.builder.listJobs(websiteId);
      const hasActiveBuild = jobs.some(
        (job) =>
          job.platformId === websiteId &&
          job.tenantId === websiteId &&
          ACTIVE_BUILD_STATUSES.has(job.status),
      );
      if (hasActiveBuild) {
        throw new ConflictException('A build is already active for this website');
      }

      const requestCounts: Array<{ count: number | string }> = await manager.query(
        `SELECT COUNT(*)::integer AS count
         FROM website_android_build_requests
         WHERE website_id = $1 AND created_at > NOW() - INTERVAL '1 hour'`,
        [websiteId],
      );
      if (Number(requestCounts[0]?.count ?? 0) >= BUILD_REQUEST_LIMIT_PER_HOUR) {
        throw new HttpException(
          `This website has reached the limit of ${BUILD_REQUEST_LIMIT_PER_HOUR} new builds per hour`,
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }

      const acceptedBuild = await this.builder.enqueue(buildRequest);
      await manager.query(
        `INSERT INTO website_android_build_requests (website_id, idempotency_key, builder_job_id)
         VALUES ($1, $2, $3)`,
        [websiteId, scopedIdempotencyKey, acceptedBuild.jobId],
      );
      return acceptedBuild;
    });
    return {
      id: result.jobId,
      status: result.status ?? 'queued',
      progress: result.progress ?? 0,
      stage: result.stage ?? 'queued',
      build_type: dto.buildType,
      output_format: dto.outputFormat,
      bundle_id: app.package_name,
      created_at: result.createdAt ?? new Date().toISOString(),
    };
  }

  async listBuilds(websiteId: string) {
    await this.findActiveWebsite(websiteId);
    const app = await this.findConfiguredApp(websiteId);
    const jobs = await this.builder.listJobs(websiteId);
    await this.syncReleaseMetadata(app, jobs);
    return jobs
      .filter((job) => job.platformId === websiteId && job.tenantId === websiteId)
      .map((job) => this.toBuildResponse(job));
  }

  async getBuild(websiteId: string, jobId: string) {
    const jobs = await this.listBuilds(websiteId);
    const job = jobs.find((candidate) => candidate.id === jobId);
    if (!job) throw new NotFoundException('Build job not found for this website');
    return job;
  }

  async retireSigningFingerprint(websiteId: string, fingerprint: string) {
    await this.findActiveWebsite(websiteId);
    const normalizedFingerprint = fingerprint?.trim().toUpperCase();
    if (!normalizedFingerprint || !SHA256_FINGERPRINT.test(normalizedFingerprint)) {
      throw new BadRequestException('fingerprint must be a SHA-256 certificate fingerprint');
    }

    const app = await this.findConfiguredApp(websiteId);
    const releaseFingerprints = app.release_signing_cert_sha256 ?? [];
    const playStoreFingerprints = app.play_store_signing_cert_sha256 ?? [];
    if (
      !releaseFingerprints.some((value) => value.toUpperCase() === normalizedFingerprint) &&
      !playStoreFingerprints.some((value) => value.toUpperCase() === normalizedFingerprint)
    ) {
      throw new NotFoundException('Active signing fingerprint not found');
    }

    app.release_signing_cert_sha256 = releaseFingerprints.filter(
      (value) => value.toUpperCase() !== normalizedFingerprint,
    );
    app.play_store_signing_cert_sha256 = playStoreFingerprints.filter(
      (value) => value.toUpperCase() !== normalizedFingerprint,
    );
    app.retired_signing_cert_sha256 = [...new Set([
      ...(app.retired_signing_cert_sha256 ?? []).map((value) => value.toUpperCase()),
      normalizedFingerprint,
    ])];
    return this.toConfigurationResponse(await this.androidAppRepo.save(app));
  }

  async addPlayStoreFingerprints(websiteId: string, fingerprints: string[]) {
    await this.findActiveWebsite(websiteId);
    if (!Array.isArray(fingerprints) || fingerprints.length === 0) {
      throw new BadRequestException('At least one Google Play signing fingerprint is required');
    }
    const normalized = fingerprints.map((fingerprint) => fingerprint?.trim().toUpperCase());
    if (normalized.some((fingerprint) => !fingerprint || !SHA256_FINGERPRINT.test(fingerprint))) {
      throw new BadRequestException('Each value must be a SHA-256 certificate fingerprint');
    }

    const app = await this.findConfiguredApp(websiteId);
    const current = app.play_store_signing_cert_sha256 ?? [];
    const additions = [...new Set(normalized)].filter(
      (fingerprint) => !current.some((existing) => existing.toUpperCase() === fingerprint),
    );
    const nextPlayStoreFingerprints = new Set(
      [...current, ...additions].map((fingerprint) => fingerprint.toUpperCase()),
    );
    if (nextPlayStoreFingerprints.size > MAX_PLAY_STORE_FINGERPRINTS) {
      throw new BadRequestException(
        `A maximum of ${MAX_PLAY_STORE_FINGERPRINTS} Google Play signing fingerprints is supported`,
      );
    }

    const retired = new Set(
      (app.retired_signing_cert_sha256 ?? [])
        .map((fingerprint) => fingerprint.toUpperCase())
        .filter((fingerprint) => !normalized.includes(fingerprint)),
    );
    app.play_store_signing_cert_sha256 = [...nextPlayStoreFingerprints];
    app.retired_signing_cert_sha256 = [...retired];
    return this.toConfigurationResponse(await this.androidAppRepo.save(app));
  }

  private async findActiveWebsite(websiteId: string): Promise<Website> {
    const website = await this.websiteRepo.findOne({ where: { id: websiteId, is_active: true } });
    if (!website) throw new NotFoundException('Active website not found');
    return website;
  }

  private async findConfiguredApp(websiteId: string, includeSecrets = false): Promise<WebsiteAndroidApp> {
    const query = this.androidAppRepo.createQueryBuilder('androidApp')
      .where('androidApp.website_id = :websiteId', { websiteId });
    if (includeSecrets) {
      query.addSelect([
        'androidApp.store_password_encrypted',
        'androidApp.key_password_encrypted',
      ]);
    }
    const app = await query.getOne();
    if (!app) throw new NotFoundException('Android app is not configured for this website');
    return app;
  }

  private validateKeystore(file: Express.Multer.File, input: AndroidKeystoreInput): void {
    if (!file?.buffer?.length) throw new BadRequestException('Keystore file is required');
    if (file.size > KEYSTORE_MAX_BYTES || file.buffer.length > KEYSTORE_MAX_BYTES) {
      throw new BadRequestException('Keystore file must not exceed 10 MB');
    }
    const extension = file.originalname.split('.').pop()?.toLowerCase();
    if (!extension || !['jks', 'p12', 'pfx'].includes(extension)) {
      throw new BadRequestException('Keystore file must use .jks, .p12, or .pfx extension');
    }
    if (!input.alias?.trim() || input.alias.trim().length > 255) {
      throw new BadRequestException('Keystore alias is required and must not exceed 255 characters');
    }
    if (!input.storePassword || input.storePassword.length > 512 || !input.keyPassword || input.keyPassword.length > 512) {
      throw new BadRequestException('Store and key passwords are required and must not exceed 512 characters');
    }
  }

  private assertImageAssetType(assetType: string): AndroidImageAsset {
    if (assetType !== 'icon' && assetType !== 'splash') {
      throw new BadRequestException('Android image asset must be icon or splash');
    }
    return assetType;
  }

  private validateAndroidImage(file: Express.Multer.File): void {
    if (!file?.buffer?.length || file.size > ANDROID_IMAGE_MAX_BYTES || file.buffer.length > ANDROID_IMAGE_MAX_BYTES) {
      throw new BadRequestException('Android image must not exceed 5 MB');
    }
    const extension = file.originalname.split('.').pop()?.toLowerCase() ?? '';
    const imageType = ANDROID_IMAGE_TYPES.get(extension);
    if (!imageType || file.mimetype !== imageType.mimeType) {
      throw new BadRequestException('Android image must be a matching PNG, JPEG, or WebP file');
    }
    const hasSignature = extension === 'webp'
      ? file.buffer.subarray(0, 4).equals(imageType.signature) &&
        file.buffer.subarray(8, 12).toString('ascii') === 'WEBP'
      : file.buffer.subarray(0, imageType.signature.length).equals(imageType.signature);
    if (!hasSignature) {
      throw new BadRequestException('Android image content does not match its file type');
    }
  }

  private resolveTargetUrl(website: Website): string {
    if (website.domain && website.domain_verified_at) {
      return `https://${this.normalizeHost(website.domain, 'Verified website domain')}`;
    }
    const platformHost = this.configPlatformHost();
    return `https://${this.normalizeHost(`${website.slug}.${platformHost}`, 'Website platform domain')}`;
  }

  private normalizeHost(value: string, label: string): string {
    const input = value.trim().replace(/\.$/, '').toLowerCase();
    let parsed: URL;
    try {
      parsed = new URL(`https://${input}`);
    } catch {
      throw new BadRequestException(`${label} is invalid`);
    }
    if (
      parsed.hostname !== input ||
      parsed.username ||
      parsed.password ||
      parsed.port ||
      parsed.pathname !== '/' ||
      parsed.search ||
      parsed.hash
    ) {
      throw new BadRequestException(`${label} must be a hostname without a path or port`);
    }
    return parsed.hostname;
  }

  private configPlatformHost(): string {
    const value = this.config.get<string>('PLATFORM_HOST', 'sites.bagdja.com');
    return this.normalizeHost(value, 'PLATFORM_HOST');
  }

  private assertHttpsUrl(value: string, message: string): void {
    try {
      const url = new URL(value);
      if (url.protocol === 'https:' && !url.username && !url.password) return;
    } catch {
      throw new BadGatewayException(message);
    }
    throw new BadGatewayException(message);
  }

  private async syncReleaseMetadata(app: WebsiteAndroidApp, jobs: AndroidBuilderJob[]): Promise<void> {
    const fingerprints = new Set(app.release_signing_cert_sha256 ?? []);
    const retiredFingerprints = new Set(
      (app.retired_signing_cert_sha256 ?? []).map((fingerprint) => fingerprint.toUpperCase()),
    );
    let locked = app.package_name_locked;
    for (const job of jobs) {
      if (
        job.status !== 'success' ||
        job.buildType !== 'release' ||
        job.bundleId !== app.package_name ||
        !job.signingCertSha256
      ) {
        continue;
      }
      locked = true;
      if (SHA256_FINGERPRINT.test(job.signingCertSha256)) {
        const fingerprint = job.signingCertSha256.toUpperCase();
        if (!retiredFingerprints.has(fingerprint)) fingerprints.add(fingerprint);
      } else {
        this.logger.warn(`TWA Builder returned an invalid signing fingerprint for job ${job.id}`);
      }
    }
    const nextFingerprints = [...fingerprints].slice(0, 10);
    if (
      locked !== app.package_name_locked ||
      nextFingerprints.length !== (app.release_signing_cert_sha256 ?? []).length ||
      nextFingerprints.some((fingerprint, index) => fingerprint !== app.release_signing_cert_sha256[index])
    ) {
      app.package_name_locked = locked;
      app.release_signing_cert_sha256 = nextFingerprints;
      await this.androidAppRepo.save(app);
    }
  }

  private toConfigurationResponse(app: WebsiteAndroidApp) {
    return {
      id: app.id,
      website_id: app.website_id,
      app_name: app.app_name,
      package_name: app.package_name,
      version_name: app.version_name,
      version_code: app.version_code,
      package_name_locked: app.package_name_locked,
      has_release_keystore: Boolean(app.keystore_storage_file_id),
      keystore_alias: app.keystore_alias,
      icon_url: app.icon_url,
      splash_image_url: app.splash_image_url,
      release_signing_cert_sha256: app.release_signing_cert_sha256 ?? [],
      play_store_signing_cert_sha256: app.play_store_signing_cert_sha256 ?? [],
      retired_signing_cert_sha256: app.retired_signing_cert_sha256 ?? [],
      created_at: app.created_at,
      updated_at: app.updated_at,
    };
  }

  private toBuildResponse(job: AndroidBuilderJob) {
    return {
      id: job.id,
      status: job.status,
      progress: job.progress,
      stage: job.stage,
      build_type: job.buildType ?? null,
      output_format: job.outputFormat ?? null,
      bundle_id: job.bundleId ?? null,
      signing_cert_sha256: job.signingCertSha256 ?? null,
      artifact_url: job.artifactUrl,
      artifact_url_expires_at: job.artifactUrlExpiresAt ?? null,
      log_url: job.logUrl,
      error_message: job.errorMessage,
      created_at: job.createdAt ?? job.updatedAt,
      started_at: job.startedAt ?? null,
      finished_at: job.finishedAt ?? null,
      updated_at: job.updatedAt,
    };
  }

  private isUniqueViolation(error: unknown): boolean {
    return Boolean(
      error &&
      typeof error === 'object' &&
      'code' in error &&
      (error as { code?: string }).code === '23505',
    );
  }
}
