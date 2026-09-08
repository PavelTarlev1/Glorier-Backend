// SQLite layer for Navlo — uses Node's built-in node:sqlite (Node 22+, experimental).
// No native module compilation needed: the DB file lives at backend/data/navlo.db
// and is created + seeded automatically on first run.
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import type { RatesData } from './types.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.join(__dirname, 'data', 'navlo.db');
const RATES_PATH = path.join(__dirname, 'data', 'rates.json');

const db = new DatabaseSync(DB_PATH);

db.exec(`
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

// Migration for databases created before these columns existed —
// ALTER TABLE ADD COLUMN is a no-op error if the column is already there.
for (const col of ['city_from', 'city_to', 'post_from', 'post_to', 'company_from', 'company_to', 'ship_date', 'ship_time', 'arrival_date', 'arrival_time', 'service_tags']) {
  try {
    db.exec(`ALTER TABLE calculations ADD COLUMN ${col} TEXT DEFAULT ''`);
  } catch {
    /* column already exists — fine */
  }
}
for (const col of ['toll_cost', 'deviation_km', 'bridge_cost', 'ferry_cost', 'customs_cost', 'weight_kg', 'tail_lift']) {
  try {
    db.exec(`ALTER TABLE calculations ADD COLUMN ${col} REAL DEFAULT 0`);
  } catch {
    /* column already exists — fine */
  }
}
try {
  db.exec(`ALTER TABLE calculations ADD COLUMN manual_distance_km REAL`);
} catch {
  /* column already exists — fine */
}
try {
  db.exec(`ALTER TABLE calculations ADD COLUMN manual_price_avg REAL`);
} catch {
  /* column already exists — fine */
}
try {
  db.exec(`ALTER TABLE calculations ADD COLUMN transit_type TEXT NOT NULL DEFAULT 'sold'`);
} catch {
  /* column already exists — fine */
}

// Fleet management was removed — drop the truck_id link column (a databases
// created before this change has it) and the trucks table itself, if present.
try {
  db.exec(`ALTER TABLE calculations DROP COLUMN truck_id`);
} catch {
  /* column doesn't exist, or this SQLite build can't drop it — harmless either way */
}
try {
  db.exec(`DROP TABLE IF EXISTS trucks`);
} catch {
  /* already gone */
}

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

export default db;
