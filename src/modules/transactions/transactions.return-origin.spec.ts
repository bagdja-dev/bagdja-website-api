import { ConfigService } from '@nestjs/config';

import { TransactionsService } from './transactions.service';

const website = {
  id: 'site-1',
  slug: 'fashion-store',
  domain: 'fashion.bagdja.com',
  domain_verified_at: new Date('2026-09-01'),
};

function buildService(env: Record<string, string>, site: unknown = website) {
  const websiteRepo = { findOne: jest.fn().mockResolvedValue(site) };
  const service = new TransactionsService(
    new ConfigService(env),
    {} as any, // transactionRepo
    {} as any, // itemRepo
    {} as any, // orderRepo
    {} as any, // productRepo
    websiteRepo as any,
    {} as any, // flowRepo
    {} as any, // fulfillmentLogRepo
    {} as any, // terminRepo
    {} as any, // escrowClient
    {} as any, // shippingCalculation
    { notifyUser: jest.fn(), notifyWebsiteStaff: jest.fn() } as any,
    {} as any, // digitalDelivery
  );
  const resolve = (returnOrigin?: string): Promise<string> =>
    (service as any).resolveWebsiteAppUrl('site-1', returnOrigin);
  return { resolve };
}

const PROD_ENV = { SITE_APP_URL: 'https://sites.bagdja.com', PLATFORM_HOST: 'sites.bagdja.com' };

describe('TransactionsService — payment return origin', () => {
  it('returns to the platform subdomain the buyer checked out on, even when a custom domain is verified', async () => {
    const { resolve } = buildService(PROD_ENV);
    await expect(resolve('https://fashion-store.sites.bagdja.com')).resolves.toBe(
      'https://fashion-store.sites.bagdja.com',
    );
  });

  it('returns to the verified custom domain the buyer checked out on', async () => {
    const { resolve } = buildService(PROD_ENV);
    await expect(resolve('https://fashion.bagdja.com')).resolves.toBe('https://fashion.bagdja.com');
  });

  it.each([
    ['another tenant subdomain', 'https://other-store.sites.bagdja.com'],
    ['a foreign host', 'https://evil.example.com'],
    ['plain http on production', 'http://fashion-store.sites.bagdja.com'],
    ['a malformed value', 'not a url'],
  ])('ignores %s and falls back to the custom domain', async (_label, origin) => {
    const { resolve } = buildService(PROD_ENV);
    await expect(resolve(origin)).resolves.toBe('https://fashion.bagdja.com');
  });

  it('ignores an unverified custom domain', async () => {
    const { resolve } = buildService(PROD_ENV, { ...website, domain_verified_at: null });
    await expect(resolve('https://fashion.bagdja.com')).resolves.toBe(
      'https://fashion-store.sites.bagdja.com',
    );
  });

  it('keeps the previous behaviour without a return origin', async () => {
    const { resolve } = buildService(PROD_ENV);
    await expect(resolve()).resolves.toBe('https://fashion.bagdja.com');
  });

  it('uses the local origin with the slug path in development', async () => {
    const { resolve } = buildService({ SITE_APP_URL: 'http://localhost:5005' });
    await expect(resolve('http://localhost:5005')).resolves.toBe('http://localhost:5005/fashion-store');
  });

  it('does not accept localhost on production', async () => {
    const { resolve } = buildService(PROD_ENV);
    await expect(resolve('http://localhost:5005')).resolves.toBe('https://fashion.bagdja.com');
  });
});
