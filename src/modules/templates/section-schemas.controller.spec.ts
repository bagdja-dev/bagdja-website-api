import { SECTION_CATALOG_VERSION, SECTION_SCHEMAS } from './section-schema.registry';
import { SectionSchemasController } from './section-schemas.controller';

describe('SectionSchemasController', () => {
  it('returns the versioned section schema catalog', () => {
    const response = new SectionSchemasController().list();

    expect(response.catalogVersion).toBe(SECTION_CATALOG_VERSION);
    expect(response.sections).toBe(SECTION_SCHEMAS);
    expect(response.sections.length).toBeGreaterThan(0);
  });
});
