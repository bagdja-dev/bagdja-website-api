/**
 * R1 — katalog skema section host (template-contract.md §2).
 *
 * Satu sumber untuk form Studio dan validasi renderer. Kunci `content` di sini
 * HARUS sama dengan yang dibaca renderer saat ini (inventaris R0,
 * template-contract.md §5) supaya content yang sudah tersimpan tetap valid.
 *
 * Catatan kompatibilitas:
 * - Field `json` lama dipetakan ke `list` dengan `itemFields` sama dengan bentuk
 *   array yang dibaca renderer (`hero.stats`, `testimonial.items`).
 * - `features_grid` memakai `features: list`; renderer tetap membaca kunci
 *   datar `feature_{n}_icon|title|desc` untuk konten lama.
 * - Kunci yang dibaca renderer tetapi berbentuk `string[]` bebas (`about.bullets`)
 *   dan kunci hasil injeksi server (`service_process_section.flow_steps`) atau
 *   seed (`preview_steps`) sengaja TIDAK dimasukkan sebagai field. Form Studio
 *   wajib mempertahankan kunci content yang tidak dikenalnya.
 * - Kunci `source` lama tidak dibaca renderer; digantikan `dataSource`.
 * - Section sistem (product_detail, cart, checkout, …) diinjeksi route, bukan
 *   bagian katalog (lihat `SYSTEM_SECTION_TYPES`).
 * - `cta` v2: tombol bertipe lewat `button_action` (whatsapp | phone | email |
 *   link). Content lama (v1) TANPA `button_action` diperlakukan sebagai `link`
 *   yang memakai `button_url` apa adanya; renderer (`resolveCtaHref`) dan form
 *   Studio sama-sama menerapkan aturan ini, jadi tidak perlu migrasi data.
 *   Hanya section BARU yang mendapat default `button_action: 'whatsapp'`.
 * - Field `showWhen` hanya mengatur tampilan form (field disembunyikan, nilainya
 *   TIDAK dihapus). Field `phone` menyimpan nomor tanpa "+" (mis. `0812…`/`62812…`;
 *   renderer menormalkan ke 62…). `display: 'segmented'` = pilihan chip, bukan dropdown.
 * - SECTION_CATALOG_VERSION tetap 2: kenaikan ke 2 oleh perubahan katalog lain
 *   belum dirilis, dan tipe/atribut field baru bersifat aditif (klien lama
 *   jatuh ke input teks biasa).
 */
import type { ModuleKey } from '../websites/business-profile.registry';

export const SECTION_CATALOG_VERSION = 2;

export type SectionFieldType =
  | 'text'
  | 'textarea'
  | 'richtext'
  | 'number'
  | 'url'
  | 'phone'
  | 'email'
  | 'select'
  | 'iconPicker'
  | 'faqCategoryPicker'
  | 'switch'
  | 'image'
  | 'gallery'
  | 'list'
  | 'productPicker'
  | 'postPicker'
  | 'flowPicker';

export interface SectionFieldOption {
  value: string;
  label: string;
}

/** Field tampil hanya bila nilai field `field` (di level yang sama) sama dengan `equals`. */
export interface SectionFieldShowWhen {
  field: string;
  equals: string | string[];
}

export type SectionFieldDisplay = 'segmented';

export interface SectionFieldDef {
  key: string;
  label: string;
  type: SectionFieldType;
  description?: string;
  placeholder?: string;
  required?: boolean;
  default?: unknown;
  options?: SectionFieldOption[];
  itemFields?: SectionFieldDef[];
  minItems?: number;
  maxItems?: number;
  multiple?: boolean;
  showWhen?: SectionFieldShowWhen;
  /** Hanya untuk `select` satu pilihan: `segmented` = chip/tombol segmen. */
  display?: SectionFieldDisplay;
}

export type SectionCategory = 'opening' | 'story' | 'sell' | 'info' | 'blog';

export type SectionDataSource = 'products' | 'categories' | 'locations' | 'faqs' | 'blog' | 'flow';

export interface SectionSchema {
  type: string;
  schemaVersion: number;
  label: string;
  description: string;
  category: SectionCategory;
  icon: string;
  requiredModule?: ModuleKey;
  dataSource?: SectionDataSource;
  singleton?: boolean;
  pinned?: 'top';
  fields: SectionFieldDef[];
  defaults: Record<string, unknown>;
}

/** Bentuk respons GET /api/section-schemas (dokumentasi Swagger: `dto/section-schema.dto.ts`). */
export interface SectionSchemasResponse {
  catalogVersion: number;
  sections: readonly SectionSchema[];
}

/** Section yang diinjeksi route renderer (bukan pilihan di editor halaman). */
export const SYSTEM_SECTION_TYPES = [
  'product_detail',
  'category_listing',
  'blog_article',
  'cart',
  'checkout',
  'orders',
  'order_detail',
  'profile',
  'chat',
  'tagihan',
  'gathering_calendar',
] as const;

const LAYOUT_OPTIONS: SectionFieldOption[] = [
  { value: 'grid', label: 'Grid' },
  { value: 'carousel', label: 'Carousel (geser)' },
];

export const SECTION_SCHEMAS: readonly SectionSchema[] = [
  // ── Pembuka ─────────────────────────────────────────────────────────────
  {
    type: 'hero',
    schemaVersion: 1,
    label: 'Hero Banner',
    description: 'Bagian paling atas halaman: judul brand, gambar besar, dan tombol WhatsApp.',
    category: 'opening',
    icon: 'hero',
    singleton: true,
    pinned: 'top',
    fields: [
      { key: 'subtitle', label: 'Teks kecil di atas judul', type: 'text', placeholder: 'Premium Barbershop' },
      { key: 'headline', label: 'Judul utama', type: 'text', placeholder: 'Dibangun untuk bertahan.', description: 'Kosongkan untuk memakai nama usaha.' },
      { key: 'lede', label: 'Kalimat pembuka', type: 'textarea', description: 'Kosongkan untuk memakai tagline usaha.' },
      { key: 'image_url', label: 'Gambar utama', type: 'image' },
      {
        key: 'images',
        label: 'Gambar cadangan',
        type: 'gallery',
        description: 'Dipakai bila gambar utama kosong (template tertentu).',
        itemFields: [
          { key: 'url', label: 'Gambar', type: 'image', required: true },
          { key: 'alt', label: 'Teks alternatif', type: 'text' },
          { key: 'caption', label: 'Keterangan', type: 'text' },
        ],
      },
      {
        key: 'stats',
        label: 'Angka unggulan',
        type: 'list',
        maxItems: 3,
        description: 'Contoh: "10+" tahun pengalaman.',
        itemFields: [
          { key: 'value', label: 'Angka', type: 'text', placeholder: '10+', required: true },
          { key: 'label', label: 'Keterangan', type: 'text', placeholder: 'Tahun pengalaman', required: true },
        ],
      },
      { key: 'show_whatsapp_cta', label: 'Tampilkan tombol WhatsApp', type: 'switch', default: true },
    ],
    defaults: { subtitle: '', show_whatsapp_cta: true, image_url: '' },
  },
  // ── Cerita ──────────────────────────────────────────────────────────────
  {
    type: 'text_block',
    schemaVersion: 1,
    label: 'Teks Biasa',
    description: 'Blok teks sederhana yang mengikuti gaya huruf template.',
    category: 'story',
    icon: 'text',
    fields: [
      { key: 'title', label: 'Judul', type: 'text' },
      { key: 'body', label: 'Isi teks', type: 'textarea', required: true },
      {
        key: 'align',
        label: 'Perataan',
        type: 'select',
        default: 'left',
        options: [
          { value: 'left', label: 'Kiri' },
          { value: 'center', label: 'Tengah' },
        ],
      },
    ],
    defaults: { title: '', body: '', align: 'left' },
  },
  {
    type: 'rich_text',
    schemaVersion: 1,
    label: 'Teks Berformat',
    description: 'Teks dengan format bebas (tebal, daftar, tautan) yang tidak terpengaruh tema template.',
    category: 'story',
    icon: 'richtext',
    fields: [
      { key: 'title', label: 'Judul', type: 'text' },
      { key: 'html', label: 'Isi', type: 'richtext', required: true },
    ],
    defaults: { title: '', html: '' },
  },
  {
    type: 'about',
    schemaVersion: 1,
    label: 'Tentang Kami',
    description: 'Cerita singkat usaha kamu, dengan foto.',
    category: 'story',
    icon: 'about',
    fields: [
      { key: 'title', label: 'Judul', type: 'text', default: 'Tentang Kami' },
      { key: 'body', label: 'Cerita usaha', type: 'textarea' },
      { key: 'image_url', label: 'Foto', type: 'image' },
    ],
    defaults: { title: 'Tentang Kami', body: '', image_url: '' },
  },
  {
    type: 'gallery',
    schemaVersion: 1,
    label: 'Galeri Foto',
    description: 'Kumpulan foto: hasil kerja, suasana tempat, atau portofolio.',
    category: 'story',
    icon: 'gallery',
    fields: [
      { key: 'title', label: 'Judul', type: 'text', default: 'Galeri Kami' },
      { key: 'layout', label: 'Tampilan', type: 'select', default: 'grid', options: LAYOUT_OPTIONS },
      {
        key: 'images',
        label: 'Foto',
        type: 'gallery',
        itemFields: [
          { key: 'url', label: 'Foto', type: 'image', required: true },
          { key: 'alt', label: 'Teks alternatif', type: 'text' },
          { key: 'caption', label: 'Keterangan', type: 'text' },
        ],
      },
    ],
    defaults: { title: 'Galeri Kami', layout: 'grid', images: [] },
  },
  {
    type: 'features_grid',
    schemaVersion: 2,
    label: 'Keunggulan',
    description: 'Tambahkan alasan pelanggan memilih kamu, mis. Gratis Ongkir atau Garansi.',
    category: 'story',
    icon: 'features',
    fields: [
      { key: 'title', label: 'Judul', type: 'text', default: 'Kenapa Pilih Kami' },
      {
        key: 'features',
        label: 'Daftar keunggulan',
        type: 'list',
        itemFields: [
          { key: 'icon', label: 'Ikon', type: 'iconPicker', default: '⭐' },
          { key: 'title', label: 'Judul keunggulan', type: 'text', placeholder: 'Gratis Ongkir' },
          { key: 'desc', label: 'Penjelasan keunggulan', type: 'textarea' },
        ],
      },
    ],
    defaults: {
      title: 'Kenapa Pilih Kami',
      features: [],
    },
  },
  {
    type: 'logo_wall',
    schemaVersion: 1,
    label: 'Deretan Logo',
    description: 'Logo mitra, klien, atau media yang pernah meliput, supaya pengunjung makin percaya.',
    category: 'story',
    icon: 'logos',
    fields: [
      { key: 'title', label: 'Judul', type: 'text', default: 'Dipercaya Oleh' },
      { key: 'layout', label: 'Tampilan', type: 'select', default: 'grid', options: LAYOUT_OPTIONS },
      {
        key: 'logos',
        label: 'Logo',
        type: 'gallery',
        itemFields: [
          { key: 'url', label: 'Logo', type: 'image', required: true },
          { key: 'alt', label: 'Nama', type: 'text' },
        ],
      },
    ],
    defaults: { title: 'Dipercaya Oleh', layout: 'grid', logos: [] },
  },
  {
    type: 'testimonial',
    schemaVersion: 1,
    label: 'Testimoni',
    description: 'Ulasan dari pelanggan.',
    category: 'story',
    icon: 'testimonial',
    fields: [
      { key: 'title', label: 'Judul', type: 'text', default: 'Apa Kata Mereka' },
      {
        key: 'items',
        label: 'Ulasan',
        type: 'list',
        itemFields: [
          { key: 'quote', label: 'Isi ulasan', type: 'textarea', required: true },
          { key: 'context', label: 'Nama / keterangan pelanggan', type: 'text' },
          { key: 'location', label: 'Kota', type: 'text' },
        ],
      },
    ],
    defaults: { title: 'Apa Kata Mereka', items: [] },
  },
  // ── Jualan ──────────────────────────────────────────────────────────────
  {
    type: 'services_grid',
    schemaVersion: 1,
    label: 'Daftar Jasa',
    description: 'Menampilkan jasa dari menu Produk dan Jasa secara otomatis.',
    category: 'sell',
    icon: 'services',
    requiredModule: 'catalog',
    dataSource: 'products',
    fields: [
      { key: 'title', label: 'Judul', type: 'text', default: 'Jasa Kami' },
      {
        key: 'filter_type',
        label: 'Jenis yang ditampilkan',
        type: 'select',
        default: 'service',
        options: [
          { value: 'service', label: 'Jasa' },
          { value: 'gathering', label: 'Gathering' },
          { value: 'product', label: 'Produk' },
          { value: 'digital', label: 'Digital' },
        ],
      },
    ],
    defaults: { title: 'Jasa Kami', filter_type: 'service' },
  },
  {
    type: 'products_grid',
    schemaVersion: 1,
    label: 'Daftar Produk',
    description: 'Menampilkan produk dari menu Produk dan Jasa secara otomatis.',
    category: 'sell',
    icon: 'products',
    requiredModule: 'catalog',
    dataSource: 'products',
    fields: [
      { key: 'title', label: 'Judul', type: 'text', default: 'Produk Kami' },
      {
        key: 'filter_type',
        label: 'Jenis yang ditampilkan',
        type: 'select',
        default: 'product',
        options: [
          { value: 'product', label: 'Produk' },
          { value: 'gathering', label: 'Gathering' },
          { value: 'digital', label: 'Digital' },
        ],
      },
    ],
    defaults: { title: 'Produk Kami', filter_type: 'product' },
  },
  {
    type: 'category_grid',
    schemaVersion: 1,
    label: 'Daftar Kategori',
    description: 'Kartu kategori produk dan layanan untuk memudahkan pengunjung mencari.',
    category: 'sell',
    icon: 'categories',
    requiredModule: 'catalog',
    dataSource: 'categories',
    fields: [{ key: 'title', label: 'Judul', type: 'text', default: 'Kategori Pilihan' }],
    defaults: { title: 'Kategori Pilihan' },
  },
  {
    type: 'featured_product',
    schemaVersion: 1,
    label: 'Produk Unggulan',
    description: 'Banner promosi untuk satu produk atau layanan pilihan.',
    category: 'sell',
    icon: 'spotlight',
    requiredModule: 'catalog',
    dataSource: 'products',
    fields: [
      { key: 'title', label: 'Judul', type: 'text', description: 'Kosongkan untuk memakai nama produk.' },
      { key: 'subtitle', label: 'Keterangan', type: 'text' },
      { key: 'product_ids', label: 'Produk', type: 'productPicker', maxItems: 1, required: true },
      { key: 'button_text', label: 'Teks tombol', type: 'text', default: 'Lihat Detail' },
    ],
    defaults: { title: '', subtitle: '', product_ids: [], button_text: 'Lihat Detail' },
  },
  {
    type: 'cta',
    schemaVersion: 2,
    label: 'Ajakan Bertindak',
    description: 'Ajak pengunjung melakukan sesuatu, lengkap dengan tombol WhatsApp, telepon, email, atau tautan.',
    category: 'sell',
    icon: 'cta',
    fields: [
      { key: 'title', label: 'Judul', type: 'text' },
      { key: 'subtitle', label: 'Keterangan', type: 'text' },
      { key: 'button_text', label: 'Teks tombol', type: 'text', default: 'Hubungi Kami' },
      {
        key: 'button_action',
        label: 'Tombol untuk',
        type: 'select',
        display: 'segmented',
        default: 'whatsapp',
        options: [
          { value: 'whatsapp', label: 'WhatsApp' },
          { value: 'phone', label: 'Telepon' },
          { value: 'email', label: 'Email' },
          { value: 'link', label: 'Tautan' },
        ],
      },
      {
        key: 'button_whatsapp',
        label: 'Nomor WhatsApp',
        type: 'phone',
        placeholder: '812xxxxxxx',
        description: 'Kosongkan untuk memakai nomor WhatsApp website.',
        showWhen: { field: 'button_action', equals: 'whatsapp' },
      },
      {
        key: 'button_message',
        label: 'Pesan pembuka chat',
        type: 'textarea',
        placeholder: 'Halo, saya ingin bertanya…',
        showWhen: { field: 'button_action', equals: 'whatsapp' },
      },
      {
        key: 'button_phone',
        label: 'Nomor telepon',
        type: 'phone',
        placeholder: '812xxxxxxx',
        description: 'Tombol hanya tampil bila nomor diisi.',
        showWhen: { field: 'button_action', equals: 'phone' },
      },
      {
        key: 'button_email',
        label: 'Alamat email',
        type: 'email',
        placeholder: 'nama@usaha.com',
        description: 'Tombol hanya tampil bila email diisi.',
        showWhen: { field: 'button_action', equals: 'email' },
      },
      {
        key: 'button_subject',
        label: 'Subjek email',
        type: 'text',
        showWhen: { field: 'button_action', equals: 'email' },
      },
      {
        key: 'button_url',
        label: 'Tautan tombol',
        type: 'url',
        placeholder: 'https://…',
        description: 'Boleh tanpa https:// atau alamat halaman sendiri (mis. /produk). Tombol hanya tampil bila tautan diisi.',
        showWhen: { field: 'button_action', equals: 'link' },
      },
    ],
    defaults: {
      title: '',
      subtitle: '',
      button_text: 'Hubungi Kami',
      button_action: 'whatsapp',
      button_whatsapp: '',
      button_message: '',
      button_phone: '',
      button_email: '',
      button_subject: '',
      button_url: '',
    },
  },
  // ── Info ────────────────────────────────────────────────────────────────
  {
    type: 'service_process_section',
    schemaVersion: 1,
    label: 'Alur Layanan',
    description: 'Langkah-langkah pengerjaan dari Master Flow yang kamu pilih.',
    category: 'info',
    icon: 'flow',
    requiredModule: 'fulfillment',
    dataSource: 'flow',
    fields: [
      { key: 'title', label: 'Judul', type: 'text', default: 'Alur Pengerjaan' },
      { key: 'subtitle', label: 'Keterangan', type: 'text' },
      { key: 'flow_id', label: 'Master Flow', type: 'flowPicker', required: true },
    ],
    defaults: { title: 'Alur Pengerjaan', subtitle: '', flow_id: '' },
  },
  {
    type: 'contact',
    schemaVersion: 1,
    label: 'Kontak',
    description: 'WhatsApp, telepon, email, dan alamat usaha dari Pengaturan.',
    category: 'info',
    icon: 'contact',
    fields: [
      { key: 'title', label: 'Judul', type: 'text', default: 'Hubungi Kami' },
      { key: 'subtitle', label: 'Keterangan', type: 'text' },
    ],
    defaults: { title: 'Hubungi Kami' },
  },
  {
    type: 'locations_list',
    schemaVersion: 1,
    label: 'Daftar Lokasi',
    description: 'Menampilkan cabang dari menu Lokasi secara otomatis.',
    category: 'info',
    icon: 'locations',
    requiredModule: 'locations',
    dataSource: 'locations',
    fields: [
      { key: 'title', label: 'Judul', type: 'text', default: 'Kunjungi Kami' },
      {
        key: 'filter_types',
        label: 'Jenis lokasi yang ditampilkan',
        type: 'select',
        multiple: true,
        default: ['branch'],
        description: 'Kosongkan untuk menampilkan semua lokasi.',
        options: [
          { value: 'branch', label: 'Cabang' },
          { value: 'warehouse', label: 'Gudang' },
          { value: 'pickup', label: 'Titik ambil' },
          { value: 'office', label: 'Kantor' },
        ],
      },
    ],
    defaults: { title: 'Kunjungi Kami', filter_types: ['branch'] },
  },
  {
    type: 'faq_list',
    schemaVersion: 1,
    label: 'Daftar FAQ',
    description: 'Menampilkan pertanyaan umum dari menu FAQ secara otomatis.',
    category: 'info',
    icon: 'faq',
    requiredModule: 'faq',
    dataSource: 'faqs',
    fields: [
      { key: 'title', label: 'Judul', type: 'text', default: 'Pertanyaan Umum' },
      {
        key: 'filter_category',
        label: 'Kategori FAQ',
        type: 'faqCategoryPicker',
        default: '',
        description: 'Pilih kategori yang ingin ditampilkan, atau semua kategori.',
      },
    ],
    defaults: { title: 'Pertanyaan Umum', filter_category: '' },
  },
  // ── Blog ────────────────────────────────────────────────────────────────
  {
    type: 'blog_list',
    schemaVersion: 1,
    label: 'Daftar Artikel',
    description: 'Semua artikel blog yang sudah terbit, terbaru di atas.',
    category: 'blog',
    icon: 'blog',
    requiredModule: 'blog',
    dataSource: 'blog',
    fields: [
      { key: 'title', label: 'Judul', type: 'text', default: 'Artikel Terbaru' },
      {
        key: 'limit',
        label: 'Jumlah artikel',
        type: 'select',
        default: '',
        options: [
          { value: '', label: 'Semua' },
          { value: '3', label: '3' },
          { value: '6', label: '6' },
          { value: '9', label: '9' },
          { value: '12', label: '12' },
        ],
      },
    ],
    defaults: { title: 'Artikel Terbaru', limit: '' },
  },
  {
    type: 'blog_search',
    schemaVersion: 1,
    label: 'Cari Artikel',
    description: 'Tombol pencarian yang membuka jendela untuk mencari artikel blog.',
    category: 'blog',
    icon: 'search',
    requiredModule: 'blog',
    dataSource: 'blog',
    fields: [
      { key: 'title', label: 'Judul', type: 'text' },
      { key: 'placeholder', label: 'Teks petunjuk di kotak cari', type: 'text', default: 'Cari artikel...' },
    ],
    defaults: { title: '', placeholder: 'Cari artikel...' },
  },
  {
    type: 'blog_collection',
    schemaVersion: 1,
    label: 'Artikel Pilihan',
    description: 'Pilih sendiri artikel yang ingin ditampilkan, sesuai urutan pilihan.',
    category: 'blog',
    icon: 'collection',
    requiredModule: 'blog',
    dataSource: 'blog',
    fields: [
      { key: 'title', label: 'Judul', type: 'text', default: 'Artikel Pilihan' },
      { key: 'post_ids', label: 'Artikel', type: 'postPicker', multiple: true, required: true },
    ],
    defaults: { title: 'Artikel Pilihan', post_ids: [] },
  },
];

const SCHEMA_BY_TYPE: ReadonlyMap<string, SectionSchema> = new Map(SECTION_SCHEMAS.map((s) => [s.type, s]));

export function getSectionSchema(type: string): SectionSchema | undefined {
  return SCHEMA_BY_TYPE.get(type);
}

/** Subset skema sesuai urutan `types`; type tak dikenal dilewati. */
export function sectionSchemasFor(types: readonly string[]): SectionSchema[] {
  return types.map((t) => SCHEMA_BY_TYPE.get(t)).filter((s): s is SectionSchema => Boolean(s));
}
