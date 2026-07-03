# Auth Layer

Direktori ini disiapkan untuk **Phase 3**:

- `ClientAppGuard` dari `@bagdja/node-sdk` untuk validasi JWT / `x-api-token`.
- `TenantStaffGuard` untuk memastikan user punya akses ke `website_id` tertentu.
- `RolesDecorator` + `RolesGuard` untuk role-based access (`owner`, `admin`, `editor`, `viewer`).

Untuk Phase 1 sengaja dibiarkan kosong; auth di-wire di Phase 3 setelah tabel
`tenant_staff` sudah tersedia.
