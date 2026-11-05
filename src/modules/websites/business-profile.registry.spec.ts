import {
  BUSINESS_PROFILES,
  CORE_MODULE_KEYS,
  MODULE_KEYS,
  MODULE_REGISTRY,
  allAvailableModules,
  effectiveModules,
  isModuleChangeError,
  planModuleChange,
  profilePresetModules,
  resolveModules,
  withDependencies,
  type ModuleChangePlan,
  type ModuleKey,
} from './business-profile.registry';

function expectPlan(result: ReturnType<typeof planModuleChange>): ModuleChangePlan {
  if (isModuleChangeError(result)) throw new Error(`Expected plan, got error: ${result.message}`);
  return result;
}

describe('business-profile.registry', () => {
  describe('registry integrity', () => {
    it('has unique module keys covering every ModuleKey', () => {
      const keys = MODULE_REGISTRY.map((m) => m.key);
      expect(new Set(keys).size).toBe(keys.length);
      expect([...keys].sort()).toEqual([...MODULE_KEYS].sort());
    });

    it('only depends on known modules', () => {
      for (const m of MODULE_REGISTRY) {
        for (const dep of m.dependsOn) expect(MODULE_KEYS).toContain(dep);
      }
    });

    it('marks wallet & subscription as owner-only core modules', () => {
      const ownerOnly = MODULE_REGISTRY.filter((m) => m.ownerOnly).map((m) => m.key).sort();
      expect(ownerOnly).toEqual(['subscription', 'wallet']);
      expect([...CORE_MODULE_KEYS].sort()).toEqual(['settings', 'site_content', 'subscription', 'team', 'wallet']);
    });

    it('has 9 selectable profiles + legacy with known default modules', () => {
      expect(BUSINESS_PROFILES).toHaveLength(10);
      for (const p of BUSINESS_PROFILES) {
        for (const key of p.defaultModules) expect(MODULE_KEYS).toContain(key);
      }
      const comingSoon = BUSINESS_PROFILES.filter((p) => p.status === 'coming_soon').map((p) => p.id).sort();
      expect(comingSoon).toEqual(['event_ticketing', 'place_rental', 'vehicle_rental']);
    });
  });

  describe('resolveModules', () => {
    it('adds dependencies (recursively) and core modules', () => {
      const result = resolveModules(['quotes']);
      expect(result).toEqual(expect.arrayContaining([...CORE_MODULE_KEYS, 'quotes', 'orders', 'catalog']));
      expect(result).toHaveLength(CORE_MODULE_KEYS.length + 3);
    });

    it('resolves vendors → orders + locations + catalog', () => {
      expect(withDependencies(['vendors'])).toEqual(['catalog', 'orders', 'locations', 'vendors']);
    });

    it('drops coming_soon modules and unknown keys by default', () => {
      const result = resolveModules(['appointments', 'nope']);
      expect(result).not.toContain('appointments');
      expect(result).toEqual(expect.arrayContaining(['catalog', 'orders', 'locations']));
    });

    it('keeps coming_soon modules when requested', () => {
      expect(resolveModules(['asset_tracking'], { includeComingSoon: true })).toEqual(
        expect.arrayContaining(['asset_tracking', 'rental']),
      );
    });

    it('returns keys in registry order without duplicates', () => {
      const result = resolveModules(['faq', 'catalog', 'faq']);
      const order = MODULE_REGISTRY.map((m) => m.key);
      expect(result).toEqual([...result].sort((a, b) => order.indexOf(a) - order.indexOf(b)));
      expect(new Set(result).size).toBe(result.length);
    });
  });

  describe('profilePresetModules', () => {
    it('service_business preset excludes coming_soon appointments but keeps its dependencies', () => {
      const preset = profilePresetModules('service_business');
      expect(preset).not.toContain('appointments');
      expect(preset).toEqual(
        expect.arrayContaining(['catalog', 'orders', 'fulfillment', 'locations', 'customer_chat', 'faq', ...CORE_MODULE_KEYS]),
      );
    });

    it('company_profile preset has no transaction modules', () => {
      const preset = profilePresetModules('company_profile');
      expect(preset).not.toContain('orders');
      expect(preset).not.toContain('catalog');
    });
  });

  describe('effectiveModules', () => {
    it('legacy with empty snapshot → all available modules (safe fallback)', () => {
      expect(effectiveModules({ business_profile: 'legacy', enabled_modules: [] })).toEqual(allAvailableModules());
      expect(effectiveModules({ business_profile: 'legacy', enabled_modules: null })).toEqual(allAvailableModules());
    });

    it('legacy with backfilled snapshot uses the snapshot (+ core)', () => {
      const result = effectiveModules({ business_profile: 'legacy', enabled_modules: ['catalog'] });
      expect(result).toEqual([...CORE_MODULE_KEYS, 'catalog']);
    });

    it('non-legacy empty snapshot → core only', () => {
      expect(effectiveModules({ business_profile: 'online_store', enabled_modules: [] })).toEqual([...CORE_MODULE_KEYS]);
    });

    it('drops stale/unknown keys from the snapshot', () => {
      expect(effectiveModules({ business_profile: 'online_store', enabled_modules: ['catalog', 'old_key'] })).not.toContain('old_key');
    });

    it('never includes coming_soon modules', () => {
      const all = allAvailableModules();
      expect(all).not.toEqual(expect.arrayContaining(['appointments']));
      expect(all).not.toContain('rental');
    });
  });

  describe('planModuleChange', () => {
    const base: ModuleKey[] = resolveModules(['catalog', 'customer_chat']);

    it('auto-enables dependencies', () => {
      const plan = expectPlan(planModuleChange(base, ['billing']));
      expect(plan.modules).toEqual(expect.arrayContaining(['billing', 'orders', 'catalog']));
      expect(plan.turnedOn.sort()).toEqual(['billing', 'orders']);
      expect(plan.turnedOff).toEqual([]);
    });

    it('blocks disabling a core module (conflict)', () => {
      const result = planModuleChange(base, [], ['wallet']);
      expect(isModuleChangeError(result) && result.kind).toBe('conflict');
    });

    it('blocks disabling a module used by another enabled module (conflict)', () => {
      const current = resolveModules(['quotes']);
      const result = planModuleChange(current, [], ['orders']);
      expect(isModuleChangeError(result)).toBe(true);
      if (isModuleChangeError(result)) {
        expect(result.kind).toBe('conflict');
        expect(result.message).toContain('Penawaran');
      }
    });

    it('allows disabling a module together with its dependents', () => {
      const current = resolveModules(['quotes']);
      const plan = expectPlan(planModuleChange(current, [], ['orders', 'quotes']));
      expect(plan.modules).not.toContain('orders');
      expect(plan.modules).toContain('catalog');
      expect(plan.turnedOff.sort()).toEqual(['orders', 'quotes']);
    });

    it('blocks enabling coming_soon modules (invalid)', () => {
      const result = planModuleChange(base, ['appointments']);
      expect(isModuleChangeError(result) && result.kind).toBe('invalid');
    });

    it('rejects unknown keys and keys in both lists (invalid)', () => {
      expect(isModuleChangeError(planModuleChange(base, ['nope']))).toBe(true);
      const both = planModuleChange(base, ['faq'], ['faq']);
      expect(isModuleChangeError(both) && both.kind).toBe('invalid');
    });

    it('enabling a dependency of a module being disabled in the same request is blocked', () => {
      const result = planModuleChange(base, ['quotes'], ['orders']);
      expect(isModuleChangeError(result) && result.kind).toBe('conflict');
    });

    it('disabling an already-disabled optional module is a no-op', () => {
      const plan = expectPlan(planModuleChange(base, [], ['blog']));
      expect(plan.modules).toEqual(base);
      expect(plan.turnedOff).toEqual([]);
    });

    it('starts from the legacy effective set (all available)', () => {
      const legacy = effectiveModules({ business_profile: 'legacy', enabled_modules: [] });
      const plan = expectPlan(planModuleChange(legacy, [], ['blog']));
      expect(plan.modules).toEqual(legacy.filter((k) => k !== 'blog'));
    });
  });
});
