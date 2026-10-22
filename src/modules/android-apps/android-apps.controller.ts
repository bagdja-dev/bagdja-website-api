import {
  BadRequestException,
  Body,
  Controller,
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
import { ApiBearerAuth, ApiConsumes, ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';

import {
  JwtAuthGuard,
  Roles,
  RolesGuard,
  TenantStaffGuard,
} from '../../common/auth';

import { AndroidAppsService } from './android-apps.service';
import { CreateAndroidBuildDto } from './dto/create-android-build.dto';
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
  getConfiguration(@Param('websiteId') websiteId: string) {
    return this.androidApps.getConfiguration(websiteId);
  }

  @Put()
  @Roles('admin')
  @ApiOperation({ summary: 'Create or update Android app configuration for a website' })
  updateConfiguration(
    @Param('websiteId') websiteId: string,
    @Body() dto: UpdateAndroidAppDto,
  ) {
    return this.androidApps.updateConfiguration(websiteId, dto);
  }

  @Post('keystore')
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

  @Post('builds')
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
}
