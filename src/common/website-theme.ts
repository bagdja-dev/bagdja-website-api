export const THEME_MODES = ['light', 'dark'] as const;
export const THEME_ACCENTS = [
  'amber', 'blue', 'emerald', 'rose', 'violet', 'indigo', 'orange', 'teal',
] as const;
export const THEME_PRESETS = ['dark', 'light', 'custom'] as const;
export const HEADING_WEIGHTS = ['500', '600', '700'] as const;
export const BODY_WEIGHTS = ['400', '500'] as const;
export const HEADING_SCALES = ['compact', 'default', 'large'] as const;

export type ThemeMode = (typeof THEME_MODES)[number];
export type ThemeAccent = (typeof THEME_ACCENTS)[number];
export type ThemePreset = (typeof THEME_PRESETS)[number];

export interface ThemeColors {
  background?: string;
  surface?: string;
  text?: string;
  textMuted?: string;
  accent?: string;
  accentHover?: string;
  border?: string;
  onAccent?: string;
  heading?: string;
  accentMuted?: string;
  success?: string;
  warning?: string;
  danger?: string;
}

export const THEME_COLOR_KEYS = [
  'background', 'surface', 'text', 'textMuted', 'accent', 'accentHover', 'border', 'onAccent',
  'heading', 'accentMuted', 'success', 'warning', 'danger',
] as const;

/** Token warna per komponen — semua opsional, fallback ke token global saat di-resolve. */
export const THEME_COMPONENT_KEYS = {
  header: ['background', 'text', 'border'],
  footer: ['background', 'text', 'heading', 'link', 'border'],
  button: ['primaryBackground', 'primaryText', 'secondaryText', 'secondaryBorder'],
} as const;

export type ThemeComponentName = keyof typeof THEME_COMPONENT_KEYS;
export type ThemeComponents = {
  [C in ThemeComponentName]?: Partial<Record<(typeof THEME_COMPONENT_KEYS)[C][number], string>>;
};

export interface ThemeTypography {
  headingFont?: string;
  bodyFont?: string;
  headingWeight?: string;
  bodyWeight?: string;
  headingScale?: string;
}

export interface WebsiteTheme {
  mode?: ThemeMode;
  accent?: ThemeAccent;
  font?: string;
  preset?: ThemePreset;
  colors?: ThemeColors;
  components?: ThemeComponents;
  typography?: ThemeTypography;
}

const HEX_RE = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
const FONT_NAMES = new Set([
  'Inter', 'Poppins', 'Roboto', 'Open Sans', 'Lato', 'Montserrat', 'Playfair Display', 'Merriweather',
]);

function isValidHex(value: unknown): value is string {
  return typeof value === 'string' && HEX_RE.test(value.trim());
}

function normalizeHex(hex: string): string {
  const h = hex.trim();
  if (h.length === 4) {
    const [, r, g, b] = h;
    return `#${r}${r}${g}${g}${b}${b}`.toLowerCase();
  }
  return h.toLowerCase();
}

function sanitizeColors(input: unknown): ThemeColors {
  if (!input || typeof input !== 'object') return {};
  const raw = input as Record<string, unknown>;
  const colors: ThemeColors = {};
  for (const key of THEME_COLOR_KEYS) {
    if (isValidHex(raw[key])) colors[key] = normalizeHex(raw[key] as string);
  }
  return colors;
}

function sanitizeComponents(input: unknown): ThemeComponents {
  if (!input || typeof input !== 'object') return {};
  const raw = input as Record<string, unknown>;
  const components: Record<string, Record<string, string>> = {};
  for (const [name, keys] of Object.entries(THEME_COMPONENT_KEYS)) {
    const group = raw[name];
    if (!group || typeof group !== 'object') continue;
    const values: Record<string, string> = {};
    for (const key of keys) {
      const value = (group as Record<string, unknown>)[key];
      if (isValidHex(value)) values[key] = normalizeHex(value);
    }
    if (Object.keys(values).length > 0) components[name] = values;
  }
  return components as ThemeComponents;
}

function sanitizeTypography(input: unknown): ThemeTypography {
  if (!input || typeof input !== 'object') return {};
  const raw = input as Record<string, unknown>;
  const typo: ThemeTypography = {};
  if (typeof raw.headingFont === 'string' && FONT_NAMES.has(raw.headingFont)) typo.headingFont = raw.headingFont;
  if (typeof raw.bodyFont === 'string' && FONT_NAMES.has(raw.bodyFont)) typo.bodyFont = raw.bodyFont;
  if ((HEADING_WEIGHTS as readonly string[]).includes(raw.headingWeight as string)) typo.headingWeight = raw.headingWeight as string;
  if ((BODY_WEIGHTS as readonly string[]).includes(raw.bodyWeight as string)) typo.bodyWeight = raw.bodyWeight as string;
  if ((HEADING_SCALES as readonly string[]).includes(raw.headingScale as string)) typo.headingScale = raw.headingScale as string;
  return typo;
}

export function isThemeMode(value: unknown): value is ThemeMode {
  return typeof value === 'string' && (THEME_MODES as readonly string[]).includes(value);
}

export function isThemeAccent(value: unknown): value is ThemeAccent {
  return typeof value === 'string' && (THEME_ACCENTS as readonly string[]).includes(value);
}

export function sanitizeWebsiteTheme(input: unknown): WebsiteTheme {
  if (!input || typeof input !== 'object') return {};
  const raw = input as Record<string, unknown>;
  const theme: WebsiteTheme = {};
  if (isThemeMode(raw.mode)) theme.mode = raw.mode;
  if (isThemeAccent(raw.accent)) theme.accent = raw.accent;
  if ((THEME_PRESETS as readonly string[]).includes(raw.preset as string)) theme.preset = raw.preset as ThemePreset;
  if (typeof raw.font === 'string' && raw.font.trim()) theme.font = raw.font.trim();
  const colors = sanitizeColors(raw.colors);
  if (Object.keys(colors).length > 0) theme.colors = colors;
  const components = sanitizeComponents(raw.components);
  if (Object.keys(components).length > 0) theme.components = components;
  const typography = sanitizeTypography(raw.typography);
  if (Object.keys(typography).length > 0) theme.typography = typography;
  return theme;
}

export function extractTemplateTheme(structure: Record<string, unknown> | null | undefined): WebsiteTheme {
  if (!structure?.theme || typeof structure.theme !== 'object') return {};
  return sanitizeWebsiteTheme(structure.theme);
}

export function mergeWebsiteTheme(templateTheme: WebsiteTheme, websiteTheme: WebsiteTheme): WebsiteTheme {
  return { ...templateTheme, ...websiteTheme };
}
