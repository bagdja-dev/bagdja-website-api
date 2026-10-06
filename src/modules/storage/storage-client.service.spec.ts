import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { BadGatewayException } from '@nestjs/common';
import { BagdjaLogger } from '@bagdja/node-sdk';
import { StorageClientService } from './storage-client.service';

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

describe('StorageClientService', () => {
  let service: StorageClientService;
  let fetchMock: jest.Mock;

  beforeEach(async () => {
    fetchMock = jest.fn();
    (global as any).fetch = fetchMock;

    const config = {
      get: (key: string) => {
        const map: Record<string, string> = {
          CLIENT_APP_ID: 'website-builder',
          CLIENT_APP_SECRET: 'test-secret',
          BAGDJA_STORAGE_API: 'http://storage.test',
          BAGDJA_AUTH_API: 'http://auth.test',
        };
        return map[key];
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StorageClientService,
        { provide: ConfigService, useValue: config },
        {
          provide: BagdjaLogger,
          useValue: { init: jest.fn(), bagdjaLog: jest.fn() },
        },
      ],
    }).compile();

    service = module.get(StorageClientService);
  });

  it('sends a public upload by default and returns the public URL', async () => {
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({ 'x-api-token': 'token-abc', expires_in: 3600 }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          id: 'file-1',
          org_id: 'org-1',
          app_id: 'app-1',
          bucket: 'public-bucket',
          key: 'org-1/app-1/file-1.png',
          kind: 'logo',
          is_public: true,
          mime_type: 'image/png',
          size_bytes: 128,
          public_url: 'https://cdn.example.com/org-1/app-1/file-1.png',
          created_at: '2026-10-06T00:00:00.000Z',
        }),
      );

    const result = await service.uploadFile(
      Buffer.from('hello'),
      'image/png',
      'logo.png',
      'logo',
    );

    expect(result).toEqual({
      fileId: 'file-1',
      url: 'https://cdn.example.com/org-1/app-1/file-1.png',
      path: 'org-1/app-1/file-1.png',
      mimeType: 'image/png',
      sizeBytes: 128,
      isPublic: true,
    });
    const form = fetchMock.mock.calls[1][1].body as FormData;
    expect(form.get('is_public')).toBe('true');
  });

  it('supports private uploads without requiring a public URL', async () => {
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({ 'x-api-token': 'token-abc', expires_in: 3600 }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          id: 'file-2',
          org_id: 'org-1',
          app_id: 'app-1',
          bucket: 'private-bucket',
          key: 'org-1/app-1/private/file-2.png',
          kind: 'logo',
          is_public: false,
          mime_type: 'image/png',
          size_bytes: 128,
          public_url: null,
          created_at: '2026-10-06T00:00:00.000Z',
        }),
      );

    const result = await service.uploadFile(
      Buffer.from('hello'),
      'image/png',
      'privatelogo.png',
      'logo',
      false,
    );

    expect(result).toEqual({
      fileId: 'file-2',
      url: null,
      path: 'org-1/app-1/private/file-2.png',
      mimeType: 'image/png',
      sizeBytes: 128,
      isPublic: false,
    });
    const form = fetchMock.mock.calls[1][1].body as FormData;
    expect(form.get('is_public')).toBe('false');
  });

  it('requests a scoped temporary access URL with the requested expiry', async () => {
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({ 'x-api-token': 'token-abc', expires_in: 3600 }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          url: 'https://signed.example.com/private',
          expires_in: 259200,
          expires_at: '2026-10-09T00:00:00.000Z',
        }),
      );

    await expect(service.getAccessUrl('file-private', 259200)).resolves.toEqual({
      url: 'https://signed.example.com/private',
      expiresIn: 259200,
      expiresAt: '2026-10-09T00:00:00.000Z',
    });
    expect(fetchMock.mock.calls[1][0]).toBe(
      'http://storage.test/files/file-private/access-url',
    );
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({
      expiry_seconds: 259200,
    });
  });

  it('deletes a file through the storage service', async () => {
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({ 'x-api-token': 'token-abc', expires_in: 3600 }),
      )
      .mockResolvedValueOnce({ ok: true, status: 204 } as Response);

    await expect(service.removeFile('file-to-delete')).resolves.toBeUndefined();
    expect(fetchMock.mock.calls[1][0]).toBe('http://storage.test/files/file-to-delete');
    expect(fetchMock.mock.calls[1][1].method).toBe('DELETE');
  });

  it('throws BadGatewayException when the storage API responds non-OK', async () => {
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({ 'x-api-token': 'token-abc', expires_in: 3600 }),
      )
      .mockResolvedValueOnce(jsonResponse({ message: 'boom' }, false, 502));

    await expect(
      service.uploadFile(Buffer.from('hello'), 'image/png', 'logo.png', 'logo'),
    ).rejects.toBeInstanceOf(BadGatewayException);
  });
});
