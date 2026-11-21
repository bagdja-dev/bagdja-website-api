export function getTranslationLocaleOrder(
  localeOrder: readonly string[],
  defaultLocale?: string,
): string[] {
  const defaultLocaleIndex = defaultLocale ? localeOrder.indexOf(defaultLocale) : -1;
  return defaultLocaleIndex >= 0
    ? localeOrder.slice(0, defaultLocaleIndex)
    : [...localeOrder];
}

export function localizeSectionContent(
  content: Record<string, unknown>,
  localeOrder: readonly string[],
): Record<string, unknown> {
  const rawTranslations = content.translations;
  const translations = isRecord(rawTranslations) ? rawTranslations : undefined;
  const baseContent = Object.fromEntries(
    Object.entries(content).filter(([key]) => key !== 'translations'),
  );

  if (!translations) return baseContent;

  const localizedContent = localeOrder
    .map((locale) => translations[locale])
    .find(isRecord);
  if (!localizedContent) return baseContent;

  return Object.entries(localizedContent).reduce<Record<string, unknown>>(
    (result, [key, value]) => {
      if (typeof value === 'string' && value.trim()) result[key] = value;
      return result;
    },
    baseContent,
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
