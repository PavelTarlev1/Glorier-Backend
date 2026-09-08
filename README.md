# Navlo backend

REST API for [Navlo](https://navlo-frontend.onrender.com) — a road-freight rate
calculator built for Glorier's spedition/sales teams. This repo is the API +
database layer only; the UI lives in the separate
[`Glorier-FrontEnd`](https://github.com/PavelTarlev1/Glorier-FrontEnd) repo.

## What this service does

- Serves `rates.json` — a one-time, pre-aggregated summary of the anonymized
  TMS export provided for this task (782 usable shipment records after
  cleaning). This is the actual pricing data; see **Data & methodology** below.
- Stores and retrieves saved calculations (`/api/calculations`), shared across
  whoever uses the tool — not per-browser local storage.
- Proxies city geocoding (`/api/geocode`) to Nominatim/OpenStreetMap, so the
  map can place a picked city precisely instead of only a country centroid.

The backend does **not** compute prices — the pricing formula itself runs
client-side (see the frontend's `calc.ts`); this service only serves the raw
rate data it's calculated from, plus storage for saved quotes.

## Running locally

Requires Node 22+.

```bash
npm install
cp .env.example .env   # fill in TURSO_DATABASE_URL / TURSO_AUTH_TOKEN
npm run dev             # http://localhost:4000, auto-restarts on change
```

`npm start` runs the same thing without the file-watcher (used in production).
The backend runs `.ts` directly via [`tsx`](https://github.com/privatenumber/tsx) —
no separate build/compile step; `npm run typecheck` checks types separately.

### Database

Data lives in [Turso](https://turso.tech) (hosted libSQL/SQLite) — free tier,
no card required, genuinely persistent (not tied to this service's own
uptime). Create your own dev database with the Turso CLI:

```bash
turso db create navlo-db
turso db show navlo-db          # -> TURSO_DATABASE_URL
turso db tokens create navlo-db # -> TURSO_AUTH_TOKEN
```

The `calculations` table is created automatically on first connect
(`db.ts`'s `migrate()`) — no manual schema setup.

## REST API

| Method | Path | Description |
|---|---|---|
| GET | `/api/rates` | the reference rates computed from the provided TMS data |
| GET | `/api/geocode?q=` | proxies Nominatim; `{lat, lon}` or `null` |
| GET | `/api/calculations` | last 50 saved calculations; `?q=` searches by route/city/company |
| POST | `/api/calculations` | save a calculation |
| DELETE | `/api/calculations/:id` | delete a saved calculation |
| GET | `/api/health` | `{ok: true}` liveness check |

### Saving is currently disabled

`DISABLE_DB_WRITES=true` (set as a Render env var, not in code) makes
`POST`/`DELETE` on `/api/calculations` return `403`, while `GET` still works.
This is a deliberate, easily-reversible switch — flip the env var (or remove
it) and redeploy to re-enable saving; no code change needed.

## Data & methodology

Source: the anonymized TMS export provided for this task
(`Glorier_TMS_Merged_Anonymized.xlsx`, 889 rows) — whether the underlying
records are Glorier's actual historical shipments or representative sample
data generated for the exercise wasn't specified, so this README doesn't
assume either way; the methodology below holds regardless.
`backend/data/rates.json` is a **one-time** aggregation of that file,
generated once with Python (`openpyxl` + median aggregation) — not
regenerated on every server start. If the source data changes, the
aggregation script needs to be re-run and `rates.json` replaced.

**Cleaning applied**: removed cancelled records, trips under 30km or over
5000km (unrealistic/bad data), prices ≤0 or >€20,000, price/km ratios above 6
(entry errors), and one record with an impossible date (a month in the future
— an obvious `2027`/`2026` typo in the source). 889 rows → **782 usable**.

**Aggregation**: for each fallback level (exact route+category → route-only →
category-only → overall), the served figure is the **median** €/km — not the
arithmetic mean, which spot-checking showed was heavily skewed by a handful
of outlier records — with a 20th–80th percentile range instead of min/max, so
the range isn't set by one extreme row.

A given relation can have a genuinely different price in each direction in
this dataset (e.g. DE→IT and IT→DE often differ by 30%+) — consistent with a
real-world pattern (backhaul/lane economics) rather than a bug, so the
fallback chain preserves it instead of averaging it away.

## Deployment

Deployed on [Render](https://render.com) (free web service tier, no card
required) via Docker — see `render.yaml` and `Dockerfile`. Render auto-deploys
on every push to `main` through its own GitHub integration; `.github/workflows/ci.yml`
only runs `npm run typecheck` as a gate, it doesn't deploy anything itself.

Free-tier tradeoff: the service spins down after ~15 minutes idle and takes
roughly 50 seconds to wake on the next request — the database (Turso) is
unaffected either way, since it's a separate always-on service.

## Project history

This backend originally used Node's built-in `node:sqlite` with a local file —
simple for a single-process demo, but real persistence hosting either needs a
paid disk or resets on every cold start on most free tiers. It was migrated to
Turso (hosted, network-reached, still SQLite-compatible) so the data survives
restarts and redeploys without needing a card anywhere in the stack. It was
also originally deployed on Fly.io; that trial-based free tier expired
mid-project and started requiring a payment method, so deployment moved to
Render, whose free tier is genuinely card-free.
