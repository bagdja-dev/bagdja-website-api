/**
 * Studio S1 — registry business profile & modul (sumber kebenaran).
 *
 * Spesifikasi: plan/website-builder/template-contract.md §1 dan
 * admin-redesign-onboarding-plan.md §2.2–2.3. Admin mengambil daftar ini lewat
 * `GET /api/business-profiles`; jangan disalin hardcode di client.
 *
 * Semua fungsi di file ini murni (tanpa I/O) supaya mudah diuji. Pengecekan
 * berbasis data (`canDisable`: transaksi/gathering berjalan) ada di
 * `WebsiteModulesService`.
 */

export const BUSINESS_PROFILE_IDS = [
  'service_business',
  'online_store',
  'project_quotation',
  'place_rental',
  'vehicle_rental',
  'event_ticketing',
  'gathering',
  'digital_goods',
  'company_profile',
  'legacy',
] as const;

export type BusinessProfileId = (typeof BUSINESS_PROFILE_IDS)[number];

/** Profile yang boleh dipilih client (tanpa `legacy`). */
export const SELECTABLE_BUSINESS_PROFILE_IDS: readonly Exclude<BusinessProfileId, 'legacy'>[] =
  BUSINESS_PROFILE_IDS.filter(
    (id): id is Exclude<BusinessProfileId, 'legacy'> => id !== 'legacy',
  );

export const LEGACY_BUSINESS_PROFILE: BusinessProfileId = 'legacy';

export const MODULE_KEYS = [
  // inti — selalu aktif, tidak bisa dimatikan
  'site_content',
  'team',
  'subscription',
  'wallet',
  'settings',
  // opsional
  'catalog',
  'orders',
  'quotes',
  'billing',
  'fulfillment',
  'events',
  'digital_delivery',
  'locations',
  'vendors',
  'customer_chat',
  'faq',
  'blog',
  'android_app',
  // baru, belum dibangun
  'appointments',
  'rental',
  'asset_tracking',
  'ticketing',
] as const;

export type ModuleKey = (typeof MODULE_KEYS)[number];

export type AvailabilityStatus = 'available' | 'coming_soon';

export interface ModuleDefinition {
  key: ModuleKey;
  label: string;
  description: string;
  core: boolean;
  dependsOn: ModuleKey[];
  status: AvailabilityStatus;
  /** Hanya tampil untuk owner (wallet & langganan melekat ke akun pemilik). */
  ownerOnly: boolean;
}

export interface BusinessProfileDefinition {
  id: BusinessProfileId;
  label: string;
  examples: string;
  /** Kunci ikon; dipetakan ke komponen ikon di admin. */
  icon: string;
  status: AvailabilityStatus;
  /** Modul default sebelum di-resolve (tanpa inti & dependensi). */
  defaultModules: ModuleKey[];
  sortOrder: number;
}

/** Urutan array = urutan tampil di halaman Fitur. */
export const MODULE_REGISTRY: readonly ModuleDefinition[] = [
  {
    key: 'site_content',
    label: 'Tampilan Website',
    description: 'Halaman, section, tema, dan footer website.',
    core: true,
    dependsOn: [],
    status: 'available',
    ownerOnly: false,
  },
  {
    key: 'team',
    label: 'Tim',
    description: 'Undang anggota tim dan atur perannya.',
    core: true,
    dependsOn: [],
    status: 'available',
    ownerOnly: false,
  },
  {
    key: 'subscription',
    label: 'Langganan',
    description: 'Paket langganan akun pemilik, dibayar dari Saldo.',
    core: true,
    dependsOn: [],
    status: 'available',
    ownerOnly: true,
  },
  {
    key: 'wallet',
    label: 'Saldo',
    description: 'Saldo pribadi pemilik: riwayat dana, penarikan, dan rekening.',
    core: true,
    dependsOn: [],
    status: 'available',
    ownerOnly: true,
  },
  {
    key: 'settings',
    label: 'Pengaturan',
    description: 'Identitas usaha, kontak, domain, dan notifikasi.',
    core: true,
    dependsOn: [],
    status: 'available',
    ownerOnly: false,
  },
  {
    key: 'catalog',
    label: 'Produk & Layanan',
    description: 'Daftar produk, layanan, paket, dan kategori yang kamu jual.',
    core: false,
    dependsOn: [],
    status: 'available',
    ownerOnly: false,
  },
  {
    key: 'orders',
    label: 'Pesanan',
    description: 'Terima pesanan dan pembayaran dari pembeli.',
    core: false,
    dependsOn: ['catalog'],
    status: 'available',
    ownerOnly: false,
  },
  {
    key: 'quotes',
    label: 'Penawaran',
    description: 'Kirim penawaran harga untuk pesanan custom.',
    core: false,
    dependsOn: ['catalog', 'orders'],
    status: 'available',
    ownerOnly: false,
  },
  {
    key: 'billing',
    label: 'Tagihan',
    description: 'Tagih pembayaran bertahap (termin) untuk pesanan.',
    core: false,
    dependsOn: ['orders'],
    status: 'available',
    ownerOnly: false,
  },
  {
    key: 'fulfillment',
    label: 'Master Flow',
    description: 'Atur langkah-langkah pengerjaan pesanan.',
    core: false,
    dependsOn: ['catalog'],
    status: 'available',
    ownerOnly: false,
  },
  {
    key: 'events',
    label: 'Gathering',
    description: 'Gathering patungan: undangan, pembayaran peserta, tiket QR, dan check-in.',
    core: false,
    dependsOn: ['catalog', 'orders'],
    status: 'available',
    ownerOnly: false,
  },
  {
    key: 'digital_delivery',
    label: 'Digital Asset',
    description: 'Kirim file produk digital otomatis setelah pembeli membayar.',
    core: false,
    dependsOn: ['catalog', 'orders'],
    status: 'available',
    ownerOnly: false,
  },
  {
    key: 'locations',
    label: 'Lokasi',
    description: 'Cabang, gudang, dan titik ambil barang.',
    core: false,
    dependsOn: [],
    status: 'available',
    ownerOnly: false,
  },
  {
    key: 'vendors',
    label: 'Vendor',
    description: 'Mitra yang ikut mengerjakan atau mengirim pesanan.',
    core: false,
    dependsOn: ['orders', 'locations'],
    status: 'available',
    ownerOnly: false,
  },
  {
    key: 'customer_chat',
    label: 'Inbox Chat',
    description: 'Balas chat dari pembeli di satu tempat.',
    core: false,
    dependsOn: [],
    status: 'available',
    ownerOnly: false,
  },
  {
    key: 'faq',
    label: 'FAQ',
    description: 'Pertanyaan yang sering ditanyakan pembeli.',
    core: false,
    dependsOn: [],
    status: 'available',
    ownerOnly: false,
  },
  {
    key: 'blog',
    label: 'Blog',
    description: 'Tulis artikel untuk menarik pengunjung.',
    core: false,
    dependsOn: [],
    status: 'available',
    ownerOnly: false,
  },
  {
    key: 'android_app',
    label: 'Aplikasi Android',
    description: 'Buat aplikasi Android dari website kamu.',
    core: false,
    dependsOn: [],
    status: 'available',
    ownerOnly: false,
  },
  {
    key: 'appointments',
    label: 'Jadwal & Booking',
    description: 'Pembeli memilih jadwal sesuai jam kerja staf, kursi, atau ruang.',
    core: false,
    dependsOn: ['catalog', 'orders', 'locations'],
    status: 'coming_soon',
    ownerOnly: false,
  },
  {
    key: 'rental',
    label: 'Aset & Sewa',
    description: 'Sewakan unit aset per jam, hari, minggu, atau bulan dengan kalender ketersediaan.',
    core: false,
    dependsOn: ['catalog', 'orders', 'locations'],
    status: 'coming_soon',
    ownerOnly: false,
  },
  {
    key: 'asset_tracking',
    label: 'Lacak Aset',
    description: 'Catat lokasi terkini aset yang disewa, serta lokasi ambil dan kembali.',
    core: false,
    dependsOn: ['rental'],
    status: 'coming_soon',
    ownerOnly: false,
  },
  {
    key: 'ticketing',
    label: 'Tiket & Venue',
    description: 'Jual tiket per jenis dan kuota, lengkap dengan venue dan check-in.',
    core: false,
    dependsOn: ['catalog', 'orders', 'locations'],
    status: 'coming_soon',
    ownerOnly: false,
  },
];

export const BUSINESS_PROFILES: readonly BusinessProfileDefinition[] = [
  {
    id: 'service_business',
    label: 'Jasa & Layanan',
    examples: 'Barbershop, salon, klinik, bengkel, laundry',
    icon: 'scissors',
    status: 'available',
    defaultModules: ['catalog', 'orders', 'appointments', 'fulfillment', 'locations', 'customer_chat', 'faq'],
    sortOrder: 1,
  },
  {
    id: 'online_store',
    label: 'Toko Online',
    examples: 'Fashion, makanan kemasan, elektronik',
    icon: 'store',
    status: 'available',
    defaultModules: ['catalog', 'orders', 'locations', 'customer_chat', 'faq'],
    sortOrder: 2,
  },
  {
    id: 'project_quotation',
    label: 'Proyek & Pesanan Custom',
    examples: 'Kontraktor, interior, konveksi, katering',
    icon: 'clipboard',
    status: 'available',
    defaultModules: ['catalog', 'quotes', 'orders', 'billing', 'fulfillment', 'customer_chat'],
    sortOrder: 3,
  },
  {
    id: 'place_rental',
    label: 'Sewa Tempat',
    examples: 'Hotel, kos, kontrakan, rental PS, lapangan',
    icon: 'building',
    status: 'coming_soon',
    defaultModules: ['catalog', 'orders', 'rental', 'locations', 'customer_chat', 'faq'],
    sortOrder: 4,
  },
  {
    id: 'vehicle_rental',
    label: 'Sewa Kendaraan & Alat',
    examples: 'Mobil, motor, kamera, alat pesta',
    icon: 'car',
    status: 'coming_soon',
    defaultModules: ['catalog', 'orders', 'rental', 'asset_tracking', 'locations', 'customer_chat', 'faq'],
    sortOrder: 5,
  },
  {
    id: 'event_ticketing',
    label: 'Tiket Event',
    examples: 'Konser, seminar, workshop berbayar, pameran',
    icon: 'ticket',
    status: 'coming_soon',
    defaultModules: ['catalog', 'orders', 'ticketing', 'locations', 'customer_chat', 'faq'],
    sortOrder: 6,
  },
  {
    id: 'gathering',
    label: 'Gathering & Komunitas',
    examples: 'Reuni, bukber, family gathering, komunitas',
    icon: 'users',
    status: 'available',
    defaultModules: ['catalog', 'events', 'orders', 'customer_chat'],
    sortOrder: 7,
  },
  {
    id: 'digital_goods',
    label: 'Produk Digital',
    examples: 'E-book, template, kursus, preset',
    icon: 'download',
    status: 'available',
    defaultModules: ['catalog', 'digital_delivery', 'orders', 'customer_chat', 'blog'],
    sortOrder: 8,
  },
  {
    id: 'company_profile',
    label: 'Profil Usaha',
    examples: 'Kantor, organisasi, portofolio (tanpa transaksi)',
    icon: 'briefcase',
    status: 'available',
    defaultModules: ['customer_chat', 'blog', 'faq'],
    sortOrder: 9,
  },
  {
    // Tidak tampil di wizard. Modul efektif = semua modul available bila
    // enabled_modules kosong (D7); backfill berbasis data dijalankan manual (D4).
    id: 'legacy',
    label: 'Website lama',
    examples: 'Website yang sudah ada sebelum fitur ini',
    icon: 'archive',
    status: 'available',
    defaultModules: [],
    sortOrder: 99,
  },
];

const MODULE_BY_KEY: ReadonlyMap<ModuleKey, ModuleDefinition> = new Map(
  MODULE_REGISTRY.map((m) => [m.key, m]),
);
const PROFILE_BY_ID: ReadonlyMap<BusinessProfileId, BusinessProfileDefinition> = new Map(
  BUSINESS_PROFILES.map((p) => [p.id, p]),
);

export function isModuleKey(value: string): value is ModuleKey {
  return MODULE_BY_KEY.has(value as ModuleKey);
}

export function isBusinessProfileId(value: string): value is BusinessProfileId {
  return PROFILE_BY_ID.has(value as BusinessProfileId);
}

export function getModuleDefinition(key: ModuleKey): ModuleDefinition {
  const def = MODULE_BY_KEY.get(key);
  if (!def) throw new Error(`Unknown module key: ${key}`);
  return def;
}

export function getBusinessProfile(id: BusinessProfileId): BusinessProfileDefinition {
  const def = PROFILE_BY_ID.get(id);
  if (!def) throw new Error(`Unknown business profile: ${id}`);
  return def;
}

export const CORE_MODULE_KEYS: readonly ModuleKey[] = MODULE_REGISTRY.filter((m) => m.core).map((m) => m.key);

/** Urutkan & unikkan kunci mengikuti urutan registry; kunci tak dikenal dibuang. */
function normalize(keys: Iterable<string>): ModuleKey[] {
  const set = new Set<string>(keys);
  return MODULE_REGISTRY.filter((m) => set.has(m.key)).map((m) => m.key);
}

/** Tutup dependensi (rekursif): kunci + semua modul yang dibutuhkannya. */
export function withDependencies(keys: Iterable<string>): ModuleKey[] {
  const result = new Set<ModuleKey>();
  const stack: ModuleKey[] = normalize(keys);
  while (stack.length) {
    const key = stack.pop() as ModuleKey;
    if (result.has(key)) continue;
    result.add(key);
    for (const dep of getModuleDefinition(key).dependsOn) stack.push(dep);
  }
  return normalize(result);
}

export interface ResolveModulesOptions {
  /** Pertahankan modul `coming_soon` (dipakai untuk menampilkan preset di wizard). Default false. */
  includeComingSoon?: boolean;
}

/**
 * Himpunan modul final: kunci + dependensi + modul inti. Kunci tak dikenal
 * dibuang; modul `coming_soon` dibuang kecuali `includeComingSoon`.
 */
export function resolveModules(keys: Iterable<string>, options: ResolveModulesOptions = {}): ModuleKey[] {
  const closed = withDependencies([...keys, ...CORE_MODULE_KEYS]);
  if (options.includeComingSoon) return closed;
  return closed.filter((key) => getModuleDefinition(key).status === 'available');
}

/** Semua modul berstatus `available` (inti + opsional). */
export function allAvailableModules(): ModuleKey[] {
  return MODULE_REGISTRY.filter((m) => m.status === 'available').map((m) => m.key);
}

export interface WebsiteModuleSource {
  business_profile: string;
  enabled_modules: string[] | null;
}

/**
 * Modul efektif sebuah website. `legacy` dengan `enabled_modules` kosong =
 * semua modul `available` (perilaku dashboard lama, D7). Selain itu
 * snapshot di-resolve ulang (inti selalu ada, kunci usang dibuang).
 */
export function effectiveModules(website: WebsiteModuleSource): ModuleKey[] {
  const stored = website.enabled_modules ?? [];
  if (website.business_profile === LEGACY_BUSINESS_PROFILE && stored.length === 0) {
    return allAvailableModules();
  }
  return resolveModules(stored);
}

/** Preset modul sebuah profile yang sudah di-resolve (inti + dependensi, hanya `available`). */
export function profilePresetModules(id: BusinessProfileId): ModuleKey[] {
  return resolveModules(getBusinessProfile(id).defaultModules);
}

/** Modul aktif lain yang (langsung atau tidak langsung) membutuhkan `key`. */
export function enabledDependentsOf(key: ModuleKey, enabled: Iterable<ModuleKey>): ModuleKey[] {
  return normalize(
    [...enabled].filter((other) => other !== key && withDependencies([other]).includes(key)),
  );
}

export type ModuleChangeErrorKind = 'invalid' | 'conflict';

export interface ModuleChangeError {
  ok: false;
  kind: ModuleChangeErrorKind;
  key: string;
  message: string;
}

export interface ModuleChangePlan {
  ok: true;
  /** Snapshot baru (sudah di-resolve). */
  modules: ModuleKey[];
  /** Modul yang benar-benar berubah dari aktif → nonaktif (perlu cek `canDisable` berbasis data). */
  turnedOff: ModuleKey[];
  /** Modul yang benar-benar berubah dari nonaktif → aktif (termasuk dependensi). */
  turnedOn: ModuleKey[];
}

export function isModuleChangeError(result: ModuleChangePlan | ModuleChangeError): result is ModuleChangeError {
  return result.ok === false;
}

export function moduleLabel(key: ModuleKey): string {
  return getModuleDefinition(key).label;
}

/**
 * Aturan aktif/nonaktif modul (murni, tanpa cek data):
 * - kunci harus dikenal; kunci tidak boleh ada di `enable` dan `disable` sekaligus;
 * - modul `coming_soon` tidak bisa diaktifkan;
 * - mengaktifkan = ikut mengaktifkan dependensi;
 * - menonaktifkan ditolak bila modul inti atau masih dibutuhkan modul aktif lain
 *   (kecuali modul lain itu ikut dinonaktifkan di permintaan yang sama).
 */
export function planModuleChange(
  current: Iterable<ModuleKey>,
  enable: readonly string[] = [],
  disable: readonly string[] = [],
): ModuleChangePlan | ModuleChangeError {
  for (const key of [...enable, ...disable]) {
    if (!isModuleKey(key)) {
      return { ok: false, kind: 'invalid', key, message: `Modul "${key}" tidak dikenal.` };
    }
  }
  const both = enable.find((key) => disable.includes(key));
  if (both) {
    return {
      ok: false,
      kind: 'invalid',
      key: both,
      message: `Modul "${both}" tidak bisa diaktifkan dan dinonaktifkan sekaligus.`,
    };
  }
  for (const key of enable as ModuleKey[]) {
    const def = getModuleDefinition(key);
    if (def.status === 'coming_soon') {
      return {
        ok: false,
        kind: 'invalid',
        key,
        message: `Modul "${def.label}" segera hadir dan belum bisa diaktifkan.`,
      };
    }
  }

  const before = resolveModules(current);
  const afterEnable = resolveModules([...before, ...enable]);
  const disableKeys = normalize(disable);
  const remaining = afterEnable.filter((key) => !disableKeys.includes(key));

  for (const key of disableKeys) {
    const def = getModuleDefinition(key);
    if (def.core) {
      return {
        ok: false,
        kind: 'conflict',
        key,
        message: `Modul "${def.label}" adalah modul inti dan tidak bisa dimatikan.`,
      };
    }
    if (!afterEnable.includes(key)) continue;
    const dependents = enabledDependentsOf(key, remaining);
    if (dependents.length) {
      const names = dependents.map(moduleLabel).join(', ');
      return {
        ok: false,
        kind: 'conflict',
        key,
        message: `Modul "${def.label}" masih dipakai oleh modul aktif: ${names}. Matikan modul tersebut lebih dulu.`,
      };
    }
  }

  const modules = resolveModules(remaining);
  return {
    ok: true,
    modules,
    turnedOff: before.filter((key) => !modules.includes(key)),
    turnedOn: modules.filter((key) => !before.includes(key)),
  };
}
