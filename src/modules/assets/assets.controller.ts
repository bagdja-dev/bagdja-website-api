import {
  Body,
  BadRequestException,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';

import {
  AuthUser,
  CurrentUser,
  JwtAuthGuard,
  Roles,
  RolesGuard,
  TenantStaffGuard,
} from '../../common/auth';
import { AssetsService } from './assets.service';
import { LinkProductAssetDto } from './dto/link-product-asset.dto';
import { UpdateAssetDto } from './dto/update-asset.dto';

@ApiTags('Website Assets')
@ApiBearerAuth()
@Controller('api/websites/:websiteId/assets')
@UseGuards(JwtAuthGuard, TenantStaffGuard, RolesGuard)
export class AssetsController {
  constructor(private readonly assetsService: AssetsService) {}

  @Get()
  @Roles('viewer')
  @ApiOperation({ summary: 'List assets for a website' })
  findAll(@Param('websiteId') websiteId: string) {
    return this.assetsService.findAll(websiteId);
  }

  @Post()
  @Roles('editor')
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Upload an asset to the website asset library' })
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 100 * 1024 * 1024 } }))
  upload(
    @Param('websiteId') websiteId: string,
    @CurrentUser() user: AuthUser,
    @UploadedFile() file: Express.Multer.File,
    @Body('name') name?: string,
    @Body('is_public') isPublic?: string,
    @Body('description') description?: string,
    @Body('asset_type') assetType?: string,
  ) {
    if (!file) throw new BadRequestException('File is required');
    return this.assetsService.upload(websiteId, user, file, name, isPublic, description, assetType);
  }

  @Get('products/:productId')
  @Roles('viewer')
  @ApiOperation({ summary: 'List assets linked to a product' })
  listProductAssets(
    @Param('websiteId') websiteId: string,
    @Param('productId') productId: string,
  ) {
    return this.assetsService.listProductAssets(websiteId, productId);
  }

  @Post(':assetId/products/:productId')
  @Roles('editor')
  @ApiOperation({ summary: 'Link a website asset to a product' })
  linkToProduct(
    @Param('websiteId') websiteId: string,
    @Param('productId') productId: string,
    @Param('assetId') assetId: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: LinkProductAssetDto,
  ) {
    return this.assetsService.linkToProduct(websiteId, productId, assetId, user, dto);
  }

  @Patch(':assetId/file')
  @Roles('editor')
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Replace the file behind an asset without creating a new version' })
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 100 * 1024 * 1024 } }))
  replaceFile(
    @Param('websiteId') websiteId: string,
    @Param('assetId') assetId: string,
    @CurrentUser() user: AuthUser,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) throw new BadRequestException('File is required');
    return this.assetsService.replaceFile(websiteId, assetId, user, file);
  }

  @Delete(':assetId/products/:productId')
  @Roles('editor')
  @ApiOperation({ summary: 'Unlink an asset from a product' })
  unlinkFromProduct(
    @Param('websiteId') websiteId: string,
    @Param('productId') productId: string,
    @Param('assetId') assetId: string,
  ) {
    return this.assetsService.unlinkFromProduct(websiteId, productId, assetId);
  }

  @Patch(':assetId')
  @Roles('editor')
  @ApiOperation({ summary: 'Rename an asset' })
  update(
    @Param('websiteId') websiteId: string,
    @Param('assetId') assetId: string,
    @Body() dto: UpdateAssetDto,
  ) {
    return this.assetsService.update(websiteId, assetId, dto);
  }

  @Delete(':assetId')
  @Roles('editor')
  @ApiOperation({ summary: 'Delete an unlinked asset' })
  remove(@Param('websiteId') websiteId: string, @Param('assetId') assetId: string) {
    return this.assetsService.remove(websiteId, assetId);
  }
}