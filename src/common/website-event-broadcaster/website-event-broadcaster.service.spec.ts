import { ConfigService } from '@nestjs/config';
import { WebsiteEventBroadcasterService } from './website-event-broadcaster.service';

describe('WebsiteEventBroadcasterService', () => {
  it('publishes a website chat message event with the expected contract payload', async () => {
    const fetchMock = jest.fn().mockImplementation(async (url: string) => {
      if (url === 'http://localhost:4001/auth/client') {
        return {
          ok: true,
          json: async () => ({ 'x-api-token': 'test-token', expires_in: 3600 }),
          text: async () => '',
        } as Response;
      }

      return {
        ok: true,
        text: async () => '',
      } as Response;
    });
    global.fetch = fetchMock as typeof fetch;

    const config = new ConfigService({
      EVENT_SERVICE_URL: 'http://localhost:4085',
      BAGDJA_AUTH_API: 'http://localhost:4001',
      CLIENT_APP_ID: 'bagdja-website-api',
      CLIENT_APP_SECRET: 'secret',
      EVENT_ORG_ID: 'bagdja',
      EVENT_APP_ID: 'bagdja-website-api',
    });

    const service = new WebsiteEventBroadcasterService(config);

    await service.publishChatMessageCreated({
      merchantId: 'merchant-1',
      websiteId: 'website-1',
      orgId: 'bagdja',
      appId: 'bagdja-website-api',
      threadId: 'thread-1',
      messageId: 'message-1',
      channelType: 'product',
      senderType: 'customer',
      senderUserId: 'customer-1',
      body: 'Halo produk ini ready?',
      createdAt: '2026-09-25T12:00:00.000Z',
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:4085/broadcast',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'Content-Type': 'application/json',
        }),
        body: expect.stringContaining('website.chat.message.created'),
      }),
    );
  });
});
