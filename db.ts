// Database layer for Navlo — Turso (hosted libSQL, SQLite-compatible), so the
// data genuinely persists with no server-local disk and no payment method
// required (unlike a self-hosted SQLite file on most free hosting tiers, which
// either needs a paid persistent disk or resets on every cold start).
import 'dotenv/config';
import { createClient, type Client } from '@libsql/client';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import type { RatesData } from './types.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RATES_PATH = path.join(__dirname, 'data', 'rates.json');

const url = process.env.TURSO_DATABASE_URL;
const authToken = process.env.TURSO_AUTH_TOKEN;
if (!url) throw new Error('TURSO_DATABASE_URL is not set — see .env.example');

const db: Client = createClient({ url, authToken });

async function migrate() {
  await db.execute(`
    CREATE TABLE IF NOT EXISTS calculations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      lc TEXT NOT NULL,
      uc TEXT NOT NULL,
      cat TEXT NOT NULL,
      city_from TEXT DEFAULT '',
      city_to TEXT DEFAULT '',
      post_from TEXT DEFAULT '',
      post_to TEXT DEFAULT '',
      company_from TEXT DEFAULT '',
      company_to TEXT DEFAULT '',
      transit_type TEXT NOT NULL DEFAULT 'sold' CHECK(transit_type IN ('own','sold')),
      ship_date TEXT DEFAULT '',
      ship_time TEXT DEFAULT '',
      arrival_date TEXT DEFAULT '',
      arrival_time TEXT DEFAULT '',
      distance REAL NOT NULL,
      deviation_km REAL DEFAULT 0,
      manual_distance_km REAL,
      manual_price_avg REAL,
      price_per_km REAL NOT NULL,
      price_avg REAL NOT NULL,
      price_lo REAL NOT NULL,
      price_hi REAL NOT NULL,
      empty_km REAL DEFAULT 0,
      extra_cost REAL DEFAULT 0,
      toll_cost REAL DEFAULT 0,
      bridge_cost REAL DEFAULT 0,
      ferry_cost REAL DEFAULT 0,
      customs_cost REAL DEFAULT 0,
      weight_kg REAL DEFAULT 0,
      tail_lift INTEGER DEFAULT 0,
      service_tags TEXT DEFAULT '',
      total REAL NOT NULL,
      confidence TEXT NOT NULL,
      sample_size INTEGER NOT NULL,
      created_at TEXT NOT NULL
    );
  `);
}

// migrate() must finish before any request touches the DB — awaited once at
// startup (see server.ts) rather than raced on the first request.
export const ready = migrate();

export default db;

// Rate/history reference data is read-only reference material derived from the
// TMS export — served straight from the pre-aggregated JSON rather than
// duplicated into tables, since it never changes at runtime.
let rates: RatesData | null = null;
export function getRates(): RatesData {
  if (!rates) {
    if (!existsSync(RATES_PATH)) throw new Error('rates.json missing in backend/data/');
    rates = JSON.parse(readFileSync(RATES_PATH, 'utf-8')) as RatesData;
  }
  return rates;
}
