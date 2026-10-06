import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';

import {
  WebsiteOrderAssetDelivery,
  WebsiteProductAsset,
  WebsiteTransaction,
} from '../../entities';
import { MessagingService } from '../messaging/messaging.service';
import { StorageClientService } from '../storage/storage-client.service';

@Injectable()
export class DigitalDeliveryService {
  private readonly emailTemplate: string;

  constructor(
    private readonly config: ConfigService,
    @InjectRepository(WebsiteOrderAssetDelivery)
    private readonly deliveryRepo: Repository<WebsiteOrderAssetDelivery>,
    @InjectRepository(WebsiteProductAsset)
    private readonly productAssetRepo: Repository<WebsiteProductAsset>,
    private readonly storage: StorageClientService,
    private readonly messaging: MessagingService,
  ) {
    this.emailTemplate = this.config.get<string>('DIGITAL_PRODUCT_DELIVERY_TEMPLATE') || 'DigitalProductDelivery';
  }

  private formatDisplayDate(value?: string | Date | null): string {
    if (!value) return 'Tanggal tidak tersedia';

    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return 'Tanggal tidak tersedia';

    return date.toLocaleDateString('id-ID', {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
    });
  }

  private buildAssetListText(assetEntries: Array<{ name: string; url: string; expiresAt: string }>): string {
    return assetEntries
      .map((entry, index) => `${index + 1}. ${entry.name}`)
      .join(' | ');
  }

  private buildDownloadLinksText(assetEntries: Array<{ name: string; url: string; expiresAt: string }>): string {
    return assetEntries
      .map((entry, index) => `${index + 1}. ${entry.url}`)
      .join(' | ');
  }

  private escapeHtml(value: string): string {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  private buildAssetItemsHtml(params: {
    assetEntries: Array<{ name: string; url: string; expiresAt: string }>;
  }): string {
    const assetItems = params.assetEntries
      .map(
        (entry, index) => `
          <li style="margin-bottom: 12px;">
            <div style="font-weight: 600; color: #111827; margin-bottom: 4px;">${index + 1}. ${this.escapeHtml(entry.name)}</div>
            <a href="${this.escapeHtml(entry.url)}" style="color: #2563eb; text-decoration: none;">Unduh file</a>
          </li>`,
      )
      .join('');

    return `<ul style="margin: 0; padding-left: 20px; line-height: 1.6;">${assetItems}</ul>`;
  }

  async sendPaidTransactionAssets(transaction: WebsiteTransaction) {
    const orders = (transaction.items ?? [])
      .map((item) => item.order)
      .filter((order) => order?.product?.type === 'digital');
    const results: WebsiteOrderAssetDelivery[] = [];

    for (const order of orders) {
      const links = await this.productAssetRepo.find({
        where: {
          website_id: transaction.website_id,
          product_id: order.product_id,
          is_active: true,
          role: In(['download', 'attachment']),
        },
        relations: { asset: true },
        order: { sort_order: 'ASC' },
      });

      const validLinks = links.filter((link): link is typeof link & { role: 'download' | 'attachment' } => {
        if (link.role !== 'download' && link.role !== 'attachment') return false;
        return !link.asset.is_public;
      });

      const assetEntries: Array<{ name: string; url: string; expiresAt: string }> = [];
      const deliveryRecords: WebsiteOrderAssetDelivery[] = [];

      for (const link of validLinks) {
        let delivery = await this.deliveryRepo.findOne({
          where: { order_id: order.id, asset_id: link.asset_id },
        });

        if (!delivery) {
          delivery = this.deliveryRepo.create({
            website_id: transaction.website_id,
            order_id: order.id,
            product_id: order.product_id,
            asset_id: link.asset_id,
            role: link.role,
            email_to: order.buyer_identifier,
            email_status: 'PENDING',
            email_sent_at: null,
            delivery_attempts: 0,
            last_error: null,
            last_url_issued_at: null,
            last_url_expires_at: null,
          });
        }

        delivery.role = link.role;
        delivery.email_to = order.buyer_identifier;
        const expiresAt = delivery.last_url_expires_at?.getTime() ?? 0;
        if (delivery.email_status === 'SENT' && expiresAt > Date.now()) {
          assetEntries.push({
            name: link.asset.name,
            url: delivery.last_url_issued_at ? delivery.last_url_expires_at ? 'already-issued' : 'already-issued' : 'missing',
            expiresAt: delivery.last_url_expires_at?.toISOString() || new Date().toISOString(),
          });
          deliveryRecords.push(delivery);
          continue;
        }
        if (
          delivery.email_status === 'FAILED' &&
          delivery.last_email_attempt_at &&
          delivery.last_email_attempt_at.getTime() > Date.now() - 60_000
        ) {
          assetEntries.push({
            name: link.asset.name,
            url: 'retry-later',
            expiresAt: delivery.last_url_expires_at?.toISOString() || new Date().toISOString(),
          });
          deliveryRecords.push(delivery);
          continue;
        }

        if (!order.buyer_identifier || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(order.buyer_identifier)) {
          delivery.email_status = 'FAILED';
          delivery.last_email_attempt_at = new Date();
          delivery.last_error = 'Buyer email is missing or invalid';
          deliveryRecords.push(await this.deliveryRepo.save(delivery));
          continue;
        }

        try {
          const ttlMinutes = Math.min(10080, Math.max(1, order.product.download_link_ttl_minutes || 4320));
          const issuedAt = new Date();
          const access = await this.storage.getAccessUrl(
            link.asset.storage_file_id,
            ttlMinutes * 60,
          );
          delivery.last_url_issued_at = issuedAt;
          delivery.last_url_expires_at = new Date(access.expiresAt);
          delivery.delivery_attempts += 1;
          delivery.last_email_attempt_at = issuedAt;
          delivery.last_error = null;
          await this.deliveryRepo.save(delivery);
          assetEntries.push({
            name: link.asset.name,
            url: access.url,
            expiresAt: access.expiresAt,
          });
          deliveryRecords.push(delivery);
        } catch (error) {
          delivery.last_email_attempt_at = new Date();
          delivery.email_status = 'FAILED';
          delivery.last_error = 'Digital delivery request failed';
          deliveryRecords.push(await this.deliveryRepo.save(delivery));
        }
      }

      if (assetEntries.length === 0 || !order.buyer_identifier || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(order.buyer_identifier)) {
        results.push(...deliveryRecords);
        continue;
      }

      const primary = assetEntries[0];
      const orderNumber = order.id;
      const orderDate = this.formatDisplayDate(order.created_at ?? transaction.created_at ?? new Date());
      const expiresAtLabel = this.formatDisplayDate(primary.expiresAt);
      const assetListText = this.buildAssetListText(assetEntries);
      const downloadLinksText = this.buildDownloadLinksText(assetEntries);

      const assetItemsHtml = this.buildAssetItemsHtml({
        assetEntries,
      });

      const sent = await this.messaging.sendEmail({
        to: order.buyer_identifier,
        template: this.emailTemplate,
        rawHtmlKeys: ['assetItemsHtml'],
        context: {
          buyerEmail: order.buyer_identifier,
          productName: order.product.name,
          assetName: primary.name,
          downloadUrl: primary.url,
          downloadLinksText,
          assetCount: String(assetEntries.length),
          assetItemsHtml,
          assetListText,
          asset_list_text: assetListText,
          expiresAt: primary.expiresAt,
          expiresAtLabel,
          orderNumber,
          orderDate,
          transactionId: transaction.id,
        },
      });

      for (const delivery of deliveryRecords) {
        delivery.email_status = sent ? 'SENT' : 'FAILED';
        delivery.email_sent_at = sent ? new Date() : delivery.email_sent_at;
        delivery.last_error = sent ? null : 'Messaging Service did not accept the email';
        const saved = await this.deliveryRepo.save(delivery);
        results.push(saved);
      }
    }
    return results;
  }

  async listTransactionAssets(transaction: WebsiteTransaction) {
    const orderIds = (transaction.items ?? []).map((item) => item.order_id);
    if (orderIds.length === 0) return [];
    const deliveries = await this.deliveryRepo.find({
      where: { website_id: transaction.website_id, order_id: In(orderIds) },
      relations: { asset: true },
      order: { created_at: 'ASC' },
    });
    return deliveries.map((delivery) => ({
      id: delivery.id,
      order_id: delivery.order_id,
      product_id: delivery.product_id,
      role: delivery.role,
      email_status: delivery.email_status,
      email_sent_at: delivery.email_sent_at,
      last_url_expires_at: delivery.last_url_expires_at,
      asset: {
        id: delivery.asset.id,
        name: delivery.asset.name,
        filename: delivery.asset.filename,
        mime_type: delivery.asset.mime_type,
        size_bytes: delivery.asset.size_bytes,
      },
    }));
  }

  async createDownloadUrl(transaction: WebsiteTransaction, buyerUserId: string, deliveryId: string) {
    if (transaction.buyer_user_id !== buyerUserId) {
      throw new NotFoundException('Transaction not found');
    }
    if (transaction.status !== 'COMPLETED') {
      throw new ForbiddenException('Download is available after payment is confirmed');
    }
    const delivery = await this.deliveryRepo.findOne({
      where: { id: deliveryId, website_id: transaction.website_id },
      relations: { order: { product: true }, asset: true },
    });
    if (!delivery || delivery.order.transaction_id !== transaction.id) {
      throw new NotFoundException('Digital asset delivery not found');
    }
    if (delivery.asset.is_public) {
      throw new BadRequestException('Digital delivery assets must be private');
    }
    const ttlMinutes = Math.min(10080, Math.max(1, delivery.order.product.download_link_ttl_minutes || 4320));
    const issuedAt = new Date();
    const access = await this.storage.getAccessUrl(
      delivery.asset.storage_file_id,
      ttlMinutes * 60,
    );
    delivery.last_url_issued_at = issuedAt;
    delivery.last_url_expires_at = new Date(access.expiresAt);
    await this.deliveryRepo.save(delivery);
    return { url: access.url, expires_in: access.expiresIn, expires_at: access.expiresAt };
  }
}