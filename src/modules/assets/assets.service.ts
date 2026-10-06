import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { WebsiteAsset, WebsiteOrderAssetDelivery, WebsiteProduct, WebsiteProductAsset } from '../../entities';
import type { AuthUser } from '../../common/auth';
import { StorageClientService } from '../storage/storage-client.service';
import { LinkProductAssetDto } from './dto/link-product-asset.dto';
import { UpdateAssetDto } from './dto/update-asset.dto';

@Injectable()
export class AssetsService {
  constructor(
    @InjectRepository(WebsiteAsset)
    private readonly assetRepo: Repository<WebsiteAsset>,
    @InjectRepository(WebsiteProductAsset)
    private readonly productAssetRepo: Repository<WebsiteProductAsset>,
    @InjectRepository(WebsiteOrderAssetDelivery)
    private readonly deliveryRepo: Repository<WebsiteOrderAssetDelivery>,
    @InjectRepository(WebsiteProduct)
    private readonly productRepo: Repository<WebsiteProduct>,
    private readonly storage: StorageClientService,
  ) {}

  async findAll(websiteId: string) {
    return this.assetRepo.find({
      where: { website_id: websiteId },
      order: { created_at: 'DESC' },
    });
  }

  async upload(
    websiteId: string,
    user: AuthUser,
    file: Express.Multer.File,
    name: string | undefined,
    isPublicInput: string | undefined,
    description: string | undefined,
    assetType: string | undefined,
  ) {
    if (isPublicInput !== undefined && !['true', 'false'].includes(isPublicInput)) {
      throw new BadRequestException('is_public must be true or false');
    }
    const isPublic = isPublicInput === 'true';
    const assetName = (name?.trim() || file.originalname).trim();
    if (!assetName || assetName.length > 255) {
      throw new BadRequestException('Asset name must be between 1 and 255 characters');
    }
    const assetDescription = description?.trim() ?? '';
    if (assetDescription.length > 2000) {
      throw new BadRequestException('Asset description must not exceed 2000 characters');
    }
    const category = assetType?.trim() || 'downloadable';
    if (category !== 'downloadable') {
      throw new BadRequestException('Unsupported asset type');
    }

    const stored = await this.storage.uploadFile(
      file.buffer,
      file.mimetype,
      file.originalname,
      'digital-assets',
      isPublic,
    );
    try {
      return await this.assetRepo.save(
        this.assetRepo.create({
          website_id: websiteId,
          storage_file_id: stored.fileId,
          name: assetName,
          description: assetDescription,
          asset_type: category,
          filename: file.originalname.slice(0, 255),
          mime_type: stored.mimeType,
          size_bytes: stored.sizeBytes,
          is_public: stored.isPublic,
          public_url: stored.url,
          created_by: user.userId,
        }),
      );
    } catch (error) {
      await this.storage.removeFile(stored.fileId).catch(() => undefined);
      throw error;
    }
  }

  async update(websiteId: string, assetId: string, dto: UpdateAssetDto) {
    const asset = await this.findOne(websiteId, assetId);
    if (dto.name !== undefined) asset.name = dto.name.trim();
    if (dto.description !== undefined) asset.description = dto.description.trim();
    if (dto.asset_type !== undefined) asset.asset_type = dto.asset_type;
    return this.assetRepo.save(asset);
  }

  async replaceFile(
    websiteId: string,
    assetId: string,
    user: AuthUser,
    file: Express.Multer.File,
  ) {
    const asset = await this.findOne(websiteId, assetId);
    const previousFileId = asset.storage_file_id;
    const stored = await this.storage.uploadFile(
      file.buffer,
      file.mimetype,
      file.originalname,
      'digital-assets',
      asset.is_public,
    );
    asset.storage_file_id = stored.fileId;
    asset.filename = file.originalname.slice(0, 255);
    asset.mime_type = stored.mimeType;
    asset.size_bytes = stored.sizeBytes;
    asset.public_url = stored.url;
    try {
      const saved = await this.assetRepo.save(asset);
      await this.storage.removeFile(previousFileId).catch(() => undefined);
      return saved;
    } catch (error) {
      await this.storage.removeFile(stored.fileId).catch(() => undefined);
      throw error;
    }
  }

  async remove(websiteId: string, assetId: string) {
    const asset = await this.findOne(websiteId, assetId);
    const attachedCount = await this.productAssetRepo.count({ where: { asset_id: assetId } });
    const deliveryCount = await this.deliveryRepo.count({ where: { asset_id: assetId } });
    if (attachedCount > 0 || deliveryCount > 0) {
      throw new ConflictException('Remove this asset from its products and transaction history before deleting it');
    }
    await this.storage.removeFile(asset.storage_file_id);
    await this.assetRepo.remove(asset);
    return { success: true };
  }

  async linkToProduct(
    websiteId: string,
    productId: string,
    assetId: string,
    user: AuthUser,
    dto: LinkProductAssetDto,
  ) {
    const [product, asset] = await Promise.all([
      this.productRepo.findOne({ where: { id: productId, website_id: websiteId } }),
      this.findOne(websiteId, assetId),
    ]);
    if (!product) throw new NotFoundException('Product not found');

    const role = dto.role ?? 'download';
    if (role !== 'preview' && product.type !== 'digital') {
      throw new BadRequestException('Download and attachment assets can only be linked to digital products');
    }
    if (role !== 'preview' && asset.is_public) {
      throw new BadRequestException('Download and attachment assets must be private');
    }

    const existing = await this.productAssetRepo.findOne({
      where: { website_id: websiteId, product_id: productId, asset_id: assetId },
    });
    if (existing) {
      existing.role = role;
      existing.sort_order = dto.sort_order ?? existing.sort_order;
      existing.is_active = true;
      return this.productAssetRepo.save(existing);
    }

    return this.productAssetRepo.save(
      this.productAssetRepo.create({
        website_id: websiteId,
        product_id: productId,
        asset_id: assetId,
        role,
        sort_order: dto.sort_order ?? 0,
        is_active: true,
        created_by: user.userId,
      }),
    );
  }

  async unlinkFromProduct(websiteId: string, productId: string, assetId: string) {
    const link = await this.productAssetRepo.findOne({
      where: { website_id: websiteId, product_id: productId, asset_id: assetId },
    });
    if (!link) throw new NotFoundException('Product asset link not found');
    await this.productAssetRepo.remove(link);
    return { success: true };
  }

  async listProductAssets(websiteId: string, productId: string) {
    const product = await this.productRepo.findOne({ where: { id: productId, website_id: websiteId } });
    if (!product) throw new NotFoundException('Product not found');
    return this.productAssetRepo.find({
      where: { website_id: websiteId, product_id: productId, is_active: true },
      relations: { asset: true },
      order: { sort_order: 'ASC', created_at: 'ASC' },
    });
  }

  private async findOne(websiteId: string, assetId: string) {
    const asset = await this.assetRepo.findOne({ where: { id: assetId, website_id: websiteId } });
    if (!asset) throw new NotFoundException('Asset not found');
    return asset;
  }
}