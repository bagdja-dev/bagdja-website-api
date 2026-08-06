import type { SelectQueryBuilder } from 'typeorm';

/**
 * Standar grid/DataTable platform Bagdja (lihat `core/docs/STANDARDIZATION_GRID_DATA.md`):
 * query params `page` (1-based), `size`, `search`, `sort` (`key:direction`),
 * `filter[key]=value` (bracket notation) → response `{ data, meta }`.
 *
 * Port 1:1 dari `bagdja-pos-api/src/common/grid/grid-query.util.ts` supaya
 * kontrak list/pagination konsisten lintas produk Bagdja.
 */

export interface GridMeta {
  totalItems: number;
  itemCount: number;
  itemsPerPage: number;
  totalPages: number;
  currentPage: number;
}

export interface GridResult<T> {
  data: T[];
  meta: GridMeta;
}

export interface GridQueryParams {
  page: number;
  size: number;
  search?: string;
  sort?: string;
  filter: Record<string, string>;
}

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

/** Parse query object mentah (dari `@Query() query`) menjadi GridQueryParams yang tervalidasi. */
export function parseGridQuery(query: Record<string, unknown>): GridQueryParams {
  const page = Math.max(1, parseInt(String(query.page ?? '1'), 10) || 1);
  const size = Math.min(
    MAX_PAGE_SIZE,
    Math.max(1, parseInt(String(query.size ?? DEFAULT_PAGE_SIZE), 10) || DEFAULT_PAGE_SIZE),
  );

  const searchRaw = typeof query.search === 'string' ? query.search.trim() : '';
  const search = searchRaw ? searchRaw : undefined;

  const sortRaw = typeof query.sort === 'string' ? query.sort : '';
  const sort = sortRaw.includes(':') ? sortRaw : undefined;

  // Express (lewat `qs`, query parser default-nya) sudah mem-parse
  // `filter[key]=value` di URL jadi objek nested `query.filter = { key: value }`
  // sebelum sampai ke sini.
  const filter: Record<string, string> = {};
  if (query.filter && typeof query.filter === 'object' && !Array.isArray(query.filter)) {
    for (const [key, value] of Object.entries(query.filter as Record<string, unknown>)) {
      if (typeof value === 'string' && value.trim()) {
        filter[key] = value.trim();
      }
    }
  }

  // Fallback: tetap dukung literal `"filter[key]"` sebagai key mentah kalau
  // suatu saat dipanggil lewat query parser lain yang tidak nested-kan bracket
  // notation — tidak menggantikan case di atas, cuma jaring pengaman tambahan.
  for (const key of Object.keys(query)) {
    const match = key.match(/^filter\[(.+)\]$/);
    const value = query[key];
    if (match && typeof value === 'string' && value.trim()) {
      filter[match[1]] = value.trim();
    }
  }

  return { page, size, search, sort, filter };
}

/**
 * Terapkan `skip`/`take`/`orderBy` (dari `sort`) ke query builder yang sudah
 * di-`where()`/`andWhere()` oleh caller (search & filter spesifik per
 * entitas ditangani caller, karena kolom yang valid beda-beda per tabel),
 * lalu eksekusi & bungkus jadi `GridResult`.
 */
export async function paginateQueryBuilder<T>(
  qb: SelectQueryBuilder<T>,
  params: GridQueryParams,
  alias: string,
  sortableColumns: string[] = [],
  defaultSort?: string,
): Promise<GridResult<T>> {
  const sortSpec = params.sort ?? defaultSort;
  if (sortSpec) {
    const [column, direction] = sortSpec.split(':');
    if (sortableColumns.includes(column)) {
      qb.orderBy(`${alias}.${column}`, direction?.toUpperCase() === 'ASC' ? 'ASC' : 'DESC');
    }
  }

  qb.skip((params.page - 1) * params.size).take(params.size);

  const [data, totalItems] = await qb.getManyAndCount();

  return {
    data,
    meta: {
      totalItems,
      itemCount: data.length,
      itemsPerPage: params.size,
      totalPages: Math.max(1, Math.ceil(totalItems / params.size)),
      currentPage: params.page,
    },
  };
}
