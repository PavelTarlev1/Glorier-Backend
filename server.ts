import express, { type Request, type Response } from 'express';
import cors from 'cors';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
import db, { getRates, ready } from './db.ts';
import type { Row } from '@libsql/client';
import type { CalculationRow } from './types.ts';

/** Turns a libSQL Row (array-like, but also indexable by column name) into a
 *  plain object — so it serializes to JSON exactly like the old
 *  better-sqlite3-style rows the frontend already expects. */
function rowToObject<T>(columns: string[], row: Row): T {
  return Object.fromEntries(columns.map((c) => [c, row[c]])) as T;
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 4000;

/* ---------------------------------------------------------------------- */
/* Reference rate data (read-only, derived from the anonymized TMS export) */
/* ---------------------------------------------------------------------- */
app.get('/api/rates', (_req: Request, res: Response) => {
  res.json(getRates());
});

/* ---------------------------------------------------------------------- */
/* Geocoding — proxies Nominatim (OpenStreetMap) server-side so the map can  */
/* place a picked city precisely instead of falling back to the country's   */
/* centroid. Server-side because Nominatim's usage policy wants a real      */
/* identifying User-Agent and light rate limiting, not raw browser calls.   */
/* ---------------------------------------------------------------------- */
const geocodeCache = new Map<string, { lat: number; lon: number } | null>();

app.get('/api/geocode', async (req: Request, res: Response) => {
  const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
  if (!q) return res.status(400).json({ error: 'missing q' });

  if (geocodeCache.has(q)) return res.json(geocodeCache.get(q));

  try {
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=1`;
    const r = await fetch(url, { headers: { 'User-Agent': 'Navlo-transport-calculator/1.0 (interview prototype)' } });
    const data = (await r.json()) as { lat: string; lon: string }[];
    const hit = data[0] ? { lat: parseFloat(data[0].lat), lon: parseFloat(data[0].lon) } : null;
    geocodeCache.set(q, hit);
    res.json(hit);
  } catch {
    res.json(null);
  }
});

/* ---------------------------------------------------------------------- */
/* Calculations — saved price estimates, shared across whoever uses the   */
/* tool (persisted server-side, not per-browser localStorage)             */
/* ---------------------------------------------------------------------- */
app.get('/api/calculations', async (req: Request, res: Response) => {
  const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
  let rs;
  if (!q) {
    rs = await db.execute('SELECT * FROM calculations ORDER BY created_at DESC LIMIT 50');
  } else {
    // Search across route codes, cities and companies — covers "who is this
    // shipment for" lookups, not just route/date browsing.
    const like = `%${q}%`;
    rs = await db.execute({
      sql: `SELECT * FROM calculations
            WHERE lc LIKE ? OR uc LIKE ? OR city_from LIKE ? OR city_to LIKE ? OR company_from LIKE ? OR company_to LIKE ?
            ORDER BY created_at DESC LIMIT 50`,
      args: [like, like, like, like, like, like],
    });
  }
  res.json(rs.rows.map((r) => rowToObject(rs.columns, r)));
});

const REQUIRED_CALC_FIELDS = ['lc', 'uc', 'cat', 'distance', 'pricePerKm', 'priceAvg', 'priceLo', 'priceHi', 'total', 'confidence', 'sampleSize'] as const;

app.post('/api/calculations', async (req: Request, res: Response) => {
  const c = req.body || {};
  for (const key of REQUIRED_CALC_FIELDS) {
    if (c[key] === undefined || c[key] === null) {
      return res.status(400).json({ error: `missing field: ${key}` });
    }
  }
  const now = new Date().toISOString();
  const transitType = c.transitType === 'own' ? 'own' : 'sold';
  const info = await db.execute({
    sql: `INSERT INTO calculations
          (lc, uc, cat, city_from, city_to, post_from, post_to, company_from, company_to, transit_type, ship_date, ship_time, arrival_date, arrival_time,
           distance, deviation_km, manual_distance_km, manual_price_avg, price_per_km, price_avg, price_lo, price_hi, empty_km, extra_cost, toll_cost, bridge_cost, ferry_cost, customs_cost, weight_kg, tail_lift, service_tags, total, confidence, sample_size, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      c.lc, c.uc, c.cat, c.cityFrom || '', c.cityTo || '', c.postFrom || '', c.postTo || '', c.companyFrom || '', c.companyTo || '',
      transitType, c.shipDate || '', c.shipTime || '', c.arrivalDate || '', c.arrivalTime || '',
      c.distance, c.deviationKm || 0, c.manualDistanceKm || null, c.manualPriceAvg || null, c.pricePerKm, c.priceAvg, c.priceLo, c.priceHi,
      c.emptyKm || 0, c.extraCost || 0, c.tollCost || 0, c.bridgeCost || 0, c.ferryCost || 0, c.customsCost || 0, c.weightKg || 0,
      c.tailLift ? 1 : 0, Array.isArray(c.serviceTags) ? c.serviceTags.join(',') : '',
      c.total, c.confidence, c.sampleSize, now,
    ],
  });
  const sel = await db.execute({ sql: 'SELECT * FROM calculations WHERE id = ?', args: [Number(info.lastInsertRowid)] });
  const row = rowToObject<CalculationRow>(sel.columns, sel.rows[0]);
  res.status(201).json(row);
});

app.delete('/api/calculations/:id', async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const info = await db.execute({ sql: 'DELETE FROM calculations WHERE id = ?', args: [id] });
  if (info.rowsAffected === 0) return res.status(404).json({ error: 'calculation not found' });
  res.status(204).end();
});

app.get('/api/health', (_req: Request, res: Response) => res.json({ ok: true }));

/* ---------------------------------------------------------------------- */
/* Serve the built frontend (frontend/dist) in production — one process,  */
/* one URL, no separate static host needed. In dev the Vite dev server    */
/* handles the UI instead, so this is a no-op if dist/ doesn't exist yet. */
/* ---------------------------------------------------------------------- */
const FRONTEND_DIST = path.join(__dirname, '..', 'frontend', 'dist');
if (existsSync(FRONTEND_DIST)) {
  app.use(express.static(FRONTEND_DIST));
  app.get(/^(?!\/api).*/, (_req: Request, res: Response) => {
    res.sendFile(path.join(FRONTEND_DIST, 'index.html'));
  });
}

ready.then(() => {
  app.listen(PORT, () => {
    console.log(`Navlo API listening on http://localhost:${PORT}`);
  });
});
