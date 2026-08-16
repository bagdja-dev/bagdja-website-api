# Bagdja Website Builder - Subscription & Wallet Implementation Plan

> **Tanggal:** 2026-08-15  
> **Update Progress:** 2026-08-16 (Fase 1–5 ✅ SEMUA SELESAI + e2e test diverifikasi Nandang 2026-08-16 — lihat tabel status)  
> **Update Sebelumnya:** 2026-08-15 (Fase 1 ✅ + Fase 2 ✅ coding selesai, tinggal typecheck & test manual)  
> **Blueprint Referensi:** `app/pos/bagdja-pos-api/BAGDJA_POS_SUBSCRIPTION_GUIDE.md` (production-ready)  
> **Kondisi Awal Aktual (PENTING dibaca):** Lihat §1 di bawah

---

## 📅 UPDATE PROGRESS IMPLEMENTASI

| Fase | Tanggal | Status Catatan |
|------|---------|----------------|
| **Fase 1: Backend Setup** | 2026-08-15 | ✅ **SELESAI TOTAL** — coding + verifikasi + e2e test (1.9-1.10) ✅ 2026-08-16 |
| **Fase 2: Frontend Admin** | 2026-08-15 | ✅ **SELESAI TOTAL** — coding + verifikasi + e2e test (2.7-2.8) ✅ 2026-08-16 |
| Fase 3: Plan Limit Enforcement | 2026-08-16 | ✅ **SELESAI TOTAL** — 3.1–3.5 coding + 3.6 e2e test ✅ 2026-08-16 |
| Fase 4: UX Polish | 2026-08-16 | ✅ **SELESAI TOTAL** — semua item (4.1–4.5) coding + verifikasi + e2e ✅ 2026-08-16 |
| Fase 5: Paywall Public | 2026-08-16 | ✅ **SELESAI TOTAL** — coding + verifikasi + e2e test (5.3) ✅ 2026-08-16 |

**Lokasi file implementasi Fase 1:**
- [.env.example](file:///Users/nandanghermawan/Project/bagdja/app/website/bagdja-website-api/.env.example#L34-L37) — BAGDJA_PAYMENT_API + AUTO_SUBSCRIBE_FREE_ENABLED
- [subscription-plan.entity.ts](file:///Users/nandanghermawan/Project/bagdja/app/website/bagdja-website-api/src/entities/subscription-plan.entity.ts)
- [user-subscription.entity.ts](file:///Users/nandanghermawan/Project/bagdja/app/website/bagdja-website-api/src/entities/user-subscription.entity.ts)
- [entities/index.ts](file:///Users/nandanghermawan/Project/bagdja/app/website/bagdja-website-api/src/entities/index.ts#L13-L14) — export entity baru
- `src/modules/wallet/`: [wallet.service.ts](file:///Users/nandanghermawan/Project/bagdja/app/website/bagdja-website-api/src/modules/wallet/wallet.service.ts), [wallet.controller.ts](file:///Users/nandanghermawan/Project/bagdja/app/website/bagdja-website-api/src/modules/wallet/wallet.controller.ts), [wallet.module.ts](file:///Users/nandanghermawan/Project/bagdja/app/website/bagdja-website-api/src/modules/wallet/wallet.module.ts), [create-topup.dto.ts](file:///Users/nandanghermawan/Project/bagdja/app/website/bagdja-website-api/src/modules/wallet/dto/create-topup.dto.ts)
- `src/modules/subscriptions/`: [subscriptions.service.ts](file:///Users/nandanghermawan/Project/bagdja/app/website/bagdja-website-api/src/modules/subscriptions/subscriptions.service.ts) (8 method: listActivePlans / findMy / subscribe / changePlan / cancel / billingHistory / getFreePlan / autoSubscribeFreeIfEligible), [subscriptions.controller.ts](file:///Users/nandanghermawan/Project/bagdja/app/website/bagdja-website-api/src/modules/subscriptions/subscriptions.controller.ts) (7 endpoint + ownership assertion anti IDOR), [plan-limit.service.ts](file:///Users/nandanghermawan/Project/bagdja/app/website/bagdja-website-api/src/modules/subscriptions/plan-limit.service.ts) (FREE_PLAN default: 1 website, 5 pages, 10 produk, 1 staff; reusable check helpers untuk Fase 3), [subscriptions.module.ts](file:///Users/nandanghermawan/Project/bagdja/app/website/bagdja-website-api/src/modules/subscriptions/subscriptions.module.ts), [subscription.dto.ts](file:///Users/nandanghermawan/Project/bagdja/app/website/bagdja-website-api/src/modules/subscriptions/dto/subscription.dto.ts)
- [app.module.ts](file:///Users/nandanghermawan/Project/bagdja/app/website/bagdja-website-api/src/app.module.ts#L24-L25) (import line) dan [array L95-L96](file:///Users/nandanghermawan/Project/bagdja/app/website/bagdja-website-api/src/app.module.ts#L95-L96) (imports array)

**Lokasi file implementasi Fase 2:**
- [lib/currency.ts](file:///Users/nandanghermawan/Project/bagdja/app/website/bagdja-website-admin/app/lib/currency.ts) — formatCurrency + SUPPORTED_CURRENCIES = [IDR]
- [api/public/subscription-plans/route.ts](file:///Users/nandanghermawan/Project/bagdja/app/website/bagdja-website-admin/app/api/public/subscription-plans/route.ts) — proxy server-side ke website-api (untuk landing pricing section public nanti)
- [components/sidebar.tsx](file:///Users/nandanghermawan/Project/bagdja/app/website/bagdja-website-admin/app/components/sidebar.tsx#L78-L86) — nav item baru "Tagihan & Langganan" (antara Tim ↔ Pengaturan) dengan icon credit card inline SVG
- [dashboard/billing/page.tsx](file:///Users/nandanghermawan/Project/bagdja/app/website/bagdja-website-admin/app/dashboard/billing/page.tsx) — halaman billing KOMPLIT (adaptasi POS): grid wallet + plan card, billing history table, 4 modal (Topup / Pilih Plan / Cancel / Ubah Plan dengan upgrade/downgrade badge + proration notice), BLOCKING_STATUSES, query param `?status=success/failure` alert
- Catatan adaptasi dari POS: lucide-react diganti inline SVG (IconWallet, IconRefresh); CurrencyInput → HeroUI `<Input type=number>` dengan startContent `Rp`; StickyHeader diganti flex header biasa (tanpa sticky scroll)

---

---

## 0. Daftar Isi

1. [Koreksi Kondisi Awal - Current State Analysis](#1-koreksi-kondisi-awal---current-state-analysis)
2. [Blueprint Pola yang Diadopsi (dari POS)](#2-blueprint-pola-yang-diadopsi-dari-pos)
3. [Arsitektur 3-Layer & Auth Flow](#3-arsitektur-3-layer--auth-flow)
4. [Model Ownership: PER-USER (Personal, bukan per-Website)](#4-model-ownership-per-user-personal-bukan-per-website)
5. [Fase 1: Backend Setup (bagdja-website-api)](#5-fase-1-backend-setup-bagdja-website-api)
6. [Fase 2: Frontend Admin (bagdja-website-admin)](#6-fase-2-frontend-admin-bagdja-website-admin)
7. [Fase 3: Plan Limit Enforcement](#7-fase-3-plan-limit-enforcement)
8. [Fase 4: History, Cancel, Change Plan UX Polish](#8-fase-4-history-cancel-change-plan-ux-polish)
9. [Fase 5: Public Website Renderer Paywall](#9-fase-5-public-website-renderer-paywall)
10. [Security Checklist](#10-security-checklist)
11. [Environment Variables](#11-environment-variables)
12. [Testing Checklist](#12-testing-checklist)
13. [Referensi Kode POS (Template Copy-Paste)](#13-referensi-kode-pos-template-copy-paste)

---

## 1. Koreksi Kondisi Awal - Current State Analysis

> ⚠️ **PERINGATAN:** Dokumen lama `integration-subscription-plan.md` mengklaim Phase 1 Backend & Frontend sebagai **"[x] COMPLETED"**, namun verifikasi file aktual menunjukkan **KLAIM TERSEBUT TIDAK SESUAI REALITAS**. Berikut adalah kondisi aktual per 2026-08-15:

### ✅ YANG BENAR-BENAR SUDAH ADA

| Komponen | Status | Catatan |
|----------|--------|---------|
| **Migration SQL DB** | ✅ ADA | `20260814000001_add_subscription_plans.sql` & `20260814000002_add_user_subscriptions.sql` (hanya table schema di Supabase, **belum ada entity TypeORM**) |
| **Pattern MessagingService** | ✅ ADA | `messaging/messaging.service.ts` - Template untuk client credentials + token cache + HTTP call ke service eksternal (bisa di-clone pattern-nya) |
| **Auth Pattern (JWT)** | ✅ ADA | `AuthUser.userId` via `@CurrentUser()` decorator, JwtStrategy, JwtAuthGuard (sesuai pola POS) |
| **BFF Proxy Pattern** | ✅ ADA | `website-admin/app/api/proxy/[...path]/route.ts` + `backend-api.ts` (sesuai POS) |
| **Client Credentials** | ✅ ADA | `CLIENT_APP_ID=website-builder` + `CLIENT_APP_SECRET` sudah di `.env.example` |
| **BagdjaLogger SDK** | ✅ ADA | `@bagdja/node-sdk` + BagdjaModule.register() sudah aktif di app.module |
| **UI Components Dasar** | ✅ ADA | `AppModal`, `LoadingSpinner`, sidebar (HeroUI + Tailwind) |

### ❌ YANG SAMA SEKALI BELUM ADA (BUTUH IMPLEMENTASI 100%)

| Area | Yang Tidak Ada |
|------|----------------|
| **Website-Api Modules** | TIDAK ADA folder `src/modules/wallet/` dan `src/modules/subscriptions/` sama sekali |
| **Entity TypeORM** | Tidak ada entity untuk `subscription_plans` dan `user_subscriptions` (table hanya via SQL Supabase, tidak dikenali TypeORM) |
| **App Module Import** | `app.module.ts` tidak ada import WalletModule / SubscriptionsModule |
| **Env Vars** | `.env.example` TIDAK ADA `BAGDJA_PAYMENT_API` entry (hanya ada AUTH, LOG, MESSAGE) |
| **Admin Dashboard Billing** | TIDAK ADA `/dashboard/billing/page.tsx` |
| **Admin Billing Components** | TIDAK ADA folder `app/components/billing/` (balance-card, topup-modal, plan-card, plans-modal, history-table) |
| **Sidebar Nav Billing** | `sidebar.tsx` tidak ada menu "Billing" / "Tagihan" |
| **Plan Limit Checks** | `websites.service.ts`, `pages.service.ts`, dll. belum ada cek plan sama sekali |
| **Public Plans API Route** | Frontend admin tidak ada `/api/public/subscription-plans` proxy |
| **Auto-subscribe Free** | Tidak ada mekanisme auto-subscribe plan free saat user pertama kali login |
| **Dependencies** | `@nestjs/axios` TIDAK ADA (opsional, karena POS pakai `fetch()` native saja) → **TIDAK PERLU**, ikut POS pakai native fetch |

---

## 2. Blueprint Pola yang Diadopsi (dari POS)

**SEMUA implementasi subscription & wallet di Website Builder HARUS mengikuti pola POS**, bukan pola di dokumen lama. Alasan:
- POS sudah production-tested, pattern ownership assertion, error handling, logging, dan data modelnya sudah matang
- Payment-service endpoint juga sudah disesuaikan untuk pola POS (bukan pola dokumen lama yang berbeda nama endpoint)

### Ringkasan Perbedaan Penting (Dokumen Lama vs POS Blueprint):

| Aspek | Dokumen Lama (SALAH) | POS Blueprint (YANG BENAR - kita pakai ini) |
|-------|---------------------|--------------------------------------------|
| **Cancel endpoint** | `POST /subscriptions/:userId/cancel` | `POST /subscriptions/:subscriptionId/cancel` dengan ownership assertion |
| **Change Plan** | TIDAK ADA di spec | ADA: `POST /subscriptions/:id/change-plan` dengan proration |
| **Billing History** | `/history` per user | `/:id/billing-history` per subscriptionId |
| **Status Blocking** | Tidak jelas | `BLOCKING_STATUSES = {ACTIVE, PAST_DUE, TRIALING}` (block subscribe baru) |
| **Get My Subscriptions** | `/current` (1 object) | `/my` (array, lalu cari yang matching BLOCKING_STATUSES atau SUSPENDED) |
| **Plans endpoint path** | `/plans` | `/plans` (sama) TAPI public endpoint: payment-service punya `/subscription-plans/active?appId=` |
| **Auto-subscribe free** | Tidak ada spec | ADA: `POST /auto-subscribe-free` idempotent |
| **Proration** | Tidak ada spec | ADA: sisa periode dihitung otomatis, excess credit forfeit (no refund) |

---

## 3. Arsitektur 3-Layer & Auth Flow

```
┌──────────────────────────────────────────────────────────┐
│  bagdja-website-admin (Next.js 14 @ :5004)               │
├──────────────────────────────────────────────────────────┤
│  • /dashboard/billing/page.tsx                           │
│  • /api/proxy/* (BFF - baca httpOnly cookie bw_token)    │
│  • /api/public/subscription-plans (landing pricing)      │
│  • apiClient<T>() → fetch /api/proxy/*                   │
│  • backendFetch() → inject Authorization: Bearer <token> │
└──────────────────────┬───────────────────────────────────┘
                       │
                       ▼
┌──────────────────────────────────────────────────────────┐
│  bagdja-website-api (NestJS 10 @ :5003)                  │
├──────────────────────────────────────────────────────────┤
│  • JwtAuthGuard + @CurrentUser() → userId dari JWT sub   │
│  • UserService.upsertUser() auto-create users row        │
│                                                          │
│  ┌─ MODUL BARU: WalletModule ─────────────────────────┐ │
│  │  GET /api/wallet/balance     (userId from JWT)     │ │
│  │  POST /api/wallet/topup      (→ checkoutUrl)       │ │
│  └──────────────────────┬─────────────────────────────┘ │
│                         │  Client Credentials Auth        │
│  ┌─ MODUL BARU: SubscriptionsModule ────────────────┐   │
│  │  GET  /api/subscriptions/plans      (PUBLIC)      │   │
│  │  GET  /api/subscriptions/my         (my list)     │   │
│  │  POST /api/subscriptions/subscribe  (debit wallet)│   │
│  │  POST /api/subscriptions/auto-subscribe-free      │   │
│  │  GET  /api/subscriptions/:id/billing-history      │   │
│  │  POST /api/subscriptions/:id/cancel                │   │
│  │  POST /api/subscriptions/:id/change-plan           │   │
│  └──────────────────────┬─────────────────────────────┘   │
│                         │ x-api-token (CLIENT_APP auth)   │
└─────────────────────────┼─────────────────────────────────┘
                          │
                          ▼
┌──────────────────────────────────────────────────────────┐
│  bagdja-payment-service (Core Engine @ :4006)            │
│                                                          │
│  • ClientAppGuard verifikasi x-api-token                 │
│  • SubscriptionsService, WalletService, BillingService   │
│  • BullMQ Scheduler: recurring billing + dunning policy  │
│  • Fee Calculation (platform fee potong per transaksi)   │
└──────────────────────────────────────────────────────────┘
```

---

## 4. Model Ownership: PER-USER (Personal, bukan per-Website)

**Keputusan final (mengikuti POS pattern & dokumen lama §2.1 Opsi A):**
```
1 USER = 1 WALLET (IDR) = 1 ACTIVE SUBSCRIPTION (berlaku ke SEMUA websites milik user)
```

- User dengan plan Free: max 1 website, 5 pages, 10 produk
- User dengan plan Basic: max 5 websites, dll
- User dengan plan Pro: unlimited

**Kenapa bukan per-Website?**
- Sederhana untuk MVP (tidak perlu manage multiple billing)
- Sesuai pola POS yang sudah terbukti
- Kalau nanti business perlu, bisa ditambahkan scope per-website tanpa breaking user flow

### User Resolution Pattern (KRITIS):

DI SEMUA endpoint mutasi/query wallet & subscriptions:
```typescript
// ❌ JANGAN PERNAH terima userId dari body / param client!
@Post('topup')
badExample(@Body() dto: { userId: string, amount: number }) { ... }

// ✅ SELALU ambil userId dari JWT via @CurrentUser() decorator!
@UseGuards(JwtAuthGuard)
@Post('topup')
goodExample(
  @CurrentUser() authUser: AuthUser,  // ← source of truth userId
  @Body() dto: { amount: number }
) {
  return this.walletService.topup(authUser.userId, dto.amount, ...);
}
```

---

## 5. Fase 1: Backend Setup (bagdja-website-api)

> **Estimasi:** 2-3 hari kerja  
> **Deliverable:** Semua route wallet & subscription berjalan, bisa dipanggil dari Postman/cURL  
> **Template Copy-Paste:** `app/pos/bagdja-pos-api/src/modules/subscriptions/*` dan `app/pos/bagdja-pos-api/src/modules/wallet/*`

---

### 5.1 Environment Variables (.env.example + .env lokal)

**File:** `.env.example` dan `.env` (update)

Tambahkan entry berikut (sudah ada auth, tinggal tambah payment):
```env
## ─── Bagdja Payment Service ────────────────────────────
BAGDJA_PAYMENT_API=http://localhost:4006
# BAGDJA_AUTH_API sudah ADA di line 18, reuse untuk client credentials
```

*Catatan: CLIENT_APP_ID dan CLIENT_APP_SECRET sudah ada (line 26-27), reuse itu saja.*

---

### 5.2 Task 1.1: Buat Entity TypeORM untuk Table Subscription

**File baru:** `src/entities/subscription-plan.entity.ts`
**File baru:** `src/entities/user-subscription.entity.ts`

Referensi struktur DB (dari migration SQL):

```sql
subscription_plans:
  id (UUID PK), external_id (TEXT UNIQUE), app_id, name,
  price_monthly (NUMERIC), metadata JSONB (default {}),
  is_active, created_at, updated_at, synced_at

user_subscriptions:
  id (UUID PK), user_id (FK users.id ON DELETE CASCADE),
  plan_id (FK subscription_plans.id ON DELETE RESTRICT),
  status (CHECK IN 'active','canceled','past_due'),
  started_at, ends_at, external_subscription_id,
  created_at, updated_at, synced_at
  UNIQUE INDEX partial: hanya 1 active per user_id
```

**PENTING:** Entity ini LOCAL CACHE (untuk enforce plan limits tanpa network call ke payment-service). Data otoritatif tetap di `bagdja-payment-service`. Update `src/entities/index.ts` untuk export kedua entity baru.

---

### 5.3 Task 1.2: Buat Modul Wallet (Proxy ke Payment-Service)

**Struktur folder baru:**
```
src/modules/wallet/
├── wallet.module.ts
├── wallet.service.ts         (proxy ke GET /wallets/user/:userId/:currency & POST /topup/personal)
├── wallet.controller.ts      (routes GET /api/wallet/balance & POST /api/wallet/topup)
└── dto/
    └── create-topup.dto.ts   (amount Min 10000, currency only IDR)
```

**Clone & Adapt dari POS:**
- `wallet.service.ts` → copy dari POS [wallet.service.ts](file:///Users/nandanghermawan/Project/bagdja/app/pos/bagdja-pos-api/src/modules/wallet/wallet.service.ts)
  - Ubah appId default dari `'bagdja-pos'` → `'bagdja-website'` (atau ambil dari CLIENT_APP_ID)
  - `adminAppUrl`: gunakan `ADMIN_APP_URL` env (sudah ada line 31)
  - `successRedirectUrl` / `failureRedirectUrl`: `${adminAppUrl}/dashboard/billing?status=success` dan `?status=failure`
- `wallet.controller.ts` → copy dari POS [wallet.controller.ts](file:///Users/nandanghermawan/Project/bagdja/app/pos/bagdja-pos-api/src/modules/wallet/wallet.controller.ts)
- `dto/create-topup.dto.ts` → copy dari POS [create-topup.dto.ts](file:///Users/nandanghermawan/Project/bagdja/app/pos/bagdja-pos-api/src/modules/wallet/dto/create-topup.dto.ts)

**Pola Auth Token di service:**
- `getAuthToken()`: exact clone dari MessagingService (fetch `${BAGDJA_AUTH_API}/auth/client` dengan `{app_id, app_secret}`, return `x-api-token`, cache in-memory 1 jam)
- Semua error: throw `BadGatewayException` dengan logging via `BagdjaLogger.bagdjaLog()` + tag `['wallet', ...]`

---

### 5.4 Task 1.3: Buat Modul Subscriptions (Proxy ke Payment-Service)

**Struktur folder baru:**
```
src/modules/subscriptions/
├── subscriptions.module.ts
├── subscriptions.service.ts     (CORE - proxy ke payment-service)
├── subscriptions.controller.ts  (7 routes: plans PUBLIC / my / subscribe / auto-subscribe-free / :id/billing-history / :id/cancel / :id/change-plan)
└── dto/
    └── subscription.dto.ts      (SubscribePlanDto: planId UUID; CancelSubscriptionDto: cancelAtPeriodEnd boolean)
```

**Clone & Adapt dari POS:**
- `subscriptions.service.ts` → copy dari POS [subscriptions.service.ts](file:///Users/nandanghermawan/Project/bagdja/app/pos/bagdja-pos-api/src/modules/subscriptions/subscriptions.service.ts)
  - Method yang ada di POS: `listActivePlans`, `findMy`, `subscribe`, `getBillingHistory`, `cancel`, `changePlan`, `getFreePlan`, `autoSubscribeFreeIfEligible`
  - Semua endpoint payment-service path SAMA PERSIS dengan POS
  - appId scope: `bagdja-website` (bukan bagdja-pos)

- `subscriptions.controller.ts` → copy dari POS [subscriptions.controller.ts](file:///Users/nandanghermawan/Project/bagdja/app/pos/bagdja-pos-api/src/modules/subscriptions/subscriptions.controller.ts)
  - **7 Endpoint** (sama persis dengan POS):
    1. `GET /api/subscriptions/plans` — PUBLIC (tanpa guard), untuk katalog pricing
    2. `GET /api/subscriptions/my` — butuh JWT, list subscription milik user login
    3. `POST /api/subscriptions/subscribe` — butuh JWT, body `{ planId: UUID }`
    4. `POST /api/subscriptions/auto-subscribe-free` — butuh JWT, IDEMPOTENT (feature flag via env)
    5. `GET /api/subscriptions/:id/billing-history` — butuh JWT + **ownership assertion**
    6. `POST /api/subscriptions/:id/cancel` — butuh JWT + ownership, body `{ cancelAtPeriodEnd?: boolean = true }`
    7. `POST /api/subscriptions/:id/change-plan` — butuh JWT + ownership, body `{ planId: UUID }`

  - **OWNERSHIP ASSERTION PATTERN (KRITIS keamanan):**
    Sebelum menangani endpoint `:id/*`, panggil `this.findMy(userId)` lalu cek apakah `subscriptionId` ada di list tersebut. Kalau tidak ada → `NotFoundException`. (Ini mencegah IDOR attack: user A mengakses subscription user B via id acak)

- `dto/subscription.dto.ts` → copy dari POS [subscription.dto.ts](file:///Users/nandanghermawan/Project/bagdja/app/pos/bagdja-pos-api/src/modules/subscriptions/dto/subscription.dto.ts)

---

### 5.5 Task 1.4: Update AppModule + .env.example + Import Modules

**File yang diubah:** `src/app.module.ts`
- Import `WalletModule` dan `SubscriptionsModule` ke array `imports: []`
- (Opsional) Import `TypeOrmModule.forFeature([SubscriptionPlan, UserSubscription])` kalau mau pakai local cache via repository pattern di service

**File yang diubah:** `.env.example`
- Tambahkan line: `BAGDJA_PAYMENT_API=http://localhost:4006` (di bagian Bagdja Platform Integration)

---

### 5.6 Task 1.5: [Optional Tapi Disarankan] Local Cache + Plan Limit Helper Service

**File baru:** `src/modules/subscriptions/plan-limit.service.ts`

Service reusable untuk enforce plan limits (dipanggil oleh WebsitesService, PagesService, dll. di Fase 3):
```typescript
@Injectable()
export class PlanLimitService {
  constructor(
    private subscriptionsService: SubscriptionsService,
    // bisa inject Repository<SubscriptionPlan/UserSubscription> untuk local cache
  ) {}

  async getEffectivePlanLimits(userId: string): Promise<{
    maxWebsites: number;
    maxPagesPerWebsite: number;
    maxProductsPerWebsite: number;
    maxStaffPerWebsite: number;
    customDomainAllowed: boolean;
  }> {
    // Logic:
    // 1. Cari active subscription user (call findMy → cari BLOCKING_STATUSES match)
    // 2. Jika tidak ada → default FREE plan limits
    // 3. Return plan.metadata as limit numbers
    // (kalau ada local cache entity, bisa hit ke DB tanpa network call)
  }

  async checkCanCreateWebsite(userId: string, currentCount: number): Promise<void> {
    // throw ForbiddenException('Website limit reached. Upgrade plan.') if over limit
  }
}
```

Export `PlanLimitService` dari `SubscriptionsModule.exports` supaya bisa diinject ke module lain.

---

### 5.7 Task 1.6: Register di AppModule + Verifikasi Swagger

- Jalankan `npm run start:dev` untuk website-api
- Buka Swagger (default `/api` atau `/docs` sesuai main.ts setup)
- Pastikan group **Wallet** dan **Subscriptions** muncul, semua endpoint terdaftar, DTO schema benar

---

## 6. Fase 2: Frontend Admin (bagdja-website-admin)

> **Estimasi:** 2-3 hari kerja  
> **Deliverable:** Halaman Billing berjalan, user bisa lihat saldo, topup, subscribe plan  
> **Template Copy-Paste:** `app/pos/bagdja-pos-admin/app/dashboard/subscription/page.tsx` + `landing-pricing.tsx`

---

### 6.1 Task 2.0: Tambahkan lucide-react sebagai Dependency (Opsional)

POS pakai `lucide-react` untuk ikon `Wallet`, `RefreshCw`, dll. Website-admin saat ini pakai inline SVG.

**Opsi A (Cepat, tanpa install baru):** Ikut pola website-admin sekarang, semua icon inline SVG.
**Opsi B (Lebih rapi, rekomendasi):** Tambah lucide-react.
```bash
cd app/website/bagdja-website-admin
npm install lucide-react
```
Kalau pilih opsi B, jalankan perintah di atas dulu.

---

### 6.2 Task 2.1: Buat Utilitas Currency Formatter

**File baru:** `app/lib/currency.ts`

Copy dari POS [currency.ts](file:///Users/nandanghermawan/Project/bagdja/app/pos/bagdja-pos-admin/app/lib/currency.ts). Fungsi `formatCurrency(amount, currency = 'IDR')` untuk format Rupiah dengan `new Intl.NumberFormat('id-ID', ...)`.

---

### 6.3 Task 2.2: Public Plans API Route (Untuk Landing Nanti)

**File baru:** `app/api/public/subscription-plans/route.ts`

Copy persis dari POS [route.ts](file:///Users/nandanghermawan/Project/bagdja/app/pos/bagdja-pos-admin/app/api/public/subscription-plans/route.ts) dengan perubahan:
- `API_BASE` default: `http://localhost:5003` (bukan 5006)
- Target endpoint: `${API_BASE}/api/subscriptions/plans`

Ini server-side proxy supaya browser client tidak perlu tahu NEXT_PUBLIC_API_URL. Dipakai untuk landing page pricing section ke depannya.

---

### 6.4 Task 2.3: Tambah Nav Item "Billing" di Sidebar

**File diubah:** `app/components/sidebar.tsx`

Tambahkan entry baru ke `navItems: NavItem[]`, antara "Tim" dan "Pengaturan" (atau paling bawah sebelum Pengaturan):

```typescript
{
  label: 'Tagihan & Langganan',   // atau "Billing"
  href: '/dashboard/billing',
  icon: ( /* SVG Credit Card atau lucide Wallet */ ),
}
```

Pakai inline SVG credit card pattern.

---

### 6.5 Task 2.4: Buat Halaman Billing Utama

**File baru:** `app/dashboard/billing/page.tsx`

**Copy adaptasi dari POS:** [subscription/page.tsx](file:///Users/nandanghermawan/Project/bagdja/app/pos/bagdja-pos-admin/app/dashboard/subscription/page.tsx)

**Perbedaan utama dari POS (sesuaikan):**

| Bagian | POS | Website Admin (yang kita buat) |
|--------|-----|-------------------------------|
| **Judul Header** | "Subscription" | "Tagihan & Langganan" |
| **Layout Wallet + Plan** | Card 2 kolom (grid lg:grid-cols-2) | SAMA PERSIS |
| **Data Fetching** | `Promise.all([wallet, plans, subscriptions, history])` | SAMA, endpoint path disesuaikan: <br>• `/api/wallet/balance` (sama)<br>• `/api/subscriptions/plans` (bukan `/plans`)<br>• `/api/subscriptions/my` (bukan `/my`)<br>• history: `/api/subscriptions/${id}/billing-history` |
| **BLOCKING_STATUSES** | Sama (`ACTIVE, PAST_DUE, TRIALING`) | SAMA |
| **STATUS_COLOR map** | HeroUI Chip colors (`success, warning, danger, default, primary`) | SAMA |
| **Topup Modal** | `AppModal` + input amount min Rp 10.000 + redirect ke `checkoutUrl` | SAMA, AppModal yang sudah ada (komponen AppModal website-admin sedikit beda signature: `size` support `sm|md|lg|xl`, cek props `AppModalProps`) |
| **Subscribe Modal** | Pilih plan (group MONTHLY/YEARLY) | SAMA |
| **Cancel Modal** | Soft cancel at period end | SAMA |
| **Change Plan Modal** | Show upgrade/downgrade + proration notice (UI only, proration calculated di backend) | SAMA |
| **Query Params Status** | `?status=success/failure` (dari redirect topup) | SAMA |
| **Refresh Button** | Top-right icon button | SAMA |

**Interface Type yang dibutuhkan (mirip POS):**
```typescript
WalletBalance { currency_code, balance, held_balance, is_active }
SubscriptionPlan { id, code, name, description, price, currency, billingInterval, intervalCount, isActive }
Subscription { id, planId, lockedAmount, currency, status, currentPeriodStart, currentPeriodEnd, nextBillingDate, cancelAtPeriodEnd, cancelledAt, failedAttemptCount, gracePeriodEndsAt, nextRetryAt }
BillingAttempt { id, attemptNumber, status (SUCCEEDED/FAILED), kind (SUBSCRIBE/RENEWAL/PLAN_CHANGE), amount, platformFeeAmount, currency, failureReason, attemptedAt }
```

**State Management:** Semua state (loading, error, modal open/close, selectedPlanId) ikut pola POS page.

---

## 7. Fase 3: Plan Limit Enforcement

> **Estimasi:** 1 hari kerja  
> **Deliverable:** Plan limits aktif pada runtime — user tidak bisa melebihi batas website/page/produk sesuai plan

---

### 7.1 Task 3.1: Inject PlanLimitService ke WebsitesModule

**File diubah:** `src/modules/websites/websites.module.ts`
- Import `SubscriptionsModule` (agar `PlanLimitService` tersedia via DI)

**File diubah:** `src/modules/websites/websites.service.ts`
- Inject `PlanLimitService` ke constructor
- Di method `createWebsite()`: SEBELUM save entity, hitung `count = await this.repo.countBy({ owner_id: userId })`, lalu panggil `planLimitService.checkCanCreateWebsite(userId, count)`. Kalau limit tercapai → `ForbiddenException` dengan pesan upgrade-friendly.

### 7.2 Task 3.2: Inject ke PagesModule & SectionsModule & ProductsModule & StaffModule

Sama pola seperti 7.1, untuk masing-masing:
- `pages.service.ts`: cek jumlah pages per website vs plan max
- `products.service.ts`: cek jumlah products per website vs plan max
- `staff.service.ts`: cek jumlah staff per website vs plan max
- `locations.service.ts`, `faqs.service.ts`, `blog-posts.service.ts`: (opsional, kalau plan matrix per-tier mau bedakan)

### 7.3 Task 3.3: Free Plan Metadata Default

Kalau user TIDAK PUNYA subscription (belum subscribe) → otomatis berlaku limit FREE PLAN default:
```typescript
// Default free plan limit (hardcoded kalau tidak ada subscription aktif)
const FREE_PLAN_LIMITS = {
  maxWebsites: 1,
  maxPagesPerWebsite: 5,
  maxProductsPerWebsite: 10,
  maxStaffPerWebsite: 1,
  customDomainAllowed: false,
};
```

---

## 8. Fase 4: History, Cancel, Change Plan UX Polish

> **Estimasi:** 1 hari kerja  
> **Deliverable:** Semua edge case di-handle dengan UX yang jelas, error toast user-friendly

---

### 8.1 Task 4.1: Billing History Table Status Badge

Pastikan row dengan `status === 'FAILED'` menampilkan `failureReason` dalam chip. POS sudah punya pattern ini.

### 8.2 Task 4.2: Past Due & Suspended State UI

- Status `PAST_DUE`: chip warning orange + pesan: "Pembayaran gagal. Retry {formatDate(nextRetryAt)} — Topup saldo agar otomatis terbayar."
- Status `SUSPENDED`: chip danger red + pesan: "Langganan ditangguhkan (3x gagal bayar). Pilih plan baru untuk reaktivasi."
- `cancelAtPeriodEnd === true`: chip warning "Akan berhenti {formatDate(currentPeriodEnd)}"

### 8.3 Task 4.3: Auto-subscribe Free saat Login

Panggil endpoint `POST /api/subscriptions/auto-subscribe-free` segera setelah OAuth callback berhasil (di `/auth/callback/route.ts` setelah `syncUserToBackend()`). Ini ops yang diatur via env `AUTO_SUBSCRIBE_FREE_ENABLED`. Kalau gagal, jangan block login (log warning saja).

### 8.4 Task 4.4: Loading & Error Skeleton States

- Semua fetch pakai `try/catch` dengan `setLoadError` / `setActionError`.
- `loading === true`: tampilkan `LoadingSpinner` bukan card kosong.
- Error ditampilkan sebagai alert border-merah di atas layout.

---

## 9. Fase 5: Public Website Renderer Paywall

> **Estimasi:** 1 hari kerja (opsional untuk MVP v1)  
> **Deliverable:** Website owner yang subscription tidak aktif → public website menampilkan placeholder / belum tayang

---

### 9.1 Task 5.1: Public Controller Check Subscription

**File diubah:** `src/modules/public/public.service.ts` dan `public.controller.ts`

Untuk endpoint yang serve public website (mis. GET public website by slug), sebelum return data cek owner subscription status. Jika status = `CANCELLED` / `SUSPENDED` / `EXPIRED` dan bukan free plan with grace → return response dengan flag `subscription_inactive: true`, lalu renderer frontend `bagdja-website` menampilkan halaman "Website ini belum aktif / owner harus memperbarui langganan."

---

## 10. Security Checklist

> **WAJIB DIPENUHI SEBELUM DEPLOY PRODUKSI**

- [x] **Never trust userId from client:** Semua endpoint selalu ambil userId dari `@CurrentUser()` JWT claim, JANGAN dari body/param — **TERVERIFIKASI 2026-08-16**
- [x] **Ownership Assertion untuk `:id/*` routes:** `assertOwned()` dipanggil SEBELUM cancel/change-plan/billing-history — **TERVERIFIKASI 2026-08-16**
- [ ] **Rate Limiting:** (Opsional) Tambah ThrottlerModule NestJS untuk endpoint subscribe/topup (anti abuse) — *SENGAJA BELUM DIKERJAKAN (opsional, defer — bukan blocker MVP)*
- [x] **planId Validation:** DTO level `@IsUUID()` untuk planId / subscriptionId — **TERVERIFIKASI 2026-08-16**
- [x] **Audit Trail:** Semua wallet & subscription action via `BagdjaLogger.bagdjaLog()` dengan tag jelas — **TERVERIFIKASI 2026-08-16**
- [ ] **HTTPS Redirect:** Pastikan topup success/failure redirect URLs pakai HTTPS di production — *tergantung konfigurasi `ADMIN_APP_URL` di produksi (pastikan https:// saat deploy)*
- [x] **Authorization Test:** Buat user A, dapatkan subscriptionId, login sebagai user B → coba akses /:id/billing-history → harus 404 Not Found (bukan 403, supaya tidak leak apakah id itu valid) — **TERVERIFIKASI 2026-08-16**

---

## 11. Environment Variables Ringkasan

| Variable | Source (A) / Baru (B) | Default | Contoh |
|----------|----------------------|---------|--------|
| `PORT` | A | 5003 | - |
| `DATABASE_URL` | A | postgres local | - |
| `BAGDJA_AUTH_API` | A | http://localhost:4001 | - |
| `JWKS_URL` | A | /auth/.well-known/jwks.json | - |
| `BAGDJA_LOG_URL` | A | http://localhost:4087 | - |
| `BAGDJA_SERVICE_NAME` | A | bagdja-website-api | - |
| `CLIENT_APP_ID` | A | website-builder | - |
| `CLIENT_APP_SECRET` | A | change-me | - |
| `BAGDJA_MESSAGE_API` | A | https://messaging.bagdja.com | - |
| `ADMIN_APP_URL` | A | http://localhost:5004 | - |
| **`BAGDJA_PAYMENT_API`** | **BARU** | **http://localhost:4006** | - |
| `AUTO_SUBSCRIBE_FREE_ENABLED` | BARU | true | boolean |
| `JWT_SECRET` | A | - | - |
| `SWAGGER_USER/PASSWORD` | A | admin / change-me | - |

---

## 12. Testing Checklist (Per Fase)

### Fase 1 (Backend) Test Manual via Postman/cURL:
- [x] `GET /api/subscriptions/plans` → return array plan (PUBLIC, no token) — **TERVERIFIKASI 2026-08-16**
- [x] `GET /api/wallet/balance` + JWT valid → return wallet object IDR — **TERVERIFIKASI 2026-08-16**
- [x] `POST /api/wallet/topup` body `{ amount: 50000 }` + JWT → return `{ checkoutUrl, refNumber }` — **TERVERIFIKASI 2026-08-16**
- [x] `GET /api/subscriptions/my` + JWT → return [] (belum subscribe) — **TERVERIFIKASI 2026-08-16**
- [x] `POST /api/subscriptions/subscribe` body `{ planId: <UUID free plan> }` → return Subscription active — **TERVERIFIKASI 2026-08-16**
- [x] `GET /api/subscriptions/my` lagi → return array length 1 status ACTIVE — **TERVERIFIKASI 2026-08-16**
- [x] `POST /api/subscriptions/:id/cancel` body `{ cancelAtPeriodEnd: true }` → `cancelAtPeriodEnd = true` — **TERVERIFIKASI 2026-08-16**
- [x] **IDOR Test:** Login user B, panggil POST cancel dengan subscriptionId user A → harus 404 NOT FOUND — **TERVERIFIKASI 2026-08-16**
- [x] `POST /api/subscriptions/auto-subscribe-free` untuk user baru tanpa sub → success auto-subscribed — **TERVERIFIKASI 2026-08-16**
- [x] Panggil `auto-subscribe-free` lagi untuk user yang sama → `{ autoSubscribed: false, reason: 'already_subscribed' }` (idempotent) — **TERVERIFIKASI 2026-08-16**

### Fase 2 (Frontend Admin):
- [x] `/dashboard/billing` accessible via sidebar nav — **TERVERIFIKASI 2026-08-16**
- [x] Balance card menampilkan saldo IDR dengan benar — **TERVERIFIKASI 2026-08-16**
- [x] Klik Topup → Modal muncul → isi 50rb → redirect ke checkoutUrl — **TERVERIFIKASI 2026-08-16**
- [x] Subscribe modal → pilih Free plan → berhasil → PlanCard ter-update status ACTIVE — **TERVERIFIKASI 2026-08-16**
- [x] Cancel subscription → chip status "Akan berhenti ..." muncul — **TERVERIFIKASI 2026-08-16**
- [x] Billing history table menampilkan row SUBSCRIBE dengan benar — **TERVERIFIKASI 2026-08-16**
- [x] All error cases: insufficient balance, invalid planId → toast error user-friendly — **TERVERIFIKASI 2026-08-16**

### Fase 3 (Enforcement):
- [x] User free plan punya 1 website → coba create website ke-2 → `ForbiddenException: Website limit reached` — **TERVERIFIKASI 2026-08-16**
- [x] Upgrade plan via change-plan → limit bertambah → create website ke-2 berhasil — **TERVERIFIKASI 2026-08-16**

---

## 13. Referensi Kode POS (Template Copy-Paste Langsung)

| File Website-Api / Website-Admin | Blueprint Source POS (Click to Open) |
|----------------------------------|---------------------------------------|
| `wallet/wallet.service.ts` | [wallet.service.ts](file:///Users/nandanghermawan/Project/bagdja/app/pos/bagdja-pos-api/src/modules/wallet/wallet.service.ts) |
| `wallet/wallet.controller.ts` | [wallet.controller.ts](file:///Users/nandanghermawan/Project/bagdja/app/pos/bagdja-pos-api/src/modules/wallet/wallet.controller.ts) |
| `wallet/dto/create-topup.dto.ts` | [create-topup.dto.ts](file:///Users/nandanghermawan/Project/bagdja/app/pos/bagdja-pos-api/src/modules/wallet/dto/create-topup.dto.ts) |
| `subscriptions/subscriptions.service.ts` | [subscriptions.service.ts](file:///Users/nandanghermawan/Project/bagdja/app/pos/bagdja-pos-api/src/modules/subscriptions/subscriptions.service.ts) |
| `subscriptions/subscriptions.controller.ts` | [subscriptions.controller.ts](file:///Users/nandanghermawan/Project/bagdja/app/pos/bagdja-pos-api/src/modules/subscriptions/subscriptions.controller.ts) |
| `subscriptions/dto/subscription.dto.ts` | [subscription.dto.ts](file:///Users/nandanghermawan/Project/bagdja/app/pos/bagdja-pos-api/src/modules/subscriptions/dto/subscription.dto.ts) |
| Frontend `dashboard/billing/page.tsx` | [subscription/page.tsx](file:///Users/nandanghermawan/Project/bagdja/app/pos/bagdja-pos-admin/app/dashboard/subscription/page.tsx) |
| Frontend `api/public/subscription-plans/route.ts` | [route.ts](file:///Users/nandanghermawan/Project/bagdja/app/pos/bagdja-pos-admin/app/api/public/subscription-plans/route.ts) |
| Frontend `lib/currency.ts` | [currency.ts](file:///Users/nandanghermawan/Project/bagdja/app/pos/bagdja-pos-admin/app/lib/currency.ts) |

---

### Todo List Ringkas per Fase

#### ✅ FASE 1 — BACKEND (website-api):
- [x] 1.1 Tambah `BAGDJA_PAYMENT_API` ke `.env.example` dan `.env` lokal
- [x] 1.2 Buat entity `subscription-plan.entity.ts` + `user-subscription.entity.ts`
- [x] 1.3 Export entity di `src/entities/index.ts`
- [x] 1.4 Buat `src/modules/wallet/` (4 files: module/service/controller/dto)
- [x] 1.5 Buat `src/modules/subscriptions/` (4 files: module/service/controller/dto)
- [x] 1.6 Buat `PlanLimitService` (standalone service reusable untuk Fase 3)
- [x] 1.7 Import `WalletModule` + `SubscriptionsModule` ke `app.module.ts`
- [x] 1.8 Jalankan `npm run lint`, `npm run typecheck` → typecheck ✅ 0 error; lint exit code 1 tapi 1 error pre-existing `_theme unused` di websites.service.ts (bukan kode Fase 1)
- [x] 1.9 Manual test semua 7 endpoint via Swagger/Postman — **TERVERIFIKASI 2026-08-16** (payment-service + auth-service jalan)
- [x] 1.10 Manual test IDOR attack (user B akses sub A) → 404 — **TERVERIFIKASI 2026-08-16**

#### ✅ FASE 2 — FRONTEND ADMIN (website-admin):
- [x] 2.1 Copy `lib/currency.ts` dari POS (formatCurrency IDR)
- [x] 2.2 Buat `api/public/subscription-plans/route.ts` (server-side proxy public ke website-api)
- [x] 2.3 Tambah Nav Item "Tagihan & Langganan" ke `sidebar.tsx` (antara Tim ↔ Pengaturan)
- [x] 2.4 Buat halaman `dashboard/billing/page.tsx` (adaptasi POS subscription page, ~800 line: 4 modal + billing table + plan card + wallet card)
- [x] 2.5 (Opsional) Komponen billing inline di page.tsx — TIDAK dipisah ke `components/billing/*` (sederhana cukup 1 file)
- [x] 2.6 Jalankan `npm run lint`, `npm run typecheck` → typecheck ✅ exit 0, lint ✅ exit 0 "No ESLint warnings or errors"
- [x] 2.7 Manual test flow: lihat saldo → topup → subscribe → cancel → change plan → lihat history — **TERVERIFIKASI 2026-08-16**
- [x] 2.8 Test query param `?status=success` / `?status=failure` (redirect dari topup) → alert muncul — **TERVERIFIKASI 2026-08-16**

#### ✅ FASE 3 — PLAN LIMIT ENFORCEMENT:
- [x] 3.1 Import SubscriptionsModule ke `WebsitesModule`, `PagesModule`, `ProductsModule`, `StaffModule` — **SELESAI 2026-08-16** (tanpa circular dependency)
- [x] 3.2 Inject PlanLimitService ke WebsitesService.createWebsite() + add count check — **SELESAI 2026-08-16** (count via `staffRepo` role `owner`)
- [x] 3.3 Inject check ke PagesService (max pages per website) — **SELESAI 2026-08-16** (`assertWithinPageLimit`)
- [x] 3.4 Inject check ke ProductsService (max products per website) — **SELESAI 2026-08-16** (`assertWithinProductLimit`)
- [x] 3.5 Inject check ke StaffService (max staff per website) — **SELESAI 2026-08-16** (`assertWithinStaffLimit`)
- [x] 3.6 Test manual: Free plan + website count = 1 → create ke-2 ditolak dengan pesan jelas — **TERVERIFIKASI 2026-08-16**

#### ✅ FASE 4 — UX POLISH:
- [x] 4.1 Pastikan PAST_DUE, SUSPENDED, cancelAtPeriodEnd state UI benar — **SELESAI 2026-08-16** (chip PAST_DUE warning + pesan retry, chip SUSPENDED danger + pesan reaktivasi, chip "Akan berhenti {date}" — sudah inline di `dashboard/billing/page.tsx`)
- [x] 4.2 Implementasikan auto-subscribe free di auth callback — **SELESAI 2026-08-16** (merged ke 4.3: `attemptAutoSubscribeFree()` di `app/lib/backend-api.ts` + dipanggil di `app/auth/callback/route.ts` setelah `syncUserToBackend()`, flag `AUTO_SUBSCRIBE_FREE_ENABLED` default true; typecheck ✅ lint ✅)
- [x] 4.3 Error messages user-friendly (bukan stacktrace) — **SELESAI 2026-08-16** (`setLoadError`/`setActionError`/`setFormError` dengan pesan Indonesia yang jelas, bukan stacktrace)
- [x] 4.4 Loading spinners di semua card saat fetch — **SELESAI 2026-08-16** (LoadingSpinner di card Balance & Plan saat `loading===true`, error alert border-merah di atas layout)
- [x] 4.5 Test edge case: topup amount 9000 → DTO reject min 10000 — **SELESAI 2026-08-16** (validasi `MIN_TOPUP=10000` di frontend `handleTopup` + input `min={MIN_TOPUP}` + backend DTO `@Min(10000)`)

#### ✅ FASE 5 — PUBLIC RENDERER PAYWALL (OPSIONAL V1):
- [x] 5.1 Update PublicService cek subscription owner — **SELESAI 2026-08-16** (`isSubscriptionInactive()` + `withPaywallFlag()` di `public.service.ts`; defensif: error payment-service → anggap aktif, jangan take down website)
- [x] 5.2 Halaman "Website not active" placeholder di bagdja-website renderer — **SELESAI 2026-08-16** (`components/website-inactive-notice.tsx`, guard di 5 halaman tenant: home, sub-page, product, blog, kategori)
- [x] 5.3 Test: suspend subscription → public site menampilkan notice — **TERVERIFIKASI 2026-08-16**

---

### Ringkasan Estimasi Total

| Fase | Estimasi Hari | Prioritas |
|------|---------------|-----------|
| Fase 1: Backend Setup | 2-3 hari | 🔴 WAJIB MVP |
| Fase 2: Frontend Billing | 2-3 hari | 🔴 WAJIB MVP |
| Fase 3: Limit Enforcement | 1 hari | 🟠 HIGH |
| Fase 4: UX Polish | 1 hari | 🟡 MEDIUM |
| Fase 5: Paywall Public | 1 hari (opsional) | 🟢 NICE TO HAVE |
| **TOTAL MVP (F1 + F2 + F3)** | **5-7 hari** | - |

---

## Document Info

- **Author:** Implementation Plan (based on POS production blueprint)
- **Date:** 2026-08-15
- **Current Code Analysis Status:** ✅ Verified actual file system (100% akurat sesuai kondisi aktual)
- **Source of Truth Pattern:** `app/pos/bagdja-pos-api/BAGDJA_POS_SUBSCRIPTION_GUIDE.md`
- **Deprecated Doc:** `integration-subscription-plan.md` (hanya referensi, tapi status [x]-nya TIDAK SESUAI realitas — gunakan dokumen INI sebagai acuan)
