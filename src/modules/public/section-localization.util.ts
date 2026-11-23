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
      const localizedValue = mergeLocalizedValue(result[key], value);
      if (localizedValue !== undefined) result[key] = localizedValue;
      return result;
    },
    baseContent,
  );
}

function mergeLocalizedValue(base: unknown, localized: unknown): unknown {
  if (typeof localized === 'string') return localized.trim() ? localized : undefined;
  if (Array.isArray(base) && Array.isArray(localized)) {
    return base.map((baseItem, index) => {
      const localizedItem = localized[index];
      if (!isRecord(baseItem) || !isRecord(localizedItem)) return baseItem;
      return Object.entries(localizedItem).reduce<Record<string, unknown>>(
        (result, [key, value]) => {
          const merged = mergeLocalizedValue(result[key], value);
          if (merged !== undefined) result[key] = merged;
          return result;
        },
        { ...baseItem },
      );
    });
  }
  if (isRecord(base) && isRecord(localized)) {
    return Object.entries(localized).reduce<Record<string, unknown>>(
      (result, [key, value]) => {
        const merged = mergeLocalizedValue(result[key], value);
        if (merged !== undefined) result[key] = merged;
        return result;
      },
      { ...base },
    );
  }
  return undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
