import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { In, Repository } from 'typeorm';

import { BusinessProfileWaitlist, Website, WebsiteEventGroup, WebsiteTransaction } from '../../entities';

import { CORE_MODULE_KEYS, allAvailableModules, resolveModules } from './business-profile.registry';
import {
  RUNNING_GATHERING_STATUSES,
  RUNNING_TRANSACTION_STATUSES,
  WebsiteModulesService,
  assertSelectableProfile,
} from './website-modules.service';

type Mocked<T, K extends keyof T> = jest.Mocked<Pick<T, K>>;

describe('WebsiteModulesService', () => {
  let service: WebsiteModulesService;
  let websiteRepo: { findOne: jest.Mock; save: jest.Mock };
  let transactionRepo: Mocked<Repository<WebsiteTransaction>, 'count'>;
  let eventGroupRepo: Mocked<Repository<WebsiteEventGroup>, 'count'>;
  let insertExecute: jest.Mock;
  let insertValues: jest.Mock;
  let waitlistRepo: { createQueryBuilder: jest.Mock };

  const makeWebsite = (business_profile: string, enabled_modules: string[]): Website =>
    ({ id: 'w1', business_profile, enabled_modules }) as Website;

  beforeEach(() => {
    websiteRepo = { findOne: jest.fn(), save: jest.fn(async (w: Website) => w) };
    transactionRepo = { count: jest.fn().mockResolvedValue(0) };
    eventGroupRepo = { count: jest.fn().mockResolvedValue(0) };
    insertExecute = jest.fn().mockResolvedValue({});
    insertValues = jest.fn();
    const qb = {
      insert: jest.fn().mockReturnThis(),
      into: jest.fn().mockReturnThis(),
      values: insertValues.mockReturnThis(),
      orIgnore: jest.fn().mockReturnThis(),
      execute: insertExecute,
    };
    insertValues.mockReturnValue(qb);
    waitlistRepo = { createQueryBuilder: jest.fn().mockReturnValue(qb) };
    service = new WebsiteModulesService(
      websiteRepo as unknown as Repository<Website>,
      transactionRepo as unknown as Repository<WebsiteTransaction>,
      eventGroupRepo as unknown as Repository<WebsiteEventGroup>,
      waitlistRepo as unknown as Repository<BusinessProfileWaitlist>,
    );
  });

  describe('listBusinessProfiles', () => {
    it('returns 9 profiles (no legacy) sorted, with resolved presets and the full module registry', () => {
      const res = service.listBusinessProfiles();
      expect(res.profiles).toHaveLength(9);
      expect(res.profiles.map((p) => p.id)).not.toContain('legacy');
      expect(res.profiles.map((p) => p.sortOrder)).toEqual([...res.profiles.map((p) => p.sortOrder)].sort((a, b) => a - b));
      const service_business = res.profiles.find((p) => p.id === 'service_business');
      expect(service_business?.defaultModules).toEqual(expect.arrayContaining([...CORE_MODULE_KEYS, 'appointments']));
      expect(res.modules.find((m) => m.key === 'wallet')?.ownerOnly).toBe(true);
    });
  });

  describe('getModules', () => {
    it('legacy with empty snapshot reports all available modules as enabled', async () => {
      websiteRepo.findOne.mockResolvedValue(makeWebsite('legacy', []));
      const res = await service.getModules('w1');
      expect(res.businessProfile).toBe('legacy');
      expect(res.enabledModules).toEqual(allAvailableModules());
      expect(res.modules.find((m) => m.key === 'appointments')?.enabled).toBe(false);
    });

    it('fills blockedReason for core, dependency and running-data cases', async () => {
      websiteRepo.findOne.mockResolvedValue(makeWebsite('online_store', resolveModules(['quotes'])));
      transactionRepo.count.mockResolvedValue(2);
      const res = await service.getModules('w1');
      const byKey = new Map(res.modules.map((m) => [m.key, m]));
      expect(byKey.get('wallet')?.blockedReason).toBe('Modul inti selalu aktif.');
      expect(byKey.get('orders')?.blockedReason).toContain('Penawaran');
      expect(byKey.get('quotes')?.blockedReason).toBeNull();
      expect(byKey.get('blog')?.blockedReason).toBeNull();
    });

    it('404 when website does not exist', async () => {
      websiteRepo.findOne.mockResolvedValue(null);
      await expect(service.getModules('nope')).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('updateModules', () => {
    it('materialises the legacy effective set on first PATCH', async () => {
      const website = makeWebsite('legacy', []);
      websiteRepo.findOne.mockResolvedValue(website);
      const res = await service.updateModules('w1', { disable: ['blog'] });
      expect(website.enabled_modules).toEqual(allAvailableModules().filter((k) => k !== 'blog'));
      expect(res.enabledModules).not.toContain('blog');
      expect(websiteRepo.save).toHaveBeenCalledWith(website);
    });

    it('auto-enables dependencies', async () => {
      websiteRepo.findOne.mockResolvedValue(makeWebsite('company_profile', resolveModules(['blog'])));
      const res = await service.updateModules('w1', { enable: ['quotes'] });
      expect(res.enabledModules).toEqual(expect.arrayContaining(['quotes', 'orders', 'catalog', 'blog']));
    });

    it('409 when disabling orders with running transactions', async () => {
      websiteRepo.findOne.mockResolvedValue(makeWebsite('online_store', resolveModules(['orders'])));
      transactionRepo.count.mockResolvedValue(1);
      await expect(service.updateModules('w1', { disable: ['orders'] })).rejects.toBeInstanceOf(ConflictException);
      expect(transactionRepo.count).toHaveBeenCalledWith({
        where: { website_id: 'w1', status: In([...RUNNING_TRANSACTION_STATUSES]) },
      });
      expect(websiteRepo.save).not.toHaveBeenCalled();
    });

    it('409 when disabling events with running gatherings', async () => {
      websiteRepo.findOne.mockResolvedValue(makeWebsite('gathering', resolveModules(['events'])));
      eventGroupRepo.count.mockResolvedValue(3);
      await expect(service.updateModules('w1', { disable: ['events'] })).rejects.toThrow(/3 gathering berjalan/);
      expect(eventGroupRepo.count).toHaveBeenCalledWith({
        where: { website_id: 'w1', status: In([...RUNNING_GATHERING_STATUSES]) },
      });
    });

    it('allows disabling orders when no transaction is running', async () => {
      websiteRepo.findOne.mockResolvedValue(makeWebsite('online_store', resolveModules(['orders'])));
      const res = await service.updateModules('w1', { disable: ['orders'] });
      expect(res.enabledModules).not.toContain('orders');
    });

    it('409 for core, 400 for coming_soon', async () => {
      websiteRepo.findOne.mockResolvedValue(makeWebsite('online_store', resolveModules(['catalog'])));
      await expect(service.updateModules('w1', { disable: ['settings'] })).rejects.toBeInstanceOf(ConflictException);
      await expect(service.updateModules('w1', { enable: ['rental'] })).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('updateBusinessProfile', () => {
    it('without preset keeps the effective modules (legacy → frozen all-available)', async () => {
      const website = makeWebsite('legacy', []);
      websiteRepo.findOne.mockResolvedValue(website);
      const res = await service.updateBusinessProfile('w1', { businessProfile: 'company_profile', applyPreset: false });
      expect(website.business_profile).toBe('company_profile');
      expect(res.enabledModules).toEqual(allAvailableModules());
    });

    it('with preset adds preset modules without disabling existing ones', async () => {
      websiteRepo.findOne.mockResolvedValue(makeWebsite('company_profile', resolveModules(['blog'])));
      const res = await service.updateBusinessProfile('w1', { businessProfile: 'project_quotation', applyPreset: true });
      expect(res.enabledModules).toEqual(expect.arrayContaining(['blog', 'quotes', 'billing', 'fulfillment']));
    });

    it('rejects coming_soon profiles', async () => {
      websiteRepo.findOne.mockResolvedValue(makeWebsite('online_store', []));
      await expect(
        service.updateBusinessProfile('w1', { businessProfile: 'place_rental', applyPreset: true }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('registerWaitlist', () => {
    it('inserts idempotently for coming_soon profiles', async () => {
      await expect(service.registerWaitlist('u1', 'vehicle_rental')).resolves.toEqual({ registered: true });
      expect(insertValues).toHaveBeenCalledWith({ user_id: 'u1', business_profile: 'vehicle_rental' });
      expect(insertExecute).toHaveBeenCalled();
    });

    it('404 for unknown/legacy and 400 for available profiles', async () => {
      await expect(service.registerWaitlist('u1', 'legacy')).rejects.toBeInstanceOf(NotFoundException);
      await expect(service.registerWaitlist('u1', 'nope')).rejects.toBeInstanceOf(NotFoundException);
      await expect(service.registerWaitlist('u1', 'online_store')).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('assertSelectableProfile', () => {
    it('accepts available, rejects legacy/unknown/coming_soon', () => {
      expect(assertSelectableProfile('online_store').id).toBe('online_store');
      expect(() => assertSelectableProfile('legacy')).toThrow(BadRequestException);
      expect(() => assertSelectableProfile('xyz')).toThrow(BadRequestException);
      expect(() => assertSelectableProfile('event_ticketing')).toThrow(BadRequestException);
    });
  });
});
