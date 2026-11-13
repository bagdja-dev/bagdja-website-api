import sanitizeHtml = require('sanitize-html');

/**
 * Sanitasi HTML rich text dari Studio sebelum disimpan. HTML ini kemudian dirender apa adanya
 * oleh website (Bagdja & template package), jadi hanya tag/atribut dari editor yang diizinkan.
 *
 * - `basic`: keterangan opsi/paket gathering — paragraf, tebal/miring/garis bawah/coret, daftar, tautan.
 * - `product`: deskripsi produk — `basic` + judul, kutipan, gambar https, dan tabel (keluaran editor Tiptap Studio).
 */
export type RichTextProfile = 'basic' | 'product';

const BASIC_TAGS = ['p', 'br', 'strong', 'b', 'em', 'i', 'u', 's', 'ul', 'ol', 'li', 'a'];
const PRODUCT_TAGS = [
  ...BASIC_TAGS,
  'h2', 'h3', 'h4', 'blockquote', 'hr', 'code', 'pre', 'img',
  'table', 'thead', 'tbody', 'tr', 'th', 'td', 'colgroup', 'col',
];

const LINK_ATTRIBUTES = ['href', 'target', 'rel'];

function options(profile: RichTextProfile): sanitizeHtml.IOptions {
  return {
    allowedTags: profile === 'product' ? PRODUCT_TAGS : BASIC_TAGS,
    allowedAttributes: profile === 'product'
      ? {
        a: LINK_ATTRIBUTES,
        img: ['src', 'alt', 'title', 'width', 'height'],
        th: ['colspan', 'rowspan'],
        td: ['colspan', 'rowspan'],
        col: ['span'],
      }
      : { a: LINK_ATTRIBUTES },
    allowedSchemes: ['https', 'http', 'mailto', 'tel'],
    allowedSchemesByTag: { img: ['https'] },
    allowProtocolRelative: false,
    disallowedTagsMode: 'discard',
    // Gambar yang src-nya dibuang (bukan https) tidak disisakan sebagai <img /> kosong.
    exclusiveFilter: (frame) => frame.tag === 'img' && !frame.attribs.src,
    transformTags: {
      // Tautan keluar selalu tab baru tanpa akses ke opener.
      a: (tagName, attribs) => ({
        tagName,
        attribs: {
          ...(attribs.href ? { href: attribs.href } : {}),
          target: '_blank',
          rel: 'noopener noreferrer nofollow',
        },
      }),
    },
  };
}

/** `null` untuk nilai kosong / hanya paragraf kosong. */
export function sanitizeRichText(value: string | null | undefined, profile: RichTextProfile): string | null {
  if (value === null || value === undefined) return null;
  const raw = String(value).trim();
  if (!raw) return null;
  // Keluaran editor selalu diawali tag; selain itu = teks polos lama (textarea) → paragraf per baris.
  const html = raw.startsWith('<') ? raw : plainTextToHtml(raw);
  const clean = sanitizeHtml(html, options(profile)).trim();
  return richTextToPlainText(clean) ? clean : null;
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function plainTextToHtml(value: string): string {
  return value
    .split(/\r?\n{2,}/)
    .map((paragraph) => `<p>${escapeHtml(paragraph).replace(/\r?\n/g, '<br>')}</p>`)
    .join('');
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'", apos: "'", nbsp: ' ' };

/** Teks polos untuk tampilan ringkas, notifikasi, dan template yang belum memakai HTML. */
export function richTextToPlainText(value: string | null | undefined): string {
  if (!value) return '';
  return String(value)
    .replace(/<\s*br\s*\/?>/gi, '\n')
    .replace(/<\/(p|li|h[1-6]|blockquote|tr|pre)>/gi, '\n')
    .replace(/<li[^>]*>/gi, '• ')
    .replace(/<[^>]+>/g, '')
    .replace(/&(#\d+|#x[0-9a-f]+|[a-z]+);/gi, (match, entity: string) => {
      const lower = entity.toLowerCase();
      if (ENTITIES[lower] !== undefined) return ENTITIES[lower];
      if (lower.startsWith('#x')) return String.fromCodePoint(parseInt(lower.slice(2), 16));
      if (lower.startsWith('#')) return String.fromCodePoint(parseInt(lower.slice(1), 10));
      return match;
    })
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
