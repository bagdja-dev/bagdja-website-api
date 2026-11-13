/**
 * Backfill sanitasi rich text untuk data yang tersimpan sebelum sanitasi saat simpan ada
 * (src/common/rich-text.ts). Mengubah DATA — default dry-run, hanya menghitung perubahan.
 *
 * Usage:
 *   npx ts-node scripts/sanitize-rich-text-backfill.ts            # dry-run
 *   npx ts-node scripts/sanitize-rich-text-backfill.ts --apply    # tulis perubahan (satu transaksi)
 *
 * Cakupan:
 * - website_products.description, website_products.detail      → profil `product`
 * - website_event_product_options.description                    → profil `basic`
 * - website_gathering_occurrences.option_groups_snapshot[].description → profil `basic`
 * - website_event_groups.invitation_description                 → profil `basic`
 */
import { setDefaultResultOrder } from 'node:dns';

import 'dotenv/config';
import { Client } from 'pg';

import { sanitizeRichText, type RichTextProfile } from '../src/common/rich-text';

setDefaultResultOrder('ipv4first');

type Change = { table: string; id: string; column: string };

async function main() {
  const apply = process.argv.includes('--apply');
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error('❌ DATABASE_URL is not set');
    process.exit(1);
  }
  const client = new Client({
    connectionString: databaseUrl,
    ssl: databaseUrl.includes('supabase') ? { rejectUnauthorized: false } : false,
  });
  await client.connect();
  const changes: Change[] = [];

  const clean = (value: string | null, profile: RichTextProfile) => sanitizeRichText(value, profile);

  try {
    if (apply) await client.query('BEGIN');

    const products = await client.query<{ id: string; description: string | null; detail: string | null }>(
      'SELECT id, description, detail FROM website_products WHERE description IS NOT NULL OR detail IS NOT NULL',
    );
    for (const row of products.rows) {
      for (const column of ['description', 'detail'] as const) {
        const next = clean(row[column], 'product');
        if (next !== row[column]) {
          changes.push({ table: 'website_products', id: row.id, column });
          if (apply) await client.query(`UPDATE website_products SET ${column} = $1 WHERE id = $2`, [next, row.id]);
        }
      }
    }

    const options = await client.query<{ id: string; description: string | null }>(
      'SELECT id, description FROM website_event_product_options WHERE description IS NOT NULL',
    );
    for (const row of options.rows) {
      const next = clean(row.description, 'basic');
      if (next !== row.description) {
        changes.push({ table: 'website_event_product_options', id: row.id, column: 'description' });
        if (apply) await client.query('UPDATE website_event_product_options SET description = $1 WHERE id = $2', [next, row.id]);
      }
    }

    const occurrences = await client.query<{ id: string; option_groups_snapshot: Array<Record<string, unknown>> | null }>(
      'SELECT id, option_groups_snapshot FROM website_gathering_occurrences WHERE option_groups_snapshot IS NOT NULL',
    );
    for (const row of occurrences.rows) {
      const snapshot = Array.isArray(row.option_groups_snapshot) ? row.option_groups_snapshot : [];
      let changed = false;
      const next = snapshot.map((option) => {
        const description = typeof option.description === 'string' ? option.description : null;
        const sanitized = clean(description, 'basic');
        if (sanitized === description) return option;
        changed = true;
        return { ...option, description: sanitized };
      });
      if (changed) {
        changes.push({ table: 'website_gathering_occurrences', id: row.id, column: 'option_groups_snapshot' });
        if (apply) {
          await client.query('UPDATE website_gathering_occurrences SET option_groups_snapshot = $1::jsonb WHERE id = $2', [JSON.stringify(next), row.id]);
        }
      }
    }

    const groups = await client.query<{ id: string; invitation_description: string | null }>(
      'SELECT id, invitation_description FROM website_event_groups WHERE invitation_description IS NOT NULL',
    );
    for (const row of groups.rows) {
      const next = clean(row.invitation_description, 'basic');
      if (next !== row.invitation_description) {
        changes.push({ table: 'website_event_groups', id: row.id, column: 'invitation_description' });
        if (apply) await client.query('UPDATE website_event_groups SET invitation_description = $1 WHERE id = $2', [next, row.id]);
      }
    }

    if (apply) await client.query('COMMIT');

    const summary = changes.reduce<Record<string, number>>((acc, change) => {
      const label = `${change.table}.${change.column}`;
      acc[label] = (acc[label] ?? 0) + 1;
      return acc;
    }, {});
    console.log(apply ? '✅ Diterapkan:' : '🔎 Dry-run (tidak ada yang ditulis). Akan berubah:');
    console.table(summary);
    if (!apply && changes.length) console.log('Jalankan ulang dengan --apply untuk menulis perubahan.');
  } catch (error) {
    if (apply) await client.query('ROLLBACK');
    throw error;
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error('❌ Backfill gagal:', error);
  process.exit(1);
});
