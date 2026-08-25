import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { BadGatewayException } from '@nestjs/common';
import { BagdjaLogger } from '@bagdja/node-sdk';
import { ShippingClientService } from './shipping-client.service';

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

describe('ShippingClientService', () => {
  let service: ShippingClientService;
  let fetchMock: jest.Mock;

  beforeEach(async () => {
    fetchMock = jest.fn();
    (global as any).fetch = fetchMock;

    const config = {
      get: (key: string) => {
        const map: Record<string, string> = {
          CLIENT_APP_ID: 'website-builder',
          CLIENT_APP_SECRET: 'test-secret',
          BAGDJA_SHIPPING_API: 'http://shipping.test',
          BAGDJA_AUTH_API: 'http://auth.test',
        };
        return map[key];
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ShippingClientService,
        { provide: ConfigService, useValue: config },
        {
          provide: BagdjaLogger,
          useValue: { init: jest.fn(), bagdjaLog: jest.fn() },
        },
      ],
    }).compile();

    service = module.get(ShippingClientService);
  });

  function mockAuthThenApi(apiResponse: Response) {
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({ 'x-api-token': 'token-abc', expires_in: 3600 }),
      )
      .mockResolvedValueOnce(apiResponse);
  }

  it('fetches a client token once then reuses the cache on subsequent calls', async () => {
    mockAuthThenApi(jsonResponse([{ providerAreaId: '1391', name: 'Jakarta', type: 'district' }]));
    fetchMock.mockResolvedValueOnce(
      jsonResponse([{ providerAreaId: '1391', name: 'Jakarta', type: 'district' }]),
    );

    await service.searchArea('jakarta');
    await service.searchArea('jakarta');

    const authCalls = fetchMock.mock.calls.filter(([url]) => String(url).includes('/auth/client'));
    expect(authCalls).toHaveLength(1);
  });

  it('maps searchArea response', async () => {
    mockAuthThenApi(
      jsonResponse([{ providerAreaId: '1391', name: 'Jakarta Selatan, DKI Jakarta', type: 'district' }]),
    );

    const result = await service.searchArea('jakarta');

    expect(result).toEqual([
      { providerAreaId: '1391', name: 'Jakarta Selatan, DKI Jakarta', type: 'district' },
    ]);
    const [, apiCall] = fetchMock.mock.calls;
    expect(apiCall[0]).toBe('http://shipping.test/shipping/areas?q=jakarta');
    expect((apiCall[1].headers as Record<string, string>)['x-api-token']).toBe('token-abc');
  });

  it('maps getCost response', async () => {
    mockAuthThenApi(
      jsonResponse([{ courierCode: 'jne', serviceName: 'REG', cost: 12000 }]),
    );

    const result = await service.getCost({
      origin_area_id: '1391',
      destination_area_id: '1376',
      weight_grams: 1000,
    });

    expect(result).toEqual([{ courierCode: 'jne', serviceName: 'REG', cost: 12000 }]);
  });

  it('throws BadGatewayException when the shipping API responds non-OK', async () => {
    mockAuthThenApi(jsonResponse({ message: 'boom' }, false, 502));

    await expect(service.searchArea('jakarta')).rejects.toBeInstanceOf(BadGatewayException);
  });

  it('throws BadGatewayException when fetch itself rejects (network error)', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ 'x-api-token': 'token-abc', expires_in: 3600 }))
      .mockRejectedValueOnce(new Error('ECONNREFUSED'));

    await expect(service.searchArea('jakarta')).rejects.toBeInstanceOf(BadGatewayException);
  });
});
