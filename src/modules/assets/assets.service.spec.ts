import { BadRequestException, ConflictException } from '@nestjs/common';

import { AssetsService } from './assets.service';

describe('AssetsService', () => {
  const user = { userId: 'buyer-or-staff-id' } as any;

  it('uploads assets privately by default and persists the storage file reference', async () => {
    const assetRepo = {
      create: jest.fn((value) => value),
      save: jest.fn(async (value) => ({ id: 'asset-1', ...value })),
    };
    const storage = {
      uploadFile: jest.fn().mockResolvedValue({
        fileId: 'storage-file-1',
        url: null,
        path: 'private/key',
        mimeType: 'application/pdf',
        sizeBytes: 42,
        isPublic: false,
      }),
      removeFile: jest.fn(),
    };
    const service = new AssetsService(assetRepo as any, {} as any, {} as any, {} as any, storage as any);

    const result = await service.upload(
      'website-1',
      user,
      { originalname: 'guide.pdf', mimetype: 'application/pdf', buffer: Buffer.from('pdf') } as any,
      undefined,
      undefined,
      'Panduan ringkas untuk pengguna.',
      'downloadable',
    );

    expect(storage.uploadFile).toHaveBeenCalledWith(
      expect.any(Buffer),
      'application/pdf',
      'guide.pdf',
      'digital-assets',
      false,
    );
    expect(result).toEqual(expect.objectContaining({
      website_id: 'website-1',
      storage_file_id: 'storage-file-1',
      name: 'guide.pdf',
      description: 'Panduan ringkas untuk pengguna.',
      asset_type: 'downloadable',
      is_public: false,
      created_by: user.userId,
    }));
  });

  it('only links private downloadable assets to digital products', async () => {
    const productRepo = { findOne: jest.fn().mockResolvedValue({ id: 'product-1', type: 'product' }) };
    const assetRepo = { findOne: jest.fn().mockResolvedValue({ id: 'asset-1', is_public: false }) };
    const service = new AssetsService(assetRepo as any, {} as any, {} as any, productRepo as any, {} as any);

    await expect(
      service.linkToProduct('website-1', 'product-1', 'asset-1', user, { role: 'download' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects public assets for digital download links', async () => {
    const productRepo = { findOne: jest.fn().mockResolvedValue({ id: 'product-1', type: 'digital' }) };
    const assetRepo = { findOne: jest.fn().mockResolvedValue({ id: 'asset-1', is_public: true }) };
    const service = new AssetsService(assetRepo as any, {} as any, {} as any, productRepo as any, {} as any);

    await expect(
      service.linkToProduct('website-1', 'product-1', 'asset-1', user, { role: 'download' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('allows linking a private asset to a digital product', async () => {
    const asset = { id: 'asset-1', is_public: false };
    const link = { id: 'link-1' };
    const productRepo = { findOne: jest.fn().mockResolvedValue({ id: 'product-1', type: 'digital' }) };
    const assetRepo = { findOne: jest.fn().mockResolvedValue(asset) };
    const productAssetRepo = {
      findOne: jest.fn().mockResolvedValue(null),
      create: jest.fn((value) => value),
      save: jest.fn().mockResolvedValue(link),
    };
    const service = new AssetsService(assetRepo as any, productAssetRepo as any, {} as any, productRepo as any, {} as any);

    await expect(
      service.linkToProduct('website-1', 'product-1', 'asset-1', user, { role: 'download' }),
    ).resolves.toBe(link);
    expect(productAssetRepo.create).toHaveBeenCalledWith(expect.objectContaining({
      website_id: 'website-1',
      product_id: 'product-1',
      asset_id: 'asset-1',
      role: 'download',
    }));
  });

  it('refuses to delete an asset while a product still links it', async () => {
    const assetRepo = {
      findOne: jest.fn().mockResolvedValue({ id: 'asset-1', website_id: 'website-1', storage_file_id: 'file-1' }),
    };
    const productAssetRepo = { count: jest.fn().mockResolvedValue(1) };
    const deliveryRepo = { count: jest.fn().mockResolvedValue(0) };
    const storage = { removeFile: jest.fn() };
    const service = new AssetsService(assetRepo as any, productAssetRepo as any, deliveryRepo as any, {} as any, storage as any);

    await expect(service.remove('website-1', 'asset-1')).rejects.toBeInstanceOf(ConflictException);
    expect(storage.removeFile).not.toHaveBeenCalled();
  });

  it('replaces the stored file in place and removes the previous object', async () => {
    const asset = {
      id: 'asset-1',
      website_id: 'website-1',
      storage_file_id: 'old-file',
      is_public: false,
    };
    const assetRepo = {
      findOne: jest.fn().mockResolvedValue(asset),
      save: jest.fn(async (row) => row),
    };
    const storage = {
      uploadFile: jest.fn().mockResolvedValue({
        fileId: 'new-file',
        url: null,
        path: 'private/new-file',
        mimeType: 'application/pdf',
        sizeBytes: 99,
        isPublic: false,
      }),
      removeFile: jest.fn().mockResolvedValue(undefined),
    };
    const service = new AssetsService(assetRepo as any, {} as any, {} as any, {} as any, storage as any);

    const result = await service.replaceFile('website-1', 'asset-1', user, {
      buffer: Buffer.from('new'),
      mimetype: 'application/pdf',
      originalname: 'new-guide.pdf',
    } as any);

    expect(result).toEqual(expect.objectContaining({
      id: 'asset-1',
      storage_file_id: 'new-file',
      filename: 'new-guide.pdf',
      is_public: false,
    }));
    expect(storage.uploadFile).toHaveBeenCalledWith(
      expect.any(Buffer), 'application/pdf', 'new-guide.pdf', 'digital-assets', false,
    );
    expect(storage.removeFile).toHaveBeenCalledWith('old-file');
  });

  it('refuses to delete an asset referenced by a historical paid order', async () => {
    const assetRepo = {
      findOne: jest.fn().mockResolvedValue({ id: 'asset-1', website_id: 'website-1', storage_file_id: 'file-1' }),
    };
    const productAssetRepo = { count: jest.fn().mockResolvedValue(0) };
    const deliveryRepo = { count: jest.fn().mockResolvedValue(1) };
    const storage = { removeFile: jest.fn() };
    const service = new AssetsService(assetRepo as any, productAssetRepo as any, deliveryRepo as any, {} as any, storage as any);

    await expect(service.remove('website-1', 'asset-1')).rejects.toBeInstanceOf(ConflictException);
    expect(storage.removeFile).not.toHaveBeenCalled();
  });
});