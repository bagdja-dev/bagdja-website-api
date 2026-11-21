import type { TransformFnParams } from 'class-transformer';

/**
 * Hostname custom domain (huruf kecil, termasuk punycode `xn--`), atau string
 * kosong untuk menghapus domain lewat PATCH. Harus sejalan dengan
 * `isValidCustomDomain()` di modules/domains/domains.service.ts — nilai ini
 * nantinya masuk ke rule Traefik `Host(\`...\`)`.
 */
export const CUSTOM_DOMAIN_INPUT_PATTERN =
  /^(?:|(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z](?:[a-z0-9-]{0,61}[a-z0-9]))$/;

export const CUSTOM_DOMAIN_INPUT_MESSAGE = 'Domain must be a valid hostname without protocol, e.g. tokosaya.com';

/** Trim + lowercase; buang `https://`, path, dan titik di akhir yang sering ikut tertempel dari browser. */
export function normalizeDomainInput({ value }: TransformFnParams): unknown {
  if (typeof value !== 'string') return value;
  return value
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/\/.*$/, '')
    .replace(/\.$/, '');
}
