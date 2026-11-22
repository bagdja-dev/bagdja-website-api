import sanitizeHtml = require('sanitize-html');

/**
 * Section `custom_html` SELALU dirender renderer di iframe sandbox (origin opaque +
 * CSP `connect-src 'none'`, `form-action 'none'`, aset hanya CDN) — lihat
 * bagdja-website/lib/custom-html-sandbox.ts. Batas keamanan sesungguhnya ada di sana.
 *
 * Sanitasi di sini hanya kebersihan data: membuang elemen yang memuat sumber
 * dari luar atau mengubah dokumen (script eksternal, stylesheet, iframe, meta,
 * base, action form, link `javascript:`). Inline script & style dipertahankan
 * supaya UI (tab, slider, accordion) tetap jalan.
 */

/** Batas ukuran HTML tersimpan (byte UTF-8). Gambar base64 diunggah ke CDN oleh editor. */
export const CUSTOM_HTML_MAX_BYTES = 300 * 1024;

const DROPPED_TAGS = new Set([
  'applet', 'base', 'embed', 'frame', 'frameset', 'iframe', 'link', 'meta', 'noscript',
  'object', 'portal', 'title',
]);
const DROPPED_ATTRIBUTES = new Set(['action', 'formaction', 'ping', 'srcdoc']);

const SANDBOXED_HTML_OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: false,
  allowedAttributes: false,
  allowVulnerableTags: true,
  // Isi <textarea>/<option> tetap; isi <script>/<style> dipertahankan karena tag-nya diizinkan.
  nonTextTags: ['textarea', 'option'],
  allowedSchemes: ['http', 'https', 'mailto', 'tel'],
  allowedSchemesByTag: { img: ['https', 'data'], source: ['https', 'data'] },
  allowProtocolRelative: false,
  // SVG peka huruf besar (viewBox, linearGradient).
  parser: { lowerCaseTags: false, lowerCaseAttributeNames: false },
  exclusiveFilter: (frame) => {
    const tag = frame.tag.toLowerCase();
    return DROPPED_TAGS.has(tag) || (tag === 'script' && frame.attribs.src !== undefined);
  },
  transformTags: {
    '*': (tagName, attribs) => {
      const kept: sanitizeHtml.Attributes = {};
      for (const [name, value] of Object.entries(attribs)) {
        if (!DROPPED_ATTRIBUTES.has(name.toLowerCase())) kept[name] = value;
      }
      return { tagName, attribs: kept };
    },
  },
};

export class CustomHtmlTooLargeError extends Error {
  constructor(public readonly bytes: number) {
    super(`HTML Kustom maksimal ${Math.round(CUSTOM_HTML_MAX_BYTES / 1024)} KB (sekarang ${Math.ceil(bytes / 1024)} KB).`);
    this.name = 'CustomHtmlTooLargeError';
  }
}

/** Membersihkan HTML section kustom untuk dirender di sandbox. Melempar CustomHtmlTooLargeError bila terlalu besar. */
export function sanitizeCustomHtml(value: string | null | undefined): string {
  if (value === null || value === undefined) return '';
  const html = sanitizeHtml(String(value), SANDBOXED_HTML_OPTIONS).trim();
  const bytes = Buffer.byteLength(html, 'utf8');
  if (bytes > CUSTOM_HTML_MAX_BYTES) throw new CustomHtmlTooLargeError(bytes);
  return html;
}
