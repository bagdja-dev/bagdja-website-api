import { BadGatewayException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { AndroidBuilderClientService } from './android-builder-client.service';

describe('AndroidBuilderClientService', () => {
  const configValues: Record<string, string> = {
    TWA_BUILDER_URL: 'http://localhost:4010',
    BAGDJA_AUTH_API: 'http://localhost:4001',
    CLIENT_APP_ID: 'website-builder',
    CLIENT_APP_SECRET: 'client-secret',
    NODE_ENV: 'test',
  };

  const createService = () => new AndroidBuilderClientService({
    get: jest.fn((key: string, fallback?: string) => configValues[key] ?? fallback),
  } as unknown as ConfigService);

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('sends a stable caller idempotency key and website scope when enqueueing', async () => {
    const fetch = jest.spyOn(global, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify({ 'x-api-token': 'server-token' })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ jobId: 'job-1', status: 'queued' })));

    await createService().enqueue({
      websiteId: 'website-1',
      idempotencyKey: 'request-1',
      payload: { targetUrl: 'https://shop.example.com' },
    });

    const request = fetch.mock.calls[1][1];
    expect(fetch.mock.calls[1][0]).toBe('http://localhost:4010/build-jobs');
    expect(request?.headers).toEqual(expect.objectContaining({
      'Idempotency-Key': 'request-1',
      'x-api-token': 'server-token',
    }));
    expect(JSON.parse(String(request?.body))).toMatchObject({
      source: 'website-builder',
      appId: 'website-builder',
      tenantId: 'website-1',
      platformId: 'website-1',
    });
  });

  it('queries history with both platform and tenant identifiers', async () => {
    const fetch = jest.spyOn(global, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify({ 'x-api-token': 'server-token' })))
      .mockResolvedValueOnce(new Response(JSON.stringify([])));

    await createService().listJobs('website-1');

    expect(fetch.mock.calls[1][0]).toBe(
      'http://localhost:4010/build-jobs?platformId=website-1&tenantId=website-1',
    );
  });

  it('rejects malformed history responses instead of silently accepting them', async () => {
    jest.spyOn(global, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify({ 'x-api-token': 'server-token' })))
      .mockResolvedValueOnce(new Response(JSON.stringify([{ id: 'job-1' }])));

    await expect(createService().listJobs('website-1')).rejects.toThrow(BadGatewayException);
  });

  it('maps upstream timeouts to an explicit gateway error', async () => {
    jest.spyOn(global, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify({ 'x-api-token': 'server-token' })))
      .mockRejectedValueOnce(new DOMException('timed out', 'TimeoutError'));

    await expect(createService().listJobs('website-1')).rejects.toThrow(BadGatewayException);
  });

  it('maps non-success Builder responses to an explicit gateway error', async () => {
    jest.spyOn(global, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify({ 'x-api-token': 'server-token' })))
      .mockResolvedValueOnce(new Response('', { status: 503 }));

    await expect(createService().listJobs('website-1')).rejects.toThrow(BadGatewayException);
  });
});
