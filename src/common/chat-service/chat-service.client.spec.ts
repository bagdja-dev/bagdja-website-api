import { ChatServiceClient } from './chat-service.client';

describe('ChatServiceClient.createDirectTopic', () => {
  const fetchMock = jest.spyOn(global, 'fetch');

  beforeEach(() => {
    fetchMock.mockReset();
  });

  it('sends client type and context metadata without a caller-provided client id', async () => {
    const config = {
      get: jest.fn((key: string) => ({
        CHAT_SERVICE_URL: 'http://chat-service.test',
        BAGDJA_AUTH_API: 'http://auth.test',
        CLIENT_APP_ID: 'website-client',
        CLIENT_APP_SECRET: 'test-secret',
      })[key]),
    } as never;
    const client = new ChatServiceClient(config);
    const contextMetadata = [{
      type: 'website_thread',
      name: 'Kanopi',
      imageContext: { url: 'https://cdn.example.test/kanopi.jpg', alt: 'Kanopi' },
      data: { websiteId: 'website-id', channelType: 'product', productId: 'product-id' },
    }];

    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ 'x-api-token': 'client-token', expires_in: 3600 }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        text: async () => JSON.stringify({ id: 'topic-id' }),
      } as Response);

    await client.createDirectTopic({
      dmKey: 'website:website-id:product:product-id:customer-id:merchant-id',
      participantUserIds: ['customer-id', 'merchant-id'],
      name: 'Kanopi',
      createdByUserId: 'customer-id',
      appClientType: 'website',
      appClientTypeName: 'Website Builder',
      contextMetadata,
    });

    const requestBody = JSON.parse(String(fetchMock.mock.calls[1][1]?.body));
    expect(requestBody).toMatchObject({
      appClientType: 'website',
      appClientTypeName: 'Website Builder',
      contextMetadata,
    });
    expect(requestBody).not.toHaveProperty('appClientId');
  });

  it('adds a participant through the direct-topic roster endpoint', async () => {
    const config = {
      get: jest.fn((key: string) => ({
        CHAT_SERVICE_URL: 'http://chat-service.test',
        BAGDJA_AUTH_API: 'http://auth.test',
        CLIENT_APP_ID: 'website-client',
        CLIENT_APP_SECRET: 'test-secret',
      })[key]),
    } as never;
    const client = new ChatServiceClient(config);

    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ 'x-api-token': 'client-token', expires_in: 3600 }),
      } as Response)
      .mockResolvedValueOnce({ ok: true, text: async () => '{}' } as Response);

    await client.addDirectParticipant('topic-id', 'staff-id', 'staff@example.test');

    expect(fetchMock.mock.calls[1][0]).toBe('http://chat-service.test/topics/topic-id/participants');
    expect(JSON.parse(String(fetchMock.mock.calls[1][1]?.body))).toEqual({
      userId: 'staff-id',
      email: 'staff@example.test',
    });
  });
});