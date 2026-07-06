import {
  Controller,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
  Body,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';

import { JwtAuthGuard, CurrentUser, AuthUser } from '../../common/auth';
import { UploadsService } from './uploads.service';

@ApiTags('Uploads')
@Controller('api/uploads')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class UploadsController {
  constructor(private readonly uploadsService: UploadsService) {}

  @Post('logo')
  @ApiOperation({ summary: 'Upload website logo to Supabase Storage' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary' },
        website_id: { type: 'string', format: 'uuid', description: 'Optional — untuk website yang sudah ada' },
      },
      required: ['file'],
    },
  })
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 5 * 1024 * 1024 },
    }),
  )
  async uploadLogo(
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: AuthUser,
    @Body('website_id') websiteId?: string,
  ) {
    if (!file) {
      throw new BadRequestException('File logo wajib diunggah');
    }

    return this.uploadsService.uploadLogo(user, file, websiteId || undefined);
  }

  @Post('asset')
  @ApiOperation({ summary: 'Upload website asset (gallery, etc.) to Supabase Storage' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary' },
        website_id: { type: 'string', format: 'uuid' },
        folder: { type: 'string', description: 'Subfolder, default: assets' },
      },
      required: ['file'],
    },
  })
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 5 * 1024 * 1024 },
    }),
  )
  async uploadAsset(
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: AuthUser,
    @Body('website_id') websiteId?: string,
    @Body('folder') folder?: string,
  ) {
    if (!file) {
      throw new BadRequestException('File wajib diunggah');
    }

    return this.uploadsService.uploadAsset(user, file, websiteId || undefined, folder || undefined);
  }
}
