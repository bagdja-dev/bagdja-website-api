/**
 * Jalankan SQL migration file ke database.
 * Usage: npx ts-node scripts/run-migration.ts
 */
import 'dotenv/config';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { Client } from 'pg';
import { setDefaultResultOrder } from 'node:dns';

setDefaultResultOrder('ipv4first');

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error('❌ DATABASE_URL is not set');
    process.exit(1);
  }

  const isSupabase = databaseUrl.includes('supabase');
  const client = new Client({
    connectionString: databaseUrl,
    ssl: isSupabase ? { rejectUnauthorized: false } : false,
  });

  try {
    await client.connect();
    console.log('✅ Connected to database');

    const migrationsDir = join(__dirname, '..', 'supabase', 'migrations');
    const migrationFiles = readdirSync(migrationsDir)
      .filter((f) => f.endsWith('.sql'))
      .sort();

    for (const file of migrationFiles) {
      console.log(`⏳ Running migration: ${file}`);
      const sql = readFileSync(join(migrationsDir, file), 'utf-8');
      await client.query(sql);
      console.log(`✅ ${file} completed`);
    }

    const seedFile = join(__dirname, '..', 'supabase', 'seed.sql');
    const seedSql = readFileSync(seedFile, 'utf-8');

    console.log('⏳ Running seed data...');
    await client.query(seedSql);
    console.log('✅ Seed data inserted successfully');
  } catch (err) {
    console.error('❌ Error:', err);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();
