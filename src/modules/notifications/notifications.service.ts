import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { WebsiteEventBroadcasterService } from '../../common/website-event-broadcaster/website-event-broadcaster.service';
import {
  TenantStaff,
  Website,
  WebsiteNotification,
  type WebsiteNotificationSeverity,
  type WebsiteNotificationType,
} from '../../entities';

export interface CreateWebsiteNotificationInput {
  websiteId: string;
  userId: string;
  merchantId?: string;
  type: WebsiteNotificationType;
  title: string;
  message: string;
  severity?: WebsiteNotificationSeverity;
  actionLabel?: string | null;
  actionUrl: string;
  entityType?: string | null;
  entityId?: string | null;
  threadId?: string | null;
}

@Injectable()
export class NotificationsService {
  constructor(
    @InjectRepository(WebsiteNotification)
    private readonly notificationRepo: Repository<WebsiteNotification>,
    @InjectRepository(TenantStaff)
    private readonly staffRepo: Repository<TenantStaff>,
    @InjectRepository(Website)
    private readonly websiteRepo: Repository<Website>,
    private readonly eventBroadcaster: WebsiteEventBroadcasterService,
  ) {}

  async create(input: CreateWebsiteNotificationInput): Promise<WebsiteNotification> {
    if (!input.actionUrl.startsWith('/')) {
      throw new BadRequestException('Notification actionUrl must be a relative path');
    }

    const saved = await this.notificationRepo.save(
      this.notificationRepo.create({
        website_id: input.websiteId,
        user_id: input.userId,
        type: input.type,
        title: input.title.slice(0, 160),
        message: input.message.slice(0, 500),
        severity: input.severity ?? 'info',
        action_label: input.actionLabel ?? null,
        action_url: input.actionUrl,
        entity_type: input.entityType ?? null,
        entity_id: input.entityId ?? null,
        read_at: null,
      }),
    );

    const merchantId = input.merchantId ?? (await this.resolveMerchantId(saved.website_id));
    void this.eventBroadcaster.publishNotificationCreated({
      merchantId,
      websiteId: saved.website_id,
      notificationId: saved.id,
      userId: saved.user_id,
      type: saved.type,
      title: saved.title,
      message: saved.message || 'Notifikasi baru',
      severity: saved.severity,
      actionUrl: saved.action_url,
      threadId: input.threadId ?? (saved.entity_type === 'chat_thread' ? saved.entity_id : null),
      createdAt: saved.created_at.toISOString(),
    });

    return saved;
  }

  private async resolveMerchantId(websiteId: string) {
    const owner = await this.staffRepo.findOne({
      where: { website_id: websiteId, role: 'owner', is_active: true },
      order: { created_at: 'ASC' },
    });
    return owner?.user_id ?? websiteId;
  }

  async getSoundConfig(websiteId: string) {
    if (!websiteId) throw new BadRequestException('website_id is required');
    const website = await this.websiteRepo.findOne({
      where: { id: websiteId },
      select: ['id', 'notification_sound_enabled', 'notification_sound_url'],
    });
    if (!website) throw new NotFoundException('Website not found');
    return {
      enabled: website.notification_sound_enabled !== false,
      url: website.notification_sound_url ?? null,
    };
  }

  async notifyUser(input: CreateWebsiteNotificationInput, exceptUserId?: string) {
    if (!input.userId || input.userId === exceptUserId) return null;
    return this.create(input);
  }

  async notifyWebsiteStaff(
    websiteId: string,
    input: Omit<CreateWebsiteNotificationInput, 'websiteId' | 'userId'>,
    exceptUserId?: string,
    extraUserIds: Array<string | null | undefined> = [],
  ) {
    const staff = await this.staffRepo.find({
      where: { website_id: websiteId, is_active: true },
    });
    const userIds = [...new Set(
      [...staff.map((item) => item.user_id), ...extraUserIds]
        .filter((id): id is string => Boolean(id) && id !== exceptUserId),
    )];
    await Promise.all(userIds.map((userId) => this.create({ ...input, websiteId, userId })));
  }

  async listForUser(userId: string, websiteId: string, limit = 20, offset = 0, unread?: boolean) {
    if (!websiteId) throw new BadRequestException('website_id is required');

    const query = this.notificationRepo
      .createQueryBuilder('notification')
      .where('notification.website_id = :websiteId', { websiteId })
      .andWhere('notification.user_id = :userId', { userId })
      .orderBy('notification.created_at', 'DESC')
      .take(Math.min(Math.max(limit, 1), 100))
      .skip(Math.max(offset, 0));

    if (unread === true) query.andWhere('notification.read_at IS NULL');
    if (unread === false) query.andWhere('notification.read_at IS NOT NULL');

    const [items, total] = await query.getManyAndCount();
    return { items, total, limit, offset };
  }

  async unreadCount(userId: string, websiteId: string): Promise<{ count: number }> {
    if (!websiteId) throw new BadRequestException('website_id is required');

    const count = await this.notificationRepo
      .createQueryBuilder('notification')
      .where('notification.website_id = :websiteId', { websiteId })
      .andWhere('notification.user_id = :userId', { userId })
      .andWhere('notification.read_at IS NULL')
      .getCount();
    return { count };
  }

  async markRead(userId: string, websiteId: string, notificationId: string) {
    const notification = await this.notificationRepo.findOne({
      where: { id: notificationId, user_id: userId, website_id: websiteId },
    });
    if (!notification) throw new NotFoundException('Notification not found');

    if (!notification.read_at) {
      notification.read_at = new Date();
      await this.notificationRepo.save(notification);
    }

    return notification;
  }

  async markAllRead(userId: string, websiteId: string): Promise<{ updated: number }> {
    if (!websiteId) throw new BadRequestException('website_id is required');

    const result = await this.notificationRepo
      .createQueryBuilder()
      .update(WebsiteNotification)
      .set({ read_at: new Date() })
      .where('website_id = :websiteId AND user_id = :userId AND read_at IS NULL', { websiteId, userId })
      .execute();

    return { updated: result.affected ?? 0 };
  }

  async markReadByEntity(userId: string, websiteId: string, entityType: string, entityId: string) {
    const result = await this.notificationRepo
      .createQueryBuilder()
      .update(WebsiteNotification)
      .set({ read_at: new Date() })
      .where(
        'website_id = :websiteId AND user_id = :userId AND entity_type = :entityType AND entity_id = :entityId AND read_at IS NULL',
        { websiteId, userId, entityType, entityId },
      )
      .execute();

    return { updated: result.affected ?? 0 };
  }

  async markReadByEntities(userId: string, websiteId: string, entityType: string, entityIds: string[]) {
    const ids = [...new Set(entityIds.filter(Boolean))];
    if (ids.length === 0) return { updated: 0 };

    const result = await this.notificationRepo
      .createQueryBuilder()
      .update(WebsiteNotification)
      .set({ read_at: new Date() })
      .where('website_id = :websiteId AND user_id = :userId AND entity_type = :entityType AND entity_id IN (:...entityIds) AND read_at IS NULL', {
        websiteId,
        userId,
        entityType,
        entityIds: ids,
      })
      .execute();

    return { updated: result.affected ?? 0 };
  }
}
