import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { In, QueryFailedError, Repository } from 'typeorm';

import { ChatServiceClient } from '../../common/chat-service/chat-service.client';
import { WebsiteEventBroadcasterService } from '../../common/website-event-broadcaster/website-event-broadcaster.service';
import {
  TenantStaff,
  Website,
  WebsiteChatThread,
  WebsiteOrder,
  WebsiteProduct,
  User,
} from '../../entities';
import type { AuthUser } from '../../common/auth';
import type { CreateWebsiteChatThreadDto } from './dto/create-thread.dto';
import type { SendWebsiteChatMessageDto } from './dto/send-message.dto';

@Injectable()
export class ChatService {
  constructor(
    @InjectRepository(WebsiteChatThread)
    private readonly threadRepo: Repository<WebsiteChatThread>,
    @InjectRepository(TenantStaff)
    private readonly staffRepo: Repository<TenantStaff>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(Website)
    private readonly websiteRepo: Repository<Website>,
    @InjectRepository(WebsiteProduct)
    private readonly productRepo: Repository<WebsiteProduct>,
    @InjectRepository(WebsiteOrder)
    private readonly orderRepo: Repository<WebsiteOrder>,
    private readonly config: ConfigService,
    private readonly chatServiceClient: ChatServiceClient,
    private readonly eventBroadcaster: WebsiteEventBroadcasterService,
  ) {}

  private previewFromBody(body?: string | null): string {
    const value = (body ?? '').replace(/\s+/g, ' ').trim();
    if (!value) return 'Belum ada pesan';
    if (value.startsWith('__BAGDJA_CHAT_REFERENCE__')) return 'Referensi percakapan';
    return value.slice(0, 140);
  }

  private applyChannelFilter(query: ReturnType<Repository<WebsiteChatThread>['createQueryBuilder']>, channelType?: string) {
    if (!channelType || channelType === 'all') return;
    if (channelType === 'order') {
      query.andWhere('thread.channel_type IN (:...channelTypes)', { channelTypes: ['order', 'transaction'] });
      return;
    }
    if (channelType === 'support' || channelType === 'dm') {
      query.andWhere('thread.channel_type IN (:...channelTypes)', { channelTypes: ['support', 'dm'] });
      return;
    }
    query.andWhere('thread.channel_type = :channelType', { channelType });
  }

  private applySearchFilter(query: ReturnType<Repository<WebsiteChatThread>['createQueryBuilder']>, search?: string) {
    const term = search?.trim();
    if (!term) return;

    query
      .leftJoin(User, 'customer', 'customer.id = thread.customer_user_id')
      .andWhere(
        `(
          thread.channel_label ILIKE :search
          OR thread.last_message_preview ILIKE :search
          OR CAST(thread.id AS TEXT) ILIKE :search
          OR CAST(thread.product_id AS TEXT) ILIKE :search
          OR CAST(thread.order_id AS TEXT) ILIKE :search
          OR CAST(thread.customer_user_id AS TEXT) ILIKE :search
          OR customer.name ILIKE :search
          OR customer.username ILIKE :search
          OR customer.email ILIKE :search
        )`,
        { search: `%${term}%` },
      );
  }

  private async attachLastMessagePreviews(threads: WebsiteChatThread[]) {
    const missing = threads.filter((thread) => !thread.last_message_preview && thread.topic_id).slice(0, 20);
    await Promise.all(
      missing.map(async (thread) => {
        try {
          const list = await this.chatServiceClient.listMessages(thread.topic_id as string, 1, 0);
          const last = list.items[0];
          if (!last?.body) return;
          const preview = this.previewFromBody(last.body);
          thread.last_message_preview = preview;
          await this.threadRepo.update(thread.id, { last_message_preview: preview });
        } catch {
          // Preview is best-effort for older threads.
        }
      }),
    );
    return threads;
  }

  private async isWebsiteStaff(websiteId: string, userId: string) {
    return !!(await this.staffRepo.findOne({
      where: {
        website_id: websiteId,
        user_id: userId,
        is_active: true,
      },
    }));
  }

  private async ensureWebsiteAccess(websiteId: string, userId: string) {
    const website = await this.websiteRepo.findOne({ where: { id: websiteId } });
    if (!website) {
      throw new NotFoundException('Website not found');
    }

    if (!(await this.isWebsiteStaff(websiteId, userId))) {
      throw new BadRequestException('You do not have access to this website');
    }

    return website;
  }

  private async validateThreadContext(websiteId: string, dto: CreateWebsiteChatThreadDto) {
    if (dto.product_id) {
      const product = await this.productRepo.findOne({
        where: { id: dto.product_id, website_id: websiteId },
      });
      if (!product) {
        throw new BadRequestException('Product does not belong to this website');
      }
    }

    if (dto.order_id) {
      const order = await this.orderRepo.findOne({
        where: { id: dto.order_id, website_id: websiteId },
      });
      if (!order) {
        throw new BadRequestException('Order does not belong to this website');
      }
    }
  }

  private async addCustomerNames(threads: WebsiteChatThread[]) {
    const customerIds = [...new Set(threads.map((thread) => thread.customer_user_id))];
    if (customerIds.length === 0) return threads;

    const users = await this.userRepo.find({ where: { id: In(customerIds) } });
    const usersById = new Map(users.map((user) => [user.id, user]));

    return threads.map((thread) => {
      const user = usersById.get(thread.customer_user_id);
      return {
        ...thread,
        customer_name: user?.name ?? user?.username ?? user?.email ?? thread.customer_user_id,
        customer_email: user?.email ?? null,
      };
    });
  }

  private async getUserDisplayName(userId: string, authUser?: AuthUser, isAdmin = false) {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    return user?.name ?? user?.username ?? user?.email ?? authUser?.username ?? authUser?.email ?? (isAdmin ? 'Admin' : 'Customer');
  }

  private async ensureDirectTopic(websiteId: string, thread: WebsiteChatThread) {
    const topic = await this.chatServiceClient.createDirectTopic({
      dmKey: `website:${websiteId}:${thread.channel_type}:${thread.product_id ?? thread.order_id ?? 'general'}:${thread.customer_user_id}:${thread.merchant_id}`,
      participantUserIds: [...new Set([thread.customer_user_id, thread.merchant_id])],
      name: thread.channel_label ?? 'Admin',
      createdByUserId: thread.customer_user_id,
    });

    if (thread.topic_id !== topic.id) {
      thread.topic_id = topic.id;
      await this.threadRepo.save(thread);
    }

    return topic.id;
  }

  async listThreads(websiteId: string, userId: string, channelType?: string, status?: string, search?: string) {
    const isStaff = await this.isWebsiteStaff(websiteId, userId);
    if (!isStaff) {
      const query = this.threadRepo
        .createQueryBuilder('thread')
        .where('thread.website_id = :websiteId', { websiteId })
        .andWhere('thread.customer_user_id = :customerUserId', { customerUserId: userId })
        .orderBy('thread.last_message_at', 'DESC')
        .addOrderBy('thread.updated_at', 'DESC');

      this.applyChannelFilter(query, channelType);

      if (status) {
        query.andWhere('thread.status = :status', { status });
      }

      this.applySearchFilter(query, search);

      return this.addCustomerNames(await this.attachLastMessagePreviews(await query.getMany()));
    }

    await this.ensureWebsiteAccess(websiteId, userId);

    const query = this.threadRepo
      .createQueryBuilder('thread')
      .where('thread.website_id = :websiteId', { websiteId })
      .orderBy('thread.last_message_at', 'DESC')
      .addOrderBy('thread.updated_at', 'DESC');

    this.applyChannelFilter(query, channelType);

    if (status) {
      query.andWhere('thread.status = :status', { status });
    }

    this.applySearchFilter(query, search);

    const threads = await query.getMany();
    const topicIds = threads.map((thread) => thread.topic_id).filter((id): id is string => !!id);

    if (topicIds.length === 0) {
      return this.addCustomerNames(await this.attachLastMessagePreviews(threads));
    }

    const readStates = await this.chatServiceClient.getReadState(userId, topicIds);
    const readStateMap = new Map(readStates.map((item) => [item.topicId, item]));

    return this.addCustomerNames(await this.attachLastMessagePreviews(threads.map((thread) => ({
      ...thread,
      unread_count: readStateMap.get(thread.topic_id ?? '')?.unreadCount ?? 0,
    })) as WebsiteChatThread[]));
  }

  private async ensureThreadAccessForUser(websiteId: string, threadId: string, userId: string) {
    const thread = await this.threadRepo.findOne({
      where: { id: threadId, website_id: websiteId },
    });

    if (!thread) {
      throw new NotFoundException('Chat thread not found');
    }

    const isAdmin = !!(await this.staffRepo.findOne({
      where: {
        website_id: websiteId,
        user_id: userId,
        is_active: true,
      },
    }));

    const isCustomer = thread.customer_user_id === userId;

    if (!isAdmin && !isCustomer) {
      throw new ForbiddenException('You do not have access to this chat thread');
    }

    return thread;
  }

  async getThread(websiteId: string, threadId: string, userId: string) {
    const isStaff = await this.isWebsiteStaff(websiteId, userId);
    if (isStaff) {
      await this.ensureWebsiteAccess(websiteId, userId);
    }
    const thread = await this.ensureThreadAccessForUser(websiteId, threadId, userId);
    const [enriched] = await this.addCustomerNames([thread]);
    return enriched;
  }

  async createThread(websiteId: string, currentUser: AuthUser, dto: CreateWebsiteChatThreadDto) {
    const isStaff = await this.isWebsiteStaff(websiteId, currentUser.userId);
    if (isStaff) {
      await this.ensureWebsiteAccess(websiteId, currentUser.userId);
    } else {
      const website = await this.websiteRepo.findOne({ where: { id: websiteId } });
      if (!website) {
        throw new NotFoundException('Website not found');
      }
    }
    await this.validateThreadContext(websiteId, dto);

    const customerUserId = dto.customer_user_id ?? (isStaff ? undefined : currentUser.userId);
    if (!customerUserId) {
      throw new BadRequestException('customer_user_id is required when creating a website chat thread');
    }

    const websiteOwner = await this.staffRepo.findOne({
      where: {
        website_id: websiteId,
        role: 'owner',
        is_active: true,
      },
      order: { created_at: 'ASC' },
    });

    const merchantUserId = websiteOwner?.user_id ?? currentUser.userId;
    const topic = await this.chatServiceClient.createDirectTopic({
      dmKey: `website:${websiteId}:${dto.channel_type}:${dto.product_id ?? dto.order_id ?? 'general'}:${customerUserId}:${merchantUserId}`,
      participantUserIds: [...new Set([customerUserId, merchantUserId])],
      name: dto.channel_label ?? 'Admin',
      createdByUserId: currentUser.userId,
    });

    const existingThread = await this.threadRepo.findOne({
      where: { topic_id: topic.id, website_id: websiteId },
    });
    if (existingThread) {
      return this.getThread(websiteId, existingThread.id, currentUser.userId);
    }

    const thread = this.threadRepo.create({
      topic_id: topic.id,
      merchant_id: merchantUserId,
      website_id: websiteId,
      channel_type: dto.channel_type,
      channel_label:
        dto.channel_label ??
        (dto.channel_type === 'product'
          ? 'Product inquiry'
          : dto.channel_type === 'support'
            ? 'Support'
            : dto.channel_type === 'transaction'
              ? 'TRX'
              : 'Order'),
      last_message_preview: dto.initial_message ? this.previewFromBody(dto.initial_message) : null,
      product_id: dto.product_id ?? null,
      order_id: dto.order_id ?? null,
      order_item_id: dto.order_item_id ?? null,
      customer_user_id: customerUserId,
      assigned_admin_user_id: dto.assigned_admin_user_id ?? null,
      participant_admin_user_ids: dto.assigned_admin_user_id ? [dto.assigned_admin_user_id] : [],
      status: 'open',
      last_message_at: new Date(),
      unread_count_by_admin: 0,
      is_archived: false,
    });

    let savedThread: WebsiteChatThread;
    try {
      savedThread = await this.threadRepo.save(thread);
    } catch (error) {
      const isUniqueTopicConflict =
        error instanceof QueryFailedError && (error.driverError as { code?: string } | undefined)?.code === '23505';
      if (!isUniqueTopicConflict) {
        throw error;
      }

      const concurrentThread = await this.threadRepo.findOne({
        where: { topic_id: topic.id, website_id: websiteId },
      });
      if (!concurrentThread) {
        throw error;
      }
      return this.getThread(websiteId, concurrentThread.id, currentUser.userId);
    }

    await this.eventBroadcaster.publishChatThreadCreated({
      merchantId: savedThread.merchant_id,
      websiteId: savedThread.website_id,
      appId: this.config.get<string>('EVENT_APP_ID') ?? this.config.get<string>('CLIENT_APP_ID') ?? 'bagdja-website-api',
      orgId: this.config.get<string>('EVENT_ORG_ID') ?? this.config.get<string>('CHAT_SERVICE_ORG_ID') ?? 'bagdja',
      threadId: savedThread.id,
      channelType: savedThread.channel_type,
      customerUserId: savedThread.customer_user_id,
      productId: savedThread.product_id,
      orderId: savedThread.order_id,
      assignedAdminUserId: savedThread.assigned_admin_user_id,
      createdAt: savedThread.created_at.toISOString(),
    });

    if (dto.initial_message && dto.initial_message.trim().length > 0) {
      const createdMessage = await this.chatServiceClient.createMessage(topic.id, {
        senderUserId: currentUser.userId,
        senderDisplayName: await this.getUserDisplayName(currentUser.userId, currentUser, isStaff),
        body: dto.initial_message,
      });

      await this.eventBroadcaster.publishChatMessageCreated({
        merchantId: savedThread.merchant_id,
        websiteId: savedThread.website_id,
        appId: this.config.get<string>('EVENT_APP_ID') ?? this.config.get<string>('CLIENT_APP_ID') ?? 'bagdja-website-api',
        orgId: this.config.get<string>('EVENT_ORG_ID') ?? this.config.get<string>('CHAT_SERVICE_ORG_ID') ?? 'bagdja',
        threadId: savedThread.id,
        messageId: createdMessage.id,
        channelType: savedThread.channel_type,
        senderType: isStaff ? 'admin' : 'customer',
        senderUserId: currentUser.userId,
        body: createdMessage.body,
        createdAt: createdMessage.createdAt,
      });
    }

    return this.getThread(websiteId, savedThread.id, currentUser.userId);
  }

  async listMessages(websiteId: string, threadId: string, userId: string) {
    const thread = await this.ensureThreadAccessForUser(websiteId, threadId, userId);

    if (!thread.topic_id) {
      return { items: [], total: 0 };
    }

    return this.chatServiceClient.listMessages(thread.topic_id);
  }

  async sendMessage(websiteId: string, threadId: string, userId: string, dto: SendWebsiteChatMessageDto) {
    const thread = await this.ensureThreadAccessForUser(websiteId, threadId, userId);

    if (!dto.body || dto.body.trim().length === 0) {
      throw new BadRequestException('Message body cannot be empty');
    }

    if (!thread.topic_id) {
      throw new BadRequestException('This chat thread is not mapped to a canonical topic yet');
    }

    const isAdmin = !!(await this.staffRepo.findOne({
      where: {
        website_id: websiteId,
        user_id: userId,
        is_active: true,
      },
    }));

    const isCustomer = thread.customer_user_id === userId;
    if (!isAdmin && !isCustomer) {
      throw new ForbiddenException('You do not have access to this chat thread');
    }

    const topicId = await this.ensureDirectTopic(websiteId, thread);
    const createdMessage = await this.chatServiceClient.createMessage(topicId, {
      senderUserId: userId,
      senderDisplayName: await this.getUserDisplayName(userId, undefined, isAdmin),
      body: dto.body.trim(),
    });

    thread.last_message_at = new Date();
    thread.last_message_preview = this.previewFromBody(createdMessage.body);
    await this.threadRepo.save(thread);

    await this.eventBroadcaster.publishChatMessageCreated({
      merchantId: thread.merchant_id,
      websiteId: websiteId,
      appId: this.config.get<string>('EVENT_APP_ID') ?? this.config.get<string>('CLIENT_APP_ID') ?? 'bagdja-website-api',
      orgId: this.config.get<string>('EVENT_ORG_ID') ?? this.config.get<string>('CHAT_SERVICE_ORG_ID') ?? 'bagdja',
      threadId: thread.id,
      messageId: createdMessage.id,
      channelType: thread.channel_type,
      senderType: isAdmin ? 'admin' : 'customer',
      senderUserId: userId,
      body: createdMessage.body,
      createdAt: createdMessage.createdAt,
    });

    return createdMessage;
  }

  async markThreadRead(websiteId: string, threadId: string, userId: string) {
    const thread = await this.ensureThreadAccessForUser(websiteId, threadId, userId);

    if (!thread.topic_id) {
      throw new BadRequestException('This chat thread is not mapped to a canonical topic yet');
    }

    const result = await this.chatServiceClient.markTopicRead(thread.topic_id, userId);
    const readStates = await this.chatServiceClient.getReadState(userId, [thread.topic_id]);
    const currentReadState = readStates.find((item) => item.topicId === thread.topic_id) ?? {
      topicId: thread.topic_id,
      lastReadMessageId: result.lastReadMessageId ?? null,
      unreadCount: 0,
    };
    const isAdmin = !!(await this.staffRepo.findOne({
      where: {
        website_id: websiteId,
        user_id: userId,
        is_active: true,
      },
    }));

    await this.eventBroadcaster.publishChatUnreadUpdated({
      merchantId: thread.merchant_id,
      websiteId: websiteId,
      appId: this.config.get<string>('EVENT_APP_ID') ?? this.config.get<string>('CLIENT_APP_ID') ?? 'bagdja-website-api',
      orgId: this.config.get<string>('EVENT_ORG_ID') ?? this.config.get<string>('CHAT_SERVICE_ORG_ID') ?? 'bagdja',
      threadId: thread.id,
      userId,
      userRole: isAdmin ? 'admin' : 'customer',
      unreadCount: currentReadState.unreadCount,
      updatedAt: new Date().toISOString(),
    });

    return result;
  }

  async getUnreadCount(websiteId: string, userId: string) {
    const isStaff = await this.isWebsiteStaff(websiteId, userId);
    if (isStaff) {
      await this.ensureWebsiteAccess(websiteId, userId);
    }

    const threads = isStaff
      ? await this.threadRepo.find({ where: { website_id: websiteId } })
      : await this.threadRepo.find({ where: { website_id: websiteId, customer_user_id: userId } });

    const topicIds = threads.map((thread) => thread.topic_id).filter((id): id is string => !!id);
    const readStates = await this.chatServiceClient.getReadState(userId, topicIds);
    const unreadCount = readStates.reduce((sum, item) => sum + item.unreadCount, 0);

    return {
      website_id: websiteId,
      user_id: userId,
      unread_count: unreadCount,
      unread_by_admin: unreadCount,
      unread_by_customer: 0,
    };
  }
}
