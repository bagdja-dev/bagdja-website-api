import { BadRequestException } from '@nestjs/common';

import { ChatService } from './chat.service';

/** Chat-service mewajibkan ≥ 2 peserta topik DM; kasus 1 peserta harus ditolak sebelum memanggilnya. */
describe('ChatService.createCustomerThread', () => {
  function setup(ownerUserId: string | null) {
    const chatServiceClient = { createDirectTopic: jest.fn() };
    const repo = (findOne: jest.Mock) => ({ findOne, find: jest.fn(), create: jest.fn(), save: jest.fn() });
    const service = new ChatService(
      repo(jest.fn()) as never,
      repo(jest.fn(async () => (ownerUserId ? { user_id: ownerUserId, role: 'owner', is_active: true } : null))) as never,
      repo(jest.fn()) as never,
      repo(jest.fn(async () => ({ id: 'site-1' }))) as never,
      repo(jest.fn()) as never,
      repo(jest.fn()) as never,
      repo(jest.fn(async () => ({ id: 'transaction-1', website_id: 'site-1', buyer_user_id: 'other-buyer' }))) as never,
      { get: jest.fn() } as never,
      chatServiceClient as never,
      {} as never,
      {} as never,
    );
    return { service, chatServiceClient };
  }

  const dto = { channel_type: 'support', channel_label: 'Admin', initial_message: 'Halo' } as never;

  it('tells the website owner that buyer chat is for other accounts instead of failing with 502', async () => {
    const { service, chatServiceClient } = setup('owner-1');
    await expect(service.createCustomerThread('site-1', { userId: 'owner-1' } as never, dto))
      .rejects.toThrow(new BadRequestException(
        'Anda adalah pemilik website ini. Chat dengan admin hanya untuk pembeli — coba dengan akun lain, atau balas pesan pembeli dari Inbox Studio.',
      ));
    expect(chatServiceClient.createDirectTopic).not.toHaveBeenCalled();
  });

  it('rejects websites without an active owner', async () => {
    const { service, chatServiceClient } = setup(null);
    await expect(service.createCustomerThread('site-1', { userId: 'buyer-1' } as never, dto))
      .rejects.toThrow('Website ini belum memiliki pemilik aktif untuk menerima chat.');
    expect(chatServiceClient.createDirectTopic).not.toHaveBeenCalled();
  });

  it('does not allow a buyer to open a transaction chat for another buyer', async () => {
    const { service, chatServiceClient } = setup('owner-1');
    await expect(service.createCustomerThread('site-1', { userId: 'buyer-1' } as never, {
      channel_type: 'transaction',
      transaction_id: 'transaction-1',
      channel_label: 'TRX INV-001',
    } as never)).rejects.toThrow('Transaction does not belong to this customer');
    expect(chatServiceClient.createDirectTopic).not.toHaveBeenCalled();
  });

  it('creates an order-channel topic with the exact transaction context', async () => {
    const transaction = { id: 'transaction-1', website_id: 'site-1', buyer_user_id: 'buyer-1' };
    let savedThread: Record<string, unknown> | undefined;
    const threadRepo = {
      findOne: jest.fn()
        .mockResolvedValueOnce(null)
        .mockImplementation(async () => savedThread),
      create: jest.fn((input) => {
        savedThread = { ...input, id: 'thread-1', created_at: new Date() };
        return savedThread;
      }),
      save: jest.fn(async (thread) => thread),
      update: jest.fn(),
    };
    const staffRepo = {
      findOne: jest.fn(async ({ where }: { where: { user_id?: string; role?: string } }) =>
        where.role === 'owner' || where.user_id === 'owner-1'
          ? { user_id: 'owner-1', role: 'owner', is_active: true }
          : null),
    };
    const transactionRepo = { findOne: jest.fn(async () => transaction) };
    const chatServiceClient = {
      createDirectTopic: jest.fn(async () => ({ id: 'topic-1' })),
      createMessage: jest.fn(async () => ({ id: 'message-1', body: 'Halo', createdAt: new Date().toISOString() })),
    };
    const eventBroadcaster = {
      publishChatThreadCreated: jest.fn(),
      publishChatMessageCreated: jest.fn(),
    };
    const repo = (findOne: jest.Mock) => ({
      findOne,
      find: jest.fn(async () => []),
      create: jest.fn(),
      save: jest.fn(),
      update: jest.fn(),
    });
    const service = new ChatService(
      threadRepo as never,
      staffRepo as never,
      repo(jest.fn(async () => null)) as never,
      repo(jest.fn(async () => ({ id: 'site-1' }))) as never,
      repo(jest.fn()) as never,
      repo(jest.fn()) as never,
      transactionRepo as never,
      { get: jest.fn() } as never,
      chatServiceClient as never,
      eventBroadcaster as never,
      {} as never,
    );
    jest.spyOn(service as never, 'notifyChatEvent').mockResolvedValue(undefined as never);

    await service.createCustomerThread('site-1', { userId: 'buyer-1' } as never, {
      channel_type: 'transaction',
      transaction_id: 'transaction-1',
      channel_label: 'TRX INV-001',
      initial_message: 'Halo',
    } as never);

    expect(chatServiceClient.createDirectTopic).toHaveBeenCalledWith(expect.objectContaining({
      dmKey: 'website:site-1:order:transaction-1:buyer-1:owner-1',
      name: 'TRX INV-001',
      contextMetadata: [expect.objectContaining({
        data: expect.objectContaining({ channelType: 'order', transactionId: 'transaction-1' }),
      })],
    }));
    expect(threadRepo.create).toHaveBeenCalledWith(expect.objectContaining({
      channel_type: 'order',
      transaction_id: 'transaction-1',
    }));
  });
});

/** Staf toko yang memesan sendiri (mis. anggota tim yang menguji transaksi) bicara sebagai pembeli. */
describe('ChatService.sendMessage', () => {
  function setup(staffUserIds: string[]) {
    const thread = {
      id: 'thread-1', website_id: 'site-1', customer_user_id: 'tester-1', merchant_id: 'owner-1',
      channel_type: 'order', channel_label: 'Rencana', order_id: 'order-1', topic_id: 'topic-1',
      chat_participant_admin_user_ids: [],
    };
    const chatServiceClient = {
      createDirectTopic: jest.fn(async () => ({ id: 'topic-1' })),
      addDirectParticipant: jest.fn(),
      createMessage: jest.fn(async (_topicId: string, input: { body: string }) => ({ id: 'm1', body: input.body, createdAt: 'now' })),
    };
    const eventBroadcaster = { publishChatMessageCreated: jest.fn() };
    const staffFindOne = jest.fn(async ({ where }: { where: { user_id?: string } }) =>
      where.user_id && staffUserIds.includes(where.user_id) ? { user_id: where.user_id, is_active: true } : null);
    const repo = (findOne: jest.Mock) => ({ findOne, find: jest.fn(async () => []), create: jest.fn(), save: jest.fn(), update: jest.fn() });
    const service = new ChatService(
      repo(jest.fn(async () => thread)) as never,
      repo(staffFindOne) as never,
      repo(jest.fn(async () => null)) as never,
      repo(jest.fn()) as never,
      repo(jest.fn()) as never,
      repo(jest.fn()) as never,
      repo(jest.fn()) as never,
      { get: jest.fn() } as never,
      chatServiceClient as never,
      eventBroadcaster as never,
      { notifyUser: jest.fn(), notifyWebsiteStaff: jest.fn() } as never,
    );
    jest.spyOn(service as never, 'notifyChatEvent').mockResolvedValue(undefined as never);
    return { service, chatServiceClient, eventBroadcaster };
  }

  it('treats a staff member who is the thread customer as the customer', async () => {
    const { service, chatServiceClient, eventBroadcaster } = setup(['tester-1', 'owner-1']);
    await service.sendMessage('site-1', 'thread-1', 'tester-1', { body: 'Halo' } as never);
    expect(chatServiceClient.addDirectParticipant).not.toHaveBeenCalled();
    expect(eventBroadcaster.publishChatMessageCreated).toHaveBeenCalledWith(expect.objectContaining({ senderType: 'customer' }));
  });

  it('keeps other staff as admin', async () => {
    const { service, chatServiceClient, eventBroadcaster } = setup(['tester-1', 'owner-1']);
    await service.sendMessage('site-1', 'thread-1', 'owner-1', { body: 'Halo' } as never);
    expect(chatServiceClient.addDirectParticipant).toHaveBeenCalledWith('topic-1', 'owner-1', undefined);
    expect(eventBroadcaster.publishChatMessageCreated).toHaveBeenCalledWith(expect.objectContaining({ senderType: 'admin' }));
  });
});

/** Inbox Studio membuka detail gathering dari thread order (group_id dari metadata order). */
describe('ChatService thread order context', () => {
  it('adds gathering_group_id for threads linked to gathering orders', async () => {
    const userRepo = { find: jest.fn(async () => [{ id: 'buyer-1', name: 'Dewi' }]) };
    const orderRepo = {
      find: jest.fn(async () => [
        { id: 'order-plan', metadata: { gathering: { role: 'initiator', group_id: 'group-1' } } },
        { id: 'order-plain', metadata: {} },
      ]),
    };
    const repo = () => ({ findOne: jest.fn(), find: jest.fn(), create: jest.fn(), save: jest.fn() });
    const service = new ChatService(
      repo() as never,
      repo() as never,
      userRepo as never,
      repo() as never,
      repo() as never,
      orderRepo as never,
      repo() as never,
      { get: jest.fn() } as never,
      {} as never,
      {} as never,
      {} as never,
    );
    const threads = [
      { id: 't1', customer_user_id: 'buyer-1', order_id: 'order-plan' },
      { id: 't2', customer_user_id: 'buyer-1', order_id: 'order-plain' },
      { id: 't3', customer_user_id: 'buyer-1', order_id: null },
    ];
    const enriched = await (service as unknown as { addCustomerNames: (rows: unknown[]) => Promise<Array<{ gathering_group_id: string | null; customer_name: string }>> })
      .addCustomerNames(threads);
    expect(enriched.map((thread) => thread.gathering_group_id)).toEqual(['group-1', null, null]);
    expect(enriched[0].customer_name).toBe('Dewi');
    expect(orderRepo.find).toHaveBeenCalledTimes(1);
  });
});
