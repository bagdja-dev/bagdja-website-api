import {
  Controller,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
  Body,
  BadRequestException,
  Headers,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiForbiddenResponse,
  ApiHeader,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';

import { JwtAuthGuard, CurrentUser, AuthUser } from '../../common/auth';
import { UploadsService } from './uploads.service';
import {
  CreateVideoUploadTicketDto,
  VIDEO_UPLOAD_MAX_BYTES,
  VideoUploadResultDto,
  VideoUploadTicketResponseDto,
} from './dto/video-upload.dto';

@ApiTags('Uploads')
@Controller('api/uploads')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class UploadsController {
  constructor(private readonly uploadsService: UploadsService) {}

  @Post('logo')
  @ApiOperation({ summary: 'Upload website logo to bagdja-storage-service' })
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
      limits: { fileSize: 100 * 1024 * 1024 },
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
  @ApiOperation({ summary: 'Upload website asset (gallery, etc.) to bagdja-storage-service' })
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

/**
 * Unggah video produk (maks. 15 MB) tanpa lewat route Vercel Studio (batas body ±4,5 MB):
 * 1) Studio (lewat proxy, berlogin) → POST /api/uploads/video/ticket
 * 2) Browser → POST /api/uploads/video (multipart, header X-Upload-Ticket) → bagdja-storage-service.
 * Kelas terpisah karena endpoint unggah memakai tiket, bukan JwtAuthGuard kelas UploadsController.
 */
@ApiTags('Uploads')
@Controller('api/uploads/video')
export class VideoUploadsController {
  constructor(private readonly uploadsService: UploadsService) {}

  @Post('ticket')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create a short-lived ticket for a direct product video upload' })
  @ApiOkResponse({
    type: VideoUploadTicketResponseDto,
    description: 'Tiket 10 menit untuk satu website; dipakai sebagai header X-Upload-Ticket pada POST /api/uploads/video.',
  })
  @ApiForbiddenResponse({ description: 'Bukan staf aktif website ini.' })
  createTicket(@CurrentUser() user: AuthUser, @Body() dto: CreateVideoUploadTicketDto) {
    return this.uploadsService.createVideoUploadTicket(user, dto.website_id);
  }

  @Post()
  @ApiOperation({
    summary: 'Upload a product video (max 15 MB) to bagdja-storage-service using an upload ticket',
    description: 'Tanpa Bearer token — otorisasi lewat header `X-Upload-Ticket` dari POST /api/uploads/video/ticket.',
  })
  @ApiHeader({ name: 'X-Upload-Ticket', required: true, description: 'Tiket dari POST /api/uploads/video/ticket.' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { file: { type: 'string', format: 'binary', description: 'MP4, WebM, atau MOV, maks. 15 MB.' } },
      required: ['file'],
    },
  })
  @ApiOkResponse({ type: VideoUploadResultDto, description: 'URL publik video untuk disimpan di video_urls produk.' })
  @ApiUnauthorizedResponse({ description: 'Tiket tidak valid atau kedaluwarsa.' })
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: VIDEO_UPLOAD_MAX_BYTES } }))
  upload(@Headers('x-upload-ticket') ticket: string | undefined, @UploadedFile() file?: Express.Multer.File) {
    return this.uploadsService.uploadVideoWithTicket(ticket, file);
  }
}
