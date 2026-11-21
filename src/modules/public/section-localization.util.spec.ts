import {
  getTranslationLocaleOrder,
  localizeSectionContent,
} from './section-localization.util';

describe('localizeSectionContent', () => {
  it('does not use translations beyond the default locale fallback', () => {
    expect(getTranslationLocaleOrder(['id', 'en'], 'id')).toEqual([]);
    expect(getTranslationLocaleOrder(['en', 'id'], 'id')).toEqual(['en']);
  });

  it('applies the first available locale in preference order', () => {
    expect(localizeSectionContent({
      headline: 'Original headline',
      lede: 'Original description',
      translations: {
        id: { lede: 'Deskripsi asli' },
        en: { lede: 'English description' },
      },
    }, ['en', 'id'])).toEqual({
      headline: 'Original headline',
      lede: 'English description',
    });
  });

  it('falls back to the next available locale and removes translation metadata', () => {
    expect(localizeSectionContent({
      title: 'Original title',
      translations: {
        id: { title: 'Judul asli' },
      },
    }, ['en', 'id'])).toEqual({
      title: 'Judul asli',
    });
  });

  it('keeps base text when no preferred translation exists', () => {
    expect(localizeSectionContent({
      title: 'Original title',
      translations: {
        fr: { title: 'Titre original' },
      },
    }, ['en', 'id'])).toEqual({
      title: 'Original title',
    });
  });

  it('keeps base text when only a non-preferred locale translation exists', () => {
    const translationLocales = getTranslationLocaleOrder(['id', 'en'], 'id');
    expect(localizeSectionContent({
      lede: 'Deskripsi asli',
      translations: {
        en: { lede: 'English description' },
      },
    }, translationLocales)).toEqual({
      lede: 'Deskripsi asli',
    });
  });

  it('ignores empty and non-string translated values', () => {
    expect(localizeSectionContent({
      title: 'Original title',
      translations: {
        en: { title: ' ', image_url: { url: 'https://example.test/image.png' } },
      },
    }, ['en'])).toEqual({
      title: 'Original title',
    });
  });
});
