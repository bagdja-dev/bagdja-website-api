import { readFileSync } from 'node:fs';
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
    const features = getSectionSchema('features_grid')?.fields.map((f) => f.key) ?? [];
    for (let n = 1; n <= 4; n++) {
      expect(features).toEqual(expect.arrayContaining([`feature_${n}_icon`, `feature_${n}_title`, `feature_${n}_desc`]));
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
    const sql = readFileSync(
      join(__dirname, '..', '..', '..', 'supabase', 'migrations', '20261105000003_website_templates_builtin_manifest.sql'),
      'utf-8',
    );
    const fromSql = [...sql.matchAll(/SET manifest = '(.+?)'::jsonb/g)].map((match) => JSON.parse(match[1].replace(/''/g, "'")));
    expect(fromSql).toEqual(BUILTIN_TEMPLATE_MANIFESTS);
  });
});
