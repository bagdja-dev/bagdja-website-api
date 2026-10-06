import { ConfigService } from '@nestjs/config';

import { DigitalDeliveryService } from './digital-delivery.service';

describe('DigitalDeliveryService', () => {
  it('sends one email per order with all digital asset links in one payload', async () => {
    const deliveryRepo = {
      create: jest.fn((value) => value),
      findOne: jest.fn().mockResolvedValue(null),
      save: jest.fn(async (value) => value),
    };
    const productAssetRepo = {
      find: jest.fn().mockResolvedValue([
        {
          id: 'product-asset-1',
          website_id: 'website-1',
          product_id: 'product-1',
          asset_id: 'asset-1',
          role: 'download',
          is_active: true,
          asset: {
            id: 'asset-1',
            storage_file_id: 'storage-file-1',
            name: 'Panduan PDF',
            filename: 'guide.pdf',
            mime_type: 'application/pdf',
            size_bytes: 512,
            is_public: false,
          },
        },
        {
          id: 'product-asset-2',
          website_id: 'website-1',
          product_id: 'product-1',
          asset_id: 'asset-2',
          role: 'attachment',
          is_active: true,
          asset: {
            id: 'asset-2',
            storage_file_id: 'storage-file-2',
            name: 'Template Bonus',
            filename: 'bonus.xlsx',
            mime_type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            size_bytes: 888,
            is_public: false,
          },
        },
      ]),
    };
    const storage = {
      getAccessUrl: jest
        .fn()
        .mockResolvedValueOnce({
          url: 'https://signed.example.com/private-1',
          expiresIn: 259200,
          expiresAt: '2026-10-09T00:00:00.000Z',
        })
        .mockResolvedValueOnce({
          url: 'https://signed.example.com/private-2',
          expiresIn: 259200,
          expiresAt: '2026-10-09T00:00:00.000Z',
        }),
    };
    const messaging = { sendEmail: jest.fn().mockResolvedValue(true) };
    const service = new DigitalDeliveryService(
      { get: () => undefined } as unknown as ConfigService,
      deliveryRepo as any,
      productAssetRepo as any,
      storage as any,
      messaging as any,
    );
    const transaction: any = {
      id: 'transaction-1',
      website_id: 'website-1',
      items: [{
        order_id: 'order-1',
        order: {
          id: 'order-1',
          product_id: 'product-1',
          buyer_identifier: 'buyer@example.com',
          product: {
            type: 'digital',
            name: 'E-book',
            download_link_ttl_minutes: 4320,
          },
        },
      }],
    };

    await service.sendPaidTransactionAssets(transaction);

    expect(storage.getAccessUrl).toHaveBeenCalledTimes(2);
    expect(messaging.sendEmail).toHaveBeenCalledTimes(1);
    expect(messaging.sendEmail).toHaveBeenCalledWith(expect.objectContaining({
      to: 'buyer@example.com',
      template: 'DigitalProductDelivery',
      rawHtmlKeys: ['assetItemsHtml'],
      context: expect.objectContaining({
        productName: 'E-book',
        assetCount: '2',
        assetName: 'Panduan PDF',
        downloadUrl: 'https://signed.example.com/private-1',
        assetItemsHtml: expect.stringContaining('<li'),
        assetListText: expect.stringContaining('Panduan PDF'),
        asset_list_text: expect.stringContaining('Panduan PDF'),
        downloadLinksText: expect.stringContaining('https://signed.example.com/private-2'),
        expiresAtLabel: expect.stringContaining('2026'),
        orderNumber: 'order-1',
        orderDate: expect.any(String),
      }),
    }));
    expect(messaging.sendEmail.mock.calls[0][0]).not.toHaveProperty('html');
    expect(messaging.sendEmail.mock.calls[0][0].context.assetListText).not.toContain('https://');
    expect(messaging.sendEmail.mock.calls[0][0].context.assetListText).toContain('1. Panduan PDF');
    expect(messaging.sendEmail.mock.calls[0][0].context.assetListText).toContain('2. Template Bonus');
    expect(messaging.sendEmail.mock.calls[0][0].context.downloadLinksText).toContain('https://signed.example.com/private-2');
    const assetItemsHtml = messaging.sendEmail.mock.calls[0][0].context.assetItemsHtml;
    expect(assetItemsHtml.match(/<li /g)).toHaveLength(2);
    expect(assetItemsHtml).toContain('href="https://signed.example.com/private-1"');
    expect(assetItemsHtml).toContain('href="https://signed.example.com/private-2"');
    expect(deliveryRepo.save.mock.calls.length).toBeGreaterThanOrEqual(2);
    expect(deliveryRepo.save).toHaveBeenCalledWith(expect.objectContaining({
      website_id: 'website-1',
      order_id: 'order-1',
      asset_id: 'asset-2',
      email_status: 'SENT',
    }));
  });

  it('lists transaction assets without exposing storage ids or signed URLs', async () => {
    const deliveryRepo = {
      find: jest.fn().mockResolvedValue([{
        id: 'delivery-1',
        order_id: 'order-1',
        product_id: 'product-1',
        role: 'download',
        email_status: 'SENT',
        email_sent_at: new Date('2026-10-06T00:00:00.000Z'),
        last_url_expires_at: new Date('2026-10-09T00:00:00.000Z'),
        asset: {
          id: 'asset-1',
          storage_file_id: 'private-storage-id',
          name: 'Manual',
          filename: 'manual.pdf',
          mime_type: 'application/pdf',
          size_bytes: 100,
          public_url: null,
        },
      }]),
    };
    const service = new DigitalDeliveryService(
      { get: () => undefined } as unknown as ConfigService,
      deliveryRepo as any,
      {} as any,
      {} as any,
      {} as any,
    );

    const result = await service.listTransactionAssets({
      website_id: 'website-1',
      items: [{ order_id: 'order-1' }],
    } as any);

    expect(result[0].asset).toEqual({
      id: 'asset-1',
      name: 'Manual',
      filename: 'manual.pdf',
      mime_type: 'application/pdf',
      size_bytes: 100,
    });
    expect(JSON.stringify(result)).not.toContain('private-storage-id');
    expect(JSON.stringify(result)).not.toContain('signed.example.com');
  });
});
