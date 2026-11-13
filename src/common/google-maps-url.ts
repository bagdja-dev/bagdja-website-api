/**
 * Tautan peta yang diterima untuk lokasi gathering (plan/website-builder/gathering-option-location-plan.md L1):
 * hanya Google Maps via https — juga dipakai renderer/template, jadi daftar host sengaja sempit.
 */
export const GOOGLE_MAPS_URL_PATTERN =
  /^https:\/\/(?:maps\.app\.goo\.gl\/|goo\.gl\/maps\/|maps\.google\.[a-z]{2,3}(?:\.[a-z]{2})?\/|(?:www\.)?google\.[a-z]{2,3}(?:\.[a-z]{2})?\/maps(?:\/|\?|$))[^\s<>"']*$/i;

export function isGoogleMapsUrl(value: unknown): value is string {
  return typeof value === 'string' && value.length <= 1000 && GOOGLE_MAPS_URL_PATTERN.test(value.trim());
}
