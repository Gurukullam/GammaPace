# ⚡ GammaPace — Master Implementation & Tracking Document

> **PURPOSE OF THIS FILE**
> This is the single source of truth for the GammaPace project. It records the architecture,
> the exact fixes already applied, every data endpoint, deployment procedures, and a live
> status tracker. When this file is shared with a developer (or AI assistant), it should
> contain *everything* needed to understand the current state and safely resume work.
>
> **HOW TO USE**
> - Whenever we implement or debug something, update the **Status / Tracker** section.
> - Re-read this file first whenever resuming work.
> - Keep the "Key facts" exact — they are the assumptions everything else is built on.

---

## 1. Project Overview

**GammaPace** is a NASDAQ market-data platform that:
1. Serves **static HTML frontends** from **GitHub Pages**.
2. Fetches free **NASDAQ API** data server-to-server through a **Vercel serverless proxy**
   (the browser cannot call `api.nasdaq.com` directly because of CORS + no-auth restrictions).
3. Persists the fetched data into **Supabase** (PostgreSQL) via the browser anon key, and
   lets the user **download each dataset as CSV**.

**Local working copy (repo root):**
`c:\Users\chandran\Desktop\PI\04_GuruKullam\GammaPace (Phase II)\Ticker Project\MVP9(Gammapace connect )\GammaPace-main`

**Live deployment:** `Gurukullam/GammaPace` -> GitHub Pages -> `www.gammapace.com` (`CNAME`).

---

## 2. Architecture (End-to-End Data Flow)

```
+-----------------+      POST /api/nasdaq-proxy       +---------------------------+
|  Browser (HTML) |  --->  { path: "/api/quote/..." } |  Vercel serverless fn      |
|  file:// or     |        [CORS: * ]                 |  api/nasdaq-proxy.js       |
|  GitHub Pages   |  <---  NASDAQ JSON (rCode 200)    |  fetches api.nasdaq.com    |
+-----------------+                                   +-------------+-------------+
        |                                                           |
        |  upsert / insert (anon key, data-state dedupe)            |  server-to-server
        v                                                           v
+-----------------------------------+                       +---------------------+
|  Supabase (PostgreSQL)           |   <------------------- |  NASDAQ API          |
|  musho.../ppdm... projects       |                       |  api.nasdaq.com      |
|  Tables per endpoint             |                       |  (free, no auth)     |
+-----------------------------------+                       +---------------------+
        |
        v
   CSV download (client-side Blob generation -> browser save)
```

**Three key layers:**
| Layer | Where | Auth |
|-------|-------|------|
| **Backend proxy** | Vercel project `nasdaq-historical-api` | No auth (public) |
| **NASDAQ data** | `api.nasdaq.com` | Free, no key |
| **Persistence (Bridge)** | Supabase project (per page) | Browser **anon key** (`sb_publishable_...`) |

> **Critical CORS note (fixed 2026-08-25):** The Nasdaq proxy previously only allowed a
> hard-coded allowlist (`gurukullam.github.io`, `localhost:3000`, `127.0.0.1:5500`).
> Opening the HTML from **`file://`** sends `Origin: null`, which was NOT allowed -> the
> browser blocked every response as **`Failed to fetch`**. This was the root cause of the
> reported errors. Fix detailed in section 4.

---

## 3. Repo Layout (relevant paths)

```
GammaPace-main/
├── CNAME                       -> www.gammapace.com (GitHub Pages custom domain)
├── GammaPace.MD                -> THIS file
├── index.html                  -> root/home page
├── deploy-global-investing.ps1 -> GitHub Pages deploy script (Global Investing + index)
├── .github/workflows/deploy.yml-> GitHub Actions Pages deploy
│
├── Global Investing/
│   ├── backend/                <- the Vercel proxy source (deploy separately to Vercel)
│   │   └── api/nasdaq-proxy.js <- **** THE CORS-FIXED PROXY ****
│   ├── MarketTradingData.html      -> Market & Trading Data page   (Bridge: musho...)
│   ├── CompanyFundamentalData.html -> Company Fundamental page     (Bridge: ppdm...)
│   ├── index.html / Intraday.html / MarketMoversAdvanced.html / MarketMoversDollarVol.html
│   └── MVP3_MVP4_MVP8_Alpha_One.md  -> older detailed design doc
│
└── Backend-Setup/  &  VercelDeploymentSetup/   -> older Stripe backends (NOT the nasdaq proxy)
```

> WARNING: Do **not** confuse the folders `Backend-Setup/` and `VercelDeploymentSetup/` with
> the actual Nasdaq proxy. Those are **Stripe** backends. The Nasdaq proxy lives ONLY in
> `Global Investing/backend/api/nasdaq-proxy.js` and deploys to the `nasdaq-historical-api`
> Vercel project.

---

## 4. Backend Proxy - THE CORS FIX (IMPORTANT)

**File:** `Global Investing/backend/api/nasdaq-proxy.js`

**Problem (original):** strict origin allowlist -> `file://` (`Origin: null`) blocked.

**Fix applied (2026-08-25):** replaced the allowlist gate with unconditional `*`:

```js
// CORS headers - public, unauthenticated data proxy -> allow any origin.
res.setHeader('Access-Control-Allow-Origin', '*');
res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

if (req.method === 'OPTIONS') { return res.status(200).end(); }
if (req.method !== 'POST')    { return res.status(405).json({ error: 'Method not allowed. Use POST.' }); }

const { path } = req.body;
if (!path) { return res.status(400).json({ error: 'Missing path in request body' }); }
const url = `https://api.nasdaq.com${path}`;
// fetch(url, { headers: { Accept:'application/json', User-Agent:'Mozilla/5.0 ...' } })
//   returns res.status(200).json(data)   |  fetchRes.status on error
```

**Why safe:** the endpoint is public, unauthenticated, uses no cookies/credentials ->
`Access-Control-Allow-Origin: *` is correct and safe.

**Deployment (does NOT go through Git):** this folder is a standalone Vercel project.
```
cd "Global Investing\backend"
vercel --prod          # if first time: vercel login once
```
Live URL: `https://nasdaq-historical-api.vercel.app`  (also a raw
`nasdaq-historical-<hash>-<project>.vercel.app`).

**Verify the live CORS fix (should show `Access-Control-Allow-Origin: *`):**
```
curl -s -i -X OPTIONS "https://nasdaq-historical-api.vercel.app/api/nasdaq-proxy" -H "Origin: null"
```

---

## 5. Data Endpoints (verified working through the proxy -> rCode 200)

> All of these were live-tested 2026-08-25 against the deployed proxy and returned real data.

### 5a. MarketTradingData.html - `Global Investing/MarketTradingData.html`
**Bridge** (Settings -> Bridge): `https://mushchoxbywxcpfmgavj.supabase.co`

| # | Endpoint id   | NASDAQ path (via proxy)                                  | Target table             |
|---|---------------|----------------------------------------------------------|--------------------------|
| 1 | market_movers | `/api/marketmovers`                                      | 10 x `nasdaq_movers_*`   |
| 2 | chart         | `/api/quote/{sym}/chart?assetclass=stocks&charttype=rs`  | `nasdaq_chart`           |
| 3 | realtime_trades | `/api/quote/{sym}/realtime-trades`                     | `nasdaq_realtime_trades` |
| 4 | screener      | `/api/screener/stocks?...exchange=nasdaq`                | `nasdaq_stocks` (~4,145) |
| 5 | basic_quotes  | `/api/quote/basic?symbol={sym}|stocks`                   | `nasdaq_basic_quotes`    |
| 6 | quotes        | `/api/quote/{sym}/info?assetclass=stocks`                | `nasdaq_quotes`          |
| 7 | historical    | `/api/quote/{sym}/historical?...`                        | `nasdaq_historical`      |
| 8 | summary       | `/api/quote/{sym}/summary?assetclass=stocks`             | `nasdaq_summary`         |
| 9 | option_chain  | `/api/quote/{sym}/option-chain?assetclass=stocks`        | `nasdaq_option_chain`    |

Movers tables (insert-only snapshots, no unique keys -> plain `insert`):
`nasdaq_movers_stock_activity / _advanced / _declined / _dollarvol / _nasdaq100`,
`nasdaq_movers_etf_activity / _advanced / _declined`, `nasdaq_movers_funds_advanced / _declined`.

Each per-symbol endpoint has **mode chips**: `ALL NASDAQ` / `Single Symbol` /
`Gamma IntraDay` / `Gamma LongTerm` (Gamma modes scope to `gammapace_intraday` /
`gammapace_longterm` symbol lists).

### 5b. CompanyFundamentalData.html - `Global Investing/CompanyFundamentalData.html`
**Bridge** (Settings -> Bridge): `https://ppdmhmrmmwnbvnfilcdh.supabase.co`

| # | Endpoint id   | NASDAQ path via proxy                                  | Target table(s) |
|---|---------------|--------------------------------------------------------|-----------------|
| 1 | news            | `/api/news/topic/articlebysymbol?q={sym}|STOCKS&limit=10` | `nasdaq_news` |
| 2 | symbol_dividends| `/api/quote/{sym}/dividends?assetclass=stocks`         | `nasdaq_symbol_dividends` |
| 3 | dividends       | `/api/calendar/dividends?date=YYYY-MM-DD` (loop 1..N days) | `nasdaq_dividends` |
| 4 | earnings        | `/api/analyst/{sym}/earnings-forecast`                 | `earnings_quarterly_forecast`, `earnings_yearly_forecast` |
| 5 | earnings_surprise | `/api/company/{sym}/earnings-surprise`               | `earnings_surprise` |
| 6 | financials      | `/api/company/{sym}/financials?frequency=1`            | `yearly_income_statement`, `yearly_balance_sheet`, `yearly_cash_flow`, `yearly_financial_ratios` |
| 7 | quarterly_financials | `/api/company/{sym}/financials?frequency=2`        | `quarterly_*` (4 tables) |
| 8 | insider_trades  | `/api/company/{sym}/insider-trades`                    | `nasdaq_insider_trades` |
| 9 | institutional_holdings | `/api/company/{sym}/institutional-holdings`      | `nasdaq_institutional_holdings` |
| 10| ipos            | `/api/ipo/calendar`                                    | `nasdaq_ipos` |

### 5c. Shared lookup used for bulk modes
- `getScreenerSymbols()` - pulls the full NASDAQ symbol list from the screener (cached per session).
- `getGammaPaceSymbols(table)` - reads `symbol` from `gammapace_intraday` / `gammapace_longterm`
  (auto-initializes Supabase from Settings; DISTINCT-safe).

---

## 6. Persistence / Dedupe Model (Supabase)

- Every row is stamped with `load_date` (US/Eastern `YYYY-MM-DD`) and a `load_timestamp`
  (unique ISO, **metadata only - never in a UNIQUE key**).
- Tables use **factual data-state dedupe** via `ON CONFLICT ... DO NOTHING
  (ignoreDuplicates)` on the real source columns. Identical re-loads SKIP; any data change appends.
- **Conflict keys (Market page):** `symbol,timestamp` (chart); `symbol,date` (historical);
  `symbol,last_sale,...` (screener); etc. See `insertToSupabase()` in each page.
- **Company page** has a **legacy fallback**: if the factual `ON CONFLICT` target doesn't
  exist yet (pre-migration), it retries on a legacy key
  (e.g. `symbol,ex_date,load_date`) and logs a warning - so loads never hard-fail on
  missing constraints. It also strips a `load_timestamp` column from payloads if the table
  lacks it (`PGRST204` -> drop column -> retry).

### Required per **Supabase project** for full end-to-end load + CSV:
1. **Valid anon key** (`sb_publishable_...`) entered in that page's Settings.
   (As of last check the Security Key field was **empty** -> pages would stop at
   "Please configure ... Security Key".)
2. **Tables created** with the exact columns above (from the `supabase_*.sql` scripts).
3. **UNIQUE constraints** matching each insert's `onConflict` (or rely on legacy fallback).
4. **RLS disabled or anon write access** for that project.

> Successful end-to-end was observed on the **Market page (musho... project)** before
> the CORS issue - `nasdaq_chart: 1000 rows ... Downloaded 1 file(s)`. So Market load+CSV
> is expected to work once the fetch is unblocked (CORS fixed) + Security Key entered.

---

## 7. GammaPace Recommends (Admin IntraDay & LongTerm)

- Admin password: **`191`** (unlock via the lock icon in Settings).
- Tables: `gammapace_intraday` / `gammapace_intraday_hist`,
  `gammapace_longterm` / `gammapace_longterm_hist` (symbol = PK).
- `Add` upserts symbol list; `Active` reads symbols into the text area;
  `DB Reset` archives active -> `_hist` then deletes.
- `Gamma_engine` (Intraday) and `Gamma_engine_hist` (LongTerm) fetch a dynamic SQL
  string from `gammapace_internal_mapping` (`sno=4` Intraday, `sno=5` LongTerm) and
  execute it via the Postgres function **`execute_dynamic_sql(query)`**
  (create with `supabase_gamma_engine.sql`). They then reload the symbol list.
- `gammapace_internal_mapping` columns used: `sql`, `title`, `sno`.

---

## 8. Known Issues / Open Items (Tracker)

> UPDATE THIS TABLE whenever something changes. This is the resume-point for the next session.

| # | Status | Item | Details / TODO |
|---|--------|------|----------------|
| 1 | DONE | CORS "Failed to fetch" | Fixed `nasdaq-proxy.js` -> `*` origin; **redeployed** to Vercel. Verified live (`Origin: null` returns `ACAO: *`). |
| 2 | TODO | Security Key(s) in Settings | Both pages need a valid anon key per their project. Enter in each page's Settings before Load/CSV. |
| 3 | BUG (HARD CODED) | IPO fields empty | `loadIPOs()` reads wrong field names. API returns `proposedTickerSymbol`, `proposedExchange`, `proposedSharePrice`, `sharesOffered`, `pricedDate`/`filedDate` - NOT `symbol`/`market`/`price`/`shares`/`expectedDate`. Location: `CompanyFundamentalData.html` -> `loadIPOs()`. **Fix pending.** |
| 4 | VERIFY | Market page end-to-end | Re-test all 9 endpoints after CORS deploy + key. `nasdaq_stocks` screener ~4,145 rows; single-symbol chart/realtime/summary/option-chain is quickest to validate. |
| 5 | VERIFY | Company page end-to-end | Re-test all 10 endpoints. Confirm every target table exists + constraints + RLS in the `ppdm...` project. |
| 6 | NOTE | Two separate Supabase projects | Market = musho... project; Company = ppdm project. Keys/tables/RLS differ per project. |
| 7 | INFO | Gamma engine SQLs | `INTRADAY_ENGINE_SQLS` / `LONGTERM_ENGINE_SQLS` arrays (Market page, older code) are empty extension points; the newer flow uses `gammapace_internal_mapping` + `execute_dynamic_sql`. |

---

## 9. Deployment Procedures

### A. Backend Proxy -> Vercel (Nasdaq)
```
cd "Global Investing\backend"
vercel --prod
# first time: vercel login
# answer 'n' to the CLI upgrade prompt (does not affect deploy)
```

### B. Frontend -> GitHub Pages (via the deploy script)
`deploy-global-investing.ps1` overlays `"Global Investing"` + `index.html` into the
`Gurukullam/GammaPace` repo (GitHub Pages rebuild in ~60-90 s). It validates the change
set before committing. Dry-run without `-Commit`; add `-Commit` to actually push:
```
powershell -File deploy-global-investing.ps1 -Commit
```
(Alternative: the GitHub Actions workflow `.github/workflows/deploy.yml` auto-deploys on
push to `main`.)

> WARNING: The Vercel backend is deployed **independently** (not through Git). After editing
> `nasdaq-proxy.js`, you MUST run `vercel --prod` again to make it live.

---

## 10. Quick Reference Commands

Set the root for PowerShell:
```powershell
$root = 'c:\Users\chandran\Desktop\PI\04_GuruKullam\GammaPace (Phase II)\Ticker Project\MVP9(Gammapace connect )\GammaPace-main'
```

Test the live proxy (no file writes - safe anywhere):
```powershell
curl.exe -s --max-time 40 -X POST "https://nasdaq-historical-api.vercel.app/api/nasdaq-proxy" -H "Content-Type: application/json" -d "{\"path\":\"/api/quote/AAPL/summary?assetclass=stocks\"}"
```

Check the live CORS header:
```powershell
curl.exe -s -i -X OPTIONS "https://nasdaq-historical-api.vercel.app/api/nasdaq-proxy" -H "Origin: null"
```

---

## 11. How to Resume (for the next developer/AI)

1. Read **this file** from top to bottom.
2. Confirm the backend is live: run 10 proxy test -> expect `rCode:200` + real data, and
   the CORS check returns `Access-Control-Allow-Origin: *`.
3. Check **Status / Tracker** (8) - pick up the first `TODO` / `BUG` item (e.g. the IPO
   field-mapping fix, or verifying end-to-end on each page).
4. When you make/verify a change, **update 8** here so the file always reflects reality.