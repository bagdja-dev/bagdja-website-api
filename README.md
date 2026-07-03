# Bagdja Website API

Backend NestJS untuk **Bagdja Website Builder** — platform SaaS multi-tenant
website UMKM. Lihat [`../plan.md`](../plan.md) untuk blueprint lengkap.

## Stack

- NestJS 10 + TypeScript
- TypeORM 0.3 (hanya query — schema dikelola via Supabase migrations)
- Supabase PostgreSQL
- `@bagdja/node-sdk` untuk auth + logging terpusat
- Swagger di `/docs` (proteksi Basic Auth)

## Quick Start

```bash
# Salin env & isi kredensial
cp .env.example .env

# Install dependencies
npm install

# (opsional) start database lokal
npm run db:start

# Jalankan API (watch mode)
npm run start:dev
```

Default port: **5003** → `http://localhost:5003`
Swagger: `http://localhost:5003/docs`
Health: `http://localhost:5003/health`

## Struktur

```
src/
├── main.ts                       # Bootstrap + Swagger
├── app.module.ts                 # TypeORM + BagdjaModule + fitur
├── database/                     # DatabaseModule (Global; entity registry)
├── common/
│   └── auth/                     # (Phase 3) Guards & decorators
├── modules/
│   ├── health/                   # /health endpoint
│   ├── websites/                 # (Phase 4) CRUD website
│   ├── pages/                    # (Phase 4) CRUD halaman
│   ├── sections/                 # (Phase 4) CRUD section
│   ├── templates/                # (Phase 4) read-only template
│   └── staff/                    # (Phase 3) tenant_staff + invitations
└── entities/                     # (Phase 2) TypeORM entities
supabase/
├── config.toml
├── migrations/                   # (Phase 2) SQL migrations
└── seed.sql
```

## Konvensi

- `orgId` / `appId` = **slug** (mengikuti standar Bagdja Core).
- Schema DB dikelola via `supabase/migrations/`, **bukan** TypeORM `synchronize`.
- Semua modul fitur harus lolos `ClientAppGuard` (Phase 3).

## Roadmap Sub-Phase (di dalam Phase 1)

- [x] Scaffold NestJS + TypeORM + BagdjaModule
- [x] Endpoint `/health`
- [x] Swagger + Basic Auth
- [x] Konfigurasi Supabase lokal (port 54341-54344)

Lanjutan (Phase 2+):

- [ ] Entities & migrations untuk 7 tabel utama
- [ ] Guards `ClientAppGuard`, `TenantStaffGuard`, `RolesGuard`
- [ ] CRUD Websites/Pages/Sections/Templates/Staff
