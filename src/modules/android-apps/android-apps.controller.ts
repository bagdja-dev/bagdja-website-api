import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Param,
  Post,
  Put,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiHeader, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import {
  JwtAuthGuard,
  Roles,
  RolesGuard,
  TenantStaffGuard,
} from '../../common/auth';

import { AndroidAppsEnabledGuard } from './android-apps-enabled.guard';
import { AndroidAppsService } from './android-apps.service';
import { CreateAndroidBuildDto } from './dto/create-android-build.dto';
import { AndroidAppConfigurationResponseDto } from './dto/android-app-configuration-response.dto';
import { UpdateAndroidAppDto } from './dto/update-android-app.dto';

@ApiTags('Website Android Apps')
@ApiBearerAuth()
@Controller('api/websites/:websiteId/android-app')
@UseGuards(JwtAuthGuard, TenantStaffGuard, RolesGuard)
export class AndroidAppsController {
  constructor(private readonly androidApps: AndroidAppsService) {}

  @Get()
  @Roles('admin')
  @ApiOperation({ summary: 'Get Android app configuration for a website' })
  @ApiOkResponse({ type: AndroidAppConfigurationResponseDto, description: 'Konfigurasi app Android termasuk tampilan (warna, mode tampilan) dan target_url hasil resolusi domain.' })
  getConfiguration(@Param('websiteId') websiteId: string) {
    return this.androidApps.getConfiguration(websiteId);
  }

  @Put()
  @UseGuards(AndroidAppsEnabledGuard)
  @Roles('admin')
  @ApiOperation({ summary: 'Create or update Android app configuration for a website' })
  @ApiOkResponse({ type: AndroidAppConfigurationResponseDto, description: 'Konfigurasi tersimpan (tanpa target_url).' })
  updateConfiguration(
    @Param('websiteId') websiteId: string,
    @Body() dto: UpdateAndroidAppDto,
  ) {
    return this.androidApps.updateConfiguration(websiteId, dto);
  }

  @Post('keystore')
  @UseGuards(AndroidAppsEnabledGuard)
  @Roles('admin')
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Upload a private Android release keystore' })
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 10 * 1024 * 1024 } }))
  uploadKeystore(
    @Param('websiteId') websiteId: string,
    @UploadedFile() file: Express.Multer.File,
    @Body('alias') alias: string,
    @Body('storePassword') storePassword: string,
    @Body('keyPassword') keyPassword: string,
  ) {
    if (!file) throw new BadRequestException('Keystore file is required');
    return this.androidApps.uploadKeystore(websiteId, file, { alias, storePassword, keyPassword });
  }

  @Post('assets/:assetType')
  @UseGuards(AndroidAppsEnabledGuard)
  @Roles('admin')
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Upload a public Android app icon or splash image' })
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 5 * 1024 * 1024 } }))
  uploadImageAsset(
    @Param('websiteId') websiteId: string,
    @Param('assetType') assetType: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) throw new BadRequestException('Android image file is required');
    return this.androidApps.uploadImageAsset(websiteId, assetType, file);
  }

  @Delete('assets/:assetType')
  @UseGuards(AndroidAppsEnabledGuard)
  @Roles('admin')
  @ApiOperation({ summary: 'Remove a website Android app icon or splash image' })
  removeImageAsset(
    @Param('websiteId') websiteId: string,
    @Param('assetType') assetType: string,
  ) {
    return this.androidApps.removeImageAsset(websiteId, assetType);
  }

  @Post('builds')
  @UseGuards(AndroidAppsEnabledGuard)
  @Roles('admin')
  @ApiHeader({
    name: 'Idempotency-Key',
    description: 'Unique key for this build request; reuse it when retrying the same request.',
    required: true,
  })
  @ApiOperation({ summary: 'Create an APK or AAB build for this website' })
  createBuild(
    @Param('websiteId') websiteId: string,
    @Headers('idempotency-key') idempotencyKey: string,
    @Body() dto: CreateAndroidBuildDto,
  ) {
    return this.androidApps.createBuild(websiteId, dto, idempotencyKey);
  }

  @Get('builds')
  @Roles('admin')
  @ApiOperation({ summary: 'List recent Android builds for this website' })
  listBuilds(@Param('websiteId') websiteId: string) {
    return this.androidApps.listBuilds(websiteId);
  }

  @Get('builds/:jobId')
  @Roles('admin')
  @ApiOperation({ summary: 'Get a recent Android build scoped to this website' })
  getBuild(
    @Param('websiteId') websiteId: string,
    @Param('jobId') jobId: string,
  ) {
    return this.androidApps.getBuild(websiteId, jobId);
  }

  @Delete('signing-fingerprints')
  @UseGuards(AndroidAppsEnabledGuard)
  @Roles('admin')
  @ApiOperation({ summary: 'Retire a release signing fingerprint from Digital Asset Links' })
  retireSigningFingerprint(
    @Param('websiteId') websiteId: string,
    @Body('fingerprint') fingerprint: string,
  ) {
    return this.androidApps.retireSigningFingerprint(websiteId, fingerprint);
  }

  @Post('signing-fingerprints')
  @UseGuards(AndroidAppsEnabledGuard)
  @Roles('admin')
  @ApiOperation({ summary: 'Add Google Play App Signing SHA-256 fingerprints to Digital Asset Links' })
  addPlayStoreFingerprints(
    @Param('websiteId') websiteId: string,
    @Body('fingerprints') fingerprints: string[],
  ) {
    return this.androidApps.addPlayStoreFingerprints(websiteId, fingerprints);
  }
}
