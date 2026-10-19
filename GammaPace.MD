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
│   ├──  Intraday_Trend.html  -> stored-SQL report (sno=6 -> trend_analysis)
│   ├──  Intraday_Inception.html  -> stored-SQL report (sno=10 -> inception_stock_intraday)
│   ├──  Intraday_Steady_Growth_Stocks.html -> REST paged report (nasdaq_chart)
│   ├──  setup_run_mapping_sqls.sql  -> installs/repairs run_mapping_sql()  (RUN ONCE)
│   ├──  setup_inception_pipeline_lock_fix.sql -> lock_timeout + advisory lock + indexes
│   └── MVP3_MVP4_MVP8_Alpha_One.md  -> older detailed design doc
│
└── Backend-Setup/  &  VercelDeploymentSetup/   -> older Stripe backends (NOT the nasdaq proxy)
```

> WARNING: Do **not** confuse the folders `Backend-Setup/` and `VercelDeploymentSetup/` with
> the actual Nasdaq proxy. Those are **Stripe** backends. The Nasdaq proxy lives ONLY in
> `Global Investing/backend/api/nasdaq-proxy.js` and deploys to the `nasdaq-historical-api`
> Vercel project.

---

### 3b. Stored-SQL Report Pages (the `run_mapping_sql` family)

Two report pages do **not** call the Nasdaq proxy. They read a SQL *script* out of
`gammapace_internal_mapping` and have Postgres execute it:

| Page | sno | title | Result table |
|------|-----|-------|---------------|
| `Intraday_Trend.html` | 6 | `Intraday Trend Analyis` | `trend_analysis` |
| `Intraday_Inception.html` | 10 | `Intraday Inception stocks` | `inception_stock_intraday` |

Other sno values are not reports: `4`/`7` = Gamma_engine (Intraday symbols),
`5` = Gamma_engine_hist (LongTerm symbols), `8` = Time Now (smoke test),
`9` = `Intraday Trend Quote Analyis`, `999` = `GP_DIAG_LOCKS` (pipeline diagnostics).

**Flow:** `GET gammapace_internal_mapping?sno=eq.N` -> derive the table/columns/keywords
from the script text (nothing is hard-coded) -> `POST /rest/v1/rpc/run_mapping_sql
{p_title, p_sno}` (runs the whole script in ONE transaction) -> **read the result table
over PostgREST** -> render the chart + table.

> **The RPC is a TRIGGER, not a row source.** The deployed `run_mapping_sql()` returns
> `[]` for every sno (see tracker #10), so both pages read the result table instead
> (`readResultTable()`). `setup_run_mapping_sqls.sql` repairs the RPC server-side.

**Two cadences per page** (identical design on both):
| Cadence | What | Default |
|---------|------|---------|
| Read | `GET` the result table (~0.5s, 10 rows) | every `REFRESH_INTERVAL_MS` = 3s |
| ETL | the RPC that TRUNCATEs + rebuilds that table | every `PIPELINE_MIN_GAP_MS` = 60s, one tab at a time |

Cross-tab coordination uses two `localStorage` keys per report:
`gammapace_<report>_pipeline_lease` (single-flight, ~7 min TTL) and
`gammapace_<report>_pipeline_last_run` (the shared 60s gap - without it, releasing the
lease let the next tab re-fire the ETL immediately, which is what flooded the DB).

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
**Bridge** (Settings -> Bridge): `https://mushchoxbywxcpfmgavj.supabase.co`
(migrated 2026-09-07 from the DNS-dead `ppdmhmrmmwnbvnfilcdh` project; publishable key ships pre-filled in Settings)

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

#### Timestamp Convention (ENFORCED — all loaders)
- **`load_timestamp` is ALWAYS US New York (America/New_York) NASDAQ wall-clock time — never UTC.**
  Format: ISO 8601 `YYYY-MM-DDTHH:mm:ss.SSS±HH:MM` with milliseconds + the correct NY UTC offset
  (EDT `-04:00` / EST `-05:00`, computed dynamically incl. DST). Example: `2026-09-07T12:18:16.014-04:00`.
- Generated by `getUSLoadTimestamp()` in **both** `MarketTradingData.html` and
  `CompanyFundamentalData.html`; `insertToSupabase()` stamps every row before write.
- `load_date` = the NY calendar date (`YYYY-MM-DD`) from the same NY clock — CSV downloads
  query on it (`?load_date=eq.<today>`).
- Tables store `load_timestamp` as TEXT (the exact string round-trips; no server-side
  timezone conversion is applied).
- **Single exception:** GammaPace watchlist tables (`gammapace_intraday` / `gammapace_longterm`
  / `_hist`) intentionally use `load_date_utc` (UTC ISO via `getUTCTimestamp()`) — UTC is
  explicit in the column name.

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
- **Engine statement timeout (fixed 2026-09-07):** the anon role's default
  `statement_timeout` (~3s) cancelled engine SQL with `57014 canceling statement due to
  statement timeout`. Applied
  `ALTER FUNCTION public.execute_dynamic_sql(text) SET statement_timeout = '10min';`
  — a function-level override (transaction-local, pooling-safe); the anon role default
  is unchanged. Verified: `pg_sleep(8)` through the RPC returns `OK` in ~8.6s; both
  engine buttons complete successfully.
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
| 8 | DONE | Intermittent 57014 timeout on Intraday + Steady Growth reports | REST paging of nasdaq_chart (10 parallel pages) intermittently exceeded the anon role's ~3s statement_timeout -> HTTP 500 {"code":"57014"}. Fixed 2026-09-16 client-side in Intraday.html + Intraday_Steady_Growth_Stocks.html: PARALLEL_PAGES 10 -> 4 + per-page retry with backoff (4 attempts; retries 57014/500/network). Recommended server-side hardening (one-time, Supabase SQL Editor): CREATE INDEX IF NOT EXISTS idx_nasdaq_chart_timestamp ON public.nasdaq_chart (timestamp); ANALYZE public.nasdaq_chart; |
| 9 | DONE | 55P03 lock timeout on Intraday Inception (sno=10) | Report showed `Supabase RPC error: 500 {"code":"55P03","message":"canceling statement due to lock timeout"}` continuously at the 3s refresh. **Cause:** `run_mapping_sql(p_title,p_sno)` executes the WHOLE sno=10 script in ONE transaction; that script starts with `Truncate table inception_stock_intraday` (ACCESS EXCLUSIVE) while `setup_run_mapping_sqls.sql` sets `ALTER FUNCTION public.run_mapping_sql(text,integer) SET lock_timeout='10s'` -> any concurrent run (2nd tab / phone / Retry click) waits 10s and is cancelled. Measured 2026-09-28: error returned after 11.3s; `inception_stock_intraday_hist` shows 10 rows per successful run with 3s gaps (several clients driving the same ETL). **Client fix** (`Global Investing/Intraday_Inception.html`): cross-tab single-flight lease (`localStorage` key `gammapace_inception_pipeline_lease`, ~7-min TTL) so only one tab executes the pipeline; exponential back-off 3s->60s after 55P03/57014/TIMEOUT instead of re-firing every 3s; `AbortController` RPC timeout (330s); removed the useless direct result-table read (it held ACCESS SHARE on the TRUNCATEd table - making the lock timeout more likely - and could never succeed with the anon key: 57014 at ~3s). Note: the 3s tick is now a cheap READ of the result table; `PIPELINE_MIN_GAP_MS` (60000) throttles only the heavy ETL — set it to 0 to run the ETL on every tick, raise it to throttle further. **Server fix** (`Global Investing/setup_inception_pipeline_lock_fix.sql`, run once in the Supabase SQL Editor): raises `run_mapping_sql.lock_timeout` to 60s, prepends `SELECT pg_advisory_xact_lock(100010);` to the sno=10 script so concurrent runs queue instead of colliding, adds `idx_inception_stock_intraday_hist_ts`. NOTE: re-running `setup_run_mapping_sqls.sql` resets lock_timeout to 10s (re-run the fix after it). NOTE: the sno=10 script (`title='Intraday Inception stocks'`) also appends to `inception_stock_intraday_hist` (65,618 rows on 2026-09-28) and can UPDATE `gammapace_buy_sell_rules` (rank-1 auto-buy row) - both tables stay anon-unreadable/fast under RLS except `_hist` which the anon key can read. |
| 10 | DONE | Inception report rendered no chart and no table (blank page) | Root cause was **not** the lock timeout. `run_mapping_sql(p_title,p_sno)` executes the stored script correctly (verified 2026-09-28: the sno=10 run rewrote `inception_stock_intraday` with a fresh `analysis_timestamp` in 23-25s) but it returns **`[]` instead of the final SELECT's rows — for EVERY mapping row**, including sno=8 whose entire script is `select now();`. The page used that RPC response as its only row source, so `fetchInceptionData()` took its "pipeline returned 0 rows" branch and never called `updateChart`/`updateTable` -> the report stayed blank. The direct result-table read that would have worked had been removed in item 9 on the assumption it always died with 57014. **Fix (client, `Global Investing/Intraday_Inception.html`):** the RPC is now only a *trigger*; the rows are read from the result table over PostgREST by the new `readResultTable()` (measured HTTP 200, 10 rows, ~1.8 kB, 0.46s with the anon key) and an empty RPC payload is no longer treated as an error. Also in the same patch: the 3s tick is now a cheap READ while the ~25s ETL runs at most once per `PIPELINE_MIN_GAP_MS` (60s) in one tab; the read is skipped while another tab owns the pipeline lease so it can never fight the pipeline `TRUNCATE`; the 60s gap is stamped in `localStorage` (`gammapace_inception_pipeline_last_run`) so releasing the lease no longer lets the next tab immediately re-fire the ETL; an ETL failure is now a non-fatal warning while the table still holds rows (last good data stays on screen); and `analysis_timestamp` is no longer double-shifted by `new Date()` + `toLocaleTimeString()` (the stored New York wall-clock is shown verbatim) with a new `dataAgeSeconds()` reporting "Ns ago". Verified with a Node harness running the page's own functions against the live backend: 10 rows -> 10 chart bars, 8 `<th>`, 10 `<tr>`, rank ascending, ETL tick 23.6s. **Server-side TODO:** `run_mapping_sql` still returns `[]` — fix it (or add an RPC that returns the final SELECT's rows) in the Supabase SQL Editor; the report no longer depends on it. **Affects `Intraday_Trend.html` too** (sno=6 calls the same RPC): its `trend_analysis` table is readable by the anon key but currently empty, and that page has none of the lease/back-off guards from item 9. |
| 11 | DONE | Intraday Trend (sno=6) had none of the item-9 guards and no working row source | `Intraday_Trend.html` calls the same `run_mapping_sql()` (so it also received `[]`) and its direct read was only a *fallback* that could never be reached, while the heavy ETL was re-fired every 3s from every tab with no lease, no back-off and no AbortController - `trend_analysis_hist` showed three runs stamped `16:00:16` (3 clients, one instant). **Fixed 2026-09-28** with the same architecture as item 10: new `readResultTable()` is the primary row source, the RPC is trigger-only, two cadences (3s read / 60s ETL), a cross-tab lease + shared last-run stamp, exponential back-off, a 120s AbortController timeout, SQLSTATE-specific errors (55P03/57014/40P01), a non-fatal pipeline warning while the table still has rows, and the `analysis_timestamp` double-shift fix. The empty-state message now names the real cause. Verified with a Node harness: read returns rows, the read gate arms, the lease is released after each tick, and a foreign lease is honoured. **NOTE:** `trend_analysis` was legitimately EMPTY at the time of the fix - traced to the stored SQL's own filters (`WHERE trend_signal IN (4 bullish signals)` plus `minute_count >= 178 AND max_gap_minutes <= 3` and `symbol IN (SELECT symbol FROM gammapace_intraday)`), not to the page. |
| 12 | DONE | `setup_run_mapping_sqls.sql` was missing; lock-fix file restored | `setup_run_mapping_sqls.sql` (which CREATES `run_mapping_sql()`) was cited by the pages, by the error messages and by tracker #9, but did not exist anywhere in the repo - so the DB could not be rebuilt from source, and the cause of #10 was not documented anywhere. Recreated under `Global Investing/`: adds `public.gp_split_statements(text)`, a state-machine splitter that ignores comments and respects single/double quotes and dollar-quoted bodies, then redefines `run_mapping_sql(text,integer)` to execute every statement in order and **return the final SELECT rows as jsonb** (the defect behind #10), with `lock_timeout=60s`, `statement_timeout=300s` and anon/authenticated grants. Idempotent, documented as "run once in the Supabase SQL Editor". **Not yet executed against the live database** - the pages work without it (they read the table directly), so it is optional server-side cleanup. **Correction:** `setup_inception_pipeline_lock_fix.sql` DID already exist in the GitHub repo (136 lines, incl. a security note that the anon key can WRITE `gammapace_internal_mapping`) - it was simply never present in the local working copy, so a local `*.sql` search wrongly concluded no `.sql` files existed. An over-eager rewrite was caught in the `deploy-global-investing.ps1` dry run (`M` not `A` in git status) and the original was restored verbatim, with only a new "6. ETL SCAN INDEXES" section appended. **Lesson: verify repo state with `git ls-tree -r HEAD -- "*.sql"` in the cloned repo, not a local filesystem search.** |
| 13 | DONE | Portfolio menu + Gammapace Intraday link (2026-10-18) | Added top-level `Portfolio` menu before `About` in `Global Investing/index.html` (same hover/click dropdown pattern as Gamma Report: `.portfolio-submenu`, `togglePortfolioSubmenu()`, `selectPortfolioOption()`; registered in `closeAllSubmenusGlobally()`). Submenu `Gammapace Intraday` links (relative, `target=_blank`) to `Global Investing/GammaPorfolio.html` (exact on-disk spelling). Deployed to `Gurukullam/GammaPace` prod via `deploy-global-investing.ps1 -Commit`. |
| 14 | DONE | GammaPortfolio (sno=11) showed old data despite backend changing (2026-10-19, round 1) | `Global Investing/GammaPorfolio.html` ran the FULL sno=11 pipeline (`run_mapping_sql` -> WITH + INSERT nasdaq_fluctuation + UPDATE buy_sell_rules + INSERT trade_snapshot + SELECT) on EVERY 3s tick from every tab, with no lease, no gap, no timeout, no back-off. Concurrent runs collided (55P03/57014/TIMEOUT) and the single `await runCanonicalSql()` failure skipped the table read, so the chart/table froze on old data. Fixed with the same two-cadence architecture as #10/#11: cheap 3s READ of `gammapace_trade_snapshot` (newest-first, 500 rows) every tick + heavy ETL at most every `PIPELINE_MIN_GAP_MS`=60s in one tab (localStorage lease `gammapace_portfolio_pipeline_lease` ~7-min TTL + shared `gammapace_portfolio_pipeline_last_run`), `AbortController` 120s RPC timeout, SQLSTATE-specific errors (55P03/57014/40P01/404/NETWORK/TIMEOUT), exponential back-off 3s->60s, non-fatal ETL warning while table holds rows (last-good stays on screen), RPC treated as trigger-only (deployed `run_mapping_sql` returns `[]`, tracker #10). First page load forces one pipeline run, then the schedule takes over; status bar shows `Last SQL pipeline run` + `data Ns old` + per-second age refresh. Verified with a Node harness against 500 live rows: 7 symbols -> 7 bars / 7 table rows, HIT/NEAR pills present, lease acquire/honour/release + backoff + pipeline gating all correct, syntax `node --check` clean. Deployed to `Gurukullam/GammaPace` prod via `deploy-global-investing.ps1 -Commit`. **User still saw old data after this — see #15 for the real root causes.** |
| 15 | DONE | GammaPortfolio still stale after #14 — full end-to-end fix (2026-10-19, round 2) | Complete live test of the whole chain exposed THREE real causes beyond #14's throttling: (a) **60s ETL throttle was wrong for this report** — user requires the ENTIRE SQL re-executed + table/graph repopulated on every tick since backend changes at high frequency. Measured sno=11 RPC at ~1.3-1.9s, 3 parallel runs all HTTP 200 — the INSERT-only script (no TRUNCATE) never blocks, so `PIPELINE_MIN_GAP_MS` set to **0** (ETL every 3s tick), lease TTL 7min->**30s**, RPC timeout 120s->**25s** (tick budget 3s); overlap serialised by short single-flight lease, loser does read-only tick. (b) **Snapshot copies a STALE price**: sno=11 `INSERT..SELECT` copies `r.current_price` verbatim from `gammapace_buy_sell_rules`, and nothing updates that price live (APA rule showed 49.31 while `nasdaq_chart` had 49.07-49.31 moving each minute). Added `syncLivePricesIntoRules()` (STEP 0 before every RPC): newest `nasdaq_chart` price per rule symbol PATCHed into rules (anon PATCH verified HTTP 200; no-op when unchanged), so report is self-healing. (c) **500-row newest-first read goes stale for quiet symbols**: one symbol writing every ~5s fills 500 rows in ~20min, so sold/quiet symbols vanish from the window while their MAX row is older. `fetchLatestSnapshotRows()` now seeds the symbol universe from live rules + sweep, then fetches each symbol's own MAX(timestamp) row (exact equivalent of canonical final SELECT) and merges with the newest-500 sweep. Verified with live harness: price sync + RPC (1.3s) + merged read 509 rows -> 9 symbols -> 9 bars / 9 table rows, lease acquire/honour/release OK. **CAVEAT (live data, not code): `gammapace_buy_sell_rules` was EMPTY at verify time** (APA rule present 10:02, gone by ~10:1x — the sno=11 DELETE rule `side='buy' AND now-last_trigger_ts>5min` deletes stale buy rows, plus the 10:13 WFF insert shows another writer is active). Empty rules -> snapshot INSERT selects 0 rows -> report correctly shows "No data available" until a position exists. Also noted: earlier debug PATCH set APA current_price 49.31 (chart showed 49.07-49.26 at the time); reverted in the same session. If report is empty, check rules table first — that is upstream data, not this page. Deployed to `Gurukullam/GammaPace` prod via `deploy-global-investing.ps1 -Commit`. |


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