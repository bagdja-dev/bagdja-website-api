import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { MODULE_KEYS } from '../websites/business-profile.registry';

import {
  SECTION_SCHEMAS,
  SYSTEM_SECTION_TYPES,
  getSectionSchema,
  sectionSchemasFor,
  type SectionFieldDef,
} from './section-schema.registry';
import { BUILTIN_TEMPLATE_MANIFESTS, isTemplateManifest } from './template-manifest';

const CATEGORIES = ['opening', 'story', 'sell', 'info', 'blog'];

function walkFields(fields: SectionFieldDef[], depth: number, visit: (f: SectionFieldDef, depth: number) => void): void {
  for (const f of fields) {
    visit(f, depth);
    if (f.itemFields) walkFields(f.itemFields, depth + 1, visit);
  }
}

describe('section-schema.registry', () => {
  it('has unique section types and no system (route-injected) types', () => {
    const types = SECTION_SCHEMAS.map((s) => s.type);
    expect(new Set(types).size).toBe(types.length);
    for (const t of SYSTEM_SECTION_TYPES) expect(types).not.toContain(t);
  });

  it('every schema has a valid category, version, unique field keys and a known requiredModule', () => {
    for (const s of SECTION_SCHEMAS) {
      expect(CATEGORIES).toContain(s.category);
      expect(s.schemaVersion).toBeGreaterThanOrEqual(1);
      expect(s.label.length).toBeGreaterThan(0);
      const keys = s.fields.map((f) => f.key);
      expect(new Set(keys).size).toBe(keys.length);
      if (s.requiredModule) expect(MODULE_KEYS).toContain(s.requiredModule);
    }
  });

  it('list fields have itemFields and lists are never nested', () => {
    for (const s of SECTION_SCHEMAS) {
      walkFields(s.fields, 0, (f, depth) => {
        if (f.type === 'list') {
          expect(f.itemFields?.length).toBeGreaterThan(0);
          expect(depth).toBe(0);
        }
        if (f.type === 'select') expect(f.options?.length).toBeGreaterThan(0);
      });
    }
  });

  it('defaults only use keys declared in fields', () => {
    for (const s of SECTION_SCHEMAS) {
      const keys = new Set(s.fields.map((f) => f.key));
      for (const key of Object.keys(s.defaults)) {
        expect({ type: s.type, key, declared: keys.has(key) }).toEqual({ type: s.type, key, declared: true });
      }
    }
  });

  it('hero is a singleton pinned to the top; nothing else is', () => {
    const pinned = SECTION_SCHEMAS.filter((s) => s.pinned || s.singleton).map((s) => s.type);
    expect(pinned).toEqual(['hero']);
    expect(getSectionSchema('hero')).toMatchObject({ singleton: true, pinned: 'top', category: 'opening' });
  });

  it('keeps stored content shapes backward compatible', () => {
    const hero = getSectionSchema('hero');
    expect(hero?.fields.find((f) => f.key === 'stats')?.itemFields?.map((f) => f.key)).toEqual(['value', 'label']);
    const testimonial = getSectionSchema('testimonial');
    expect(testimonial?.fields.find((f) => f.key === 'items')?.itemFields?.map((f) => f.key)).toEqual(['quote', 'context', 'location']);
    const features = getSectionSchema('features_grid')?.fields.find((f) => f.key === 'features');
    expect(features).toMatchObject({
      type: 'list',
      itemFields: [
        { key: 'icon', type: 'iconPicker' },
        { key: 'title', type: 'text' },
        { key: 'desc', type: 'textarea' },
      ],
    });
    expect(features?.maxItems).toBeUndefined();
  });

  it('offers gathering products in sales section filters', () => {
    for (const sectionType of ['services_grid', 'products_grid']) {
      const filter = getSectionSchema(sectionType)?.fields.find((field) => field.key === 'filter_type');
      expect(filter?.options).toContainEqual({ value: 'gathering', label: 'Gathering' });
    }
  });

  it('uses single product selection for featured product', () => {
    const productPicker = getSectionSchema('featured_product')?.fields.find((field) => field.key === 'product_ids');
    expect(productPicker).toMatchObject({ type: 'productPicker', maxItems: 1 });
    expect(productPicker?.multiple).toBeUndefined();
  });

  it('uses a dynamic FAQ category picker for the FAQ section', () => {
    const categoryField = getSectionSchema('faq_list')?.fields.find((field) => field.key === 'filter_category');
    expect(categoryField).toMatchObject({ type: 'faqCategoryPicker', default: '' });
  });

  it('cta v2 uses a typed button action and stays backward compatible with v1 keys', () => {
    const cta = getSectionSchema('cta');
    expect(cta?.schemaVersion).toBe(2);
    const keys = cta?.fields.map((f) => f.key) ?? [];
    for (const legacy of ['title', 'subtitle', 'button_text', 'button_url']) expect(keys).toContain(legacy);
    const action = cta?.fields.find((f) => f.key === 'button_action');
    expect(action).toMatchObject({ type: 'select', display: 'segmented', default: 'whatsapp' });
    expect(action?.options?.map((o) => o.value)).toEqual(['whatsapp', 'phone', 'email', 'link']);
    expect(cta?.defaults.button_action).toBe('whatsapp');
    const byKey = (key: string) => cta?.fields.find((f) => f.key === key);
    expect(byKey('button_whatsapp')).toMatchObject({ type: 'phone', showWhen: { field: 'button_action', equals: 'whatsapp' } });
    expect(byKey('button_message')).toMatchObject({ type: 'textarea', showWhen: { field: 'button_action', equals: 'whatsapp' } });
    expect(byKey('button_phone')).toMatchObject({ type: 'phone', showWhen: { field: 'button_action', equals: 'phone' } });
    expect(byKey('button_email')).toMatchObject({ type: 'email', showWhen: { field: 'button_action', equals: 'email' } });
    expect(byKey('button_subject')?.showWhen).toEqual({ field: 'button_action', equals: 'email' });
    expect(byKey('button_url')).toMatchObject({ type: 'url', showWhen: { field: 'button_action', equals: 'link' } });
  });

  it('showWhen always references an existing select field in the same level with valid options', () => {
    for (const s of SECTION_SCHEMAS) {
      const check = (fields: SectionFieldDef[]): void => {
        for (const f of fields) {
          if (f.showWhen) {
            const target = fields.find((x) => x.key === f.showWhen?.field);
            expect({ type: s.type, key: f.key, found: Boolean(target) }).toEqual({ type: s.type, key: f.key, found: true });
            expect(target?.type).toBe('select');
            const allowed = (target?.options ?? []).map((o) => o.value);
            for (const v of [f.showWhen.equals].flat()) expect(allowed).toContain(v);
          }
          if (f.display) expect(f).toMatchObject({ type: 'select' });
          if (f.itemFields) check(f.itemFields);
        }
      };
      check(s.fields);
    }
  });

  it('sectionSchemasFor keeps order and skips unknown types', () => {
    expect(sectionSchemasFor(['faq_list', 'nope', 'hero']).map((s) => s.type)).toEqual(['faq_list', 'hero']);
  });
});

describe('built-in template manifests', () => {
  it('are valid manifests whose sections all exist in the catalog', () => {
    for (const m of BUILTIN_TEMPLATE_MANIFESTS) {
      expect(isTemplateManifest(m)).toBe(true);
      expect(new Set(m.sections).size).toBe(m.sections.length);
      for (const type of m.sections) {
        expect({ template: m.slug, type, known: Boolean(getSectionSchema(type)) }).toEqual({ template: m.slug, type, known: true });
      }
    }
  });

  it('match the manifest JSON written by the SQL script exactly', () => {
    // Migrasi diterapkan berurutan: manifest terakhir per slug adalah yang berlaku.
    const dir = join(__dirname, '..', '..', '..', 'supabase', 'migrations');
    const latestBySlug = new Map<string, unknown>();
    for (const file of readdirSync(dir).filter((name) => /manifest.*\.sql$/.test(name)).sort()) {
      const sql = readFileSync(join(dir, file), 'utf-8');
      for (const match of sql.matchAll(/SET manifest = '(.+?)'::jsonb/g)) {
        const manifest = JSON.parse(match[1].replace(/''/g, "'")) as { slug: string };
        latestBySlug.set(manifest.slug, manifest);
      }
    }
    expect([...latestBySlug.values()]).toEqual(BUILTIN_TEMPLATE_MANIFESTS);
  });
});
