# Alpha One — NASDAQ Market & Trading Data (MVP3)

## 1. Executive Summary

**Project:** NASDAQ Analysis AI — MVP3 (Market & Trading Data focus)  
**Current Version:** Alpha One **v1.0.18** (2026-08-24)  
**Status:** Implementation complete — 9 Market & Trading Data endpoints active, 22 Supabase tables (8 data + 10 movers + 4 GammaPace), frontend UI fully operational, CSV export active, admin lock active, 2-second Loop auto-reload active, GammaPace IntraDay/LongTerm watchlists fully functional (standalone, with inline status feedback and reset confirmation). All 7 per-symbol endpoints now support the full 4-mode system (ALL NASDAQ / Single Symbol / Gamma IntraDay / Gamma LongTerm).  
**Purpose:** Resume document. Read this file to understand the complete current state and the standard patterns to follow for all future work.  
**Supersedes:** MVP1 Alpha Seventeen — this is a slimmed-down variant that keeps only Market & Trading Data endpoints while preserving all Alpha Seventeen infrastructure (admin lock, Getting Started card, admin panel, 2-second Loop, admin-only Data Preview).

### 1.1 Current Endpoint Count
- **Total Endpoints:** 9 (all Market & Trading Data)
- **Active:** Market Movers, Chart Data, Realtime Trades, Stock Screener, Current Quote (Basic), Quote Info, Historical Prices, Quote Summary, Option Chain
- **Removed (10, not in MVP3):** IPO Calendar, Dividend Calendar, Yearly Financials, Quarterly Financials, Institutional Holdings, Earnings Forecast, Earnings Surprise, Company News, Symbol Dividends, Insider Trades
- **UI Features:** Admin lock (password `191`), Getting Started card, admin-only Load Database panel, Loop auto-reload (2s), admin-only Data Preview, per-endpoint CSV download, **4 modes per per-symbol endpoint** (ALL NASDAQ / Single Symbol / Gamma IntraDay / Gamma LongTerm), GammaPace admin watchlist panels with inline status lines and DB Reset confirmation popup

### 1.2 Key Improvements Over MVP1 Alpha Seventeen
- **Endpoint rationalization** — Only the 9 Market & Trading Data endpoints remain; 10 non-Market endpoints removed.
- **Factual data-state dedupe (v1.0.4/v1.0.5)** — Every data table dedupes on its REAL factual values (`UNIQUE NULLS NOT DISTINCT`, Postgres 15+). Identical re-loads SKIP; any data change appends a new row. `load_timestamp` is metadata only, never part of a uniqueness key.
- **Universal optimized insert (v1.0.5)** — `insertToSupabase()` uses 2,000-row batches for ALL tables (screener 2× concurrency, others 5×), stamps `load_date` + `load_timestamp` on every row, with row-by-row fallback on conflict.
- **Full-universe screener (v1.0.4)** — `limit=500000` single call with `&offset=` pagination safety net.
- **Realtime Trades fix (v1.0.5)** — Always emits one `topTable` summary snapshot row per symbol so the table fills 24/7 even though the free API returns `rows: []`.
- **Performance parity (v1.0.6)** — Chart/Realtime Trades/Basic Quotes at 10 concurrent/25ms; Summary/Historical at 8/40ms; Option Chain at 6/50ms; Basic Quotes uses direct property access (2-3× faster than deepFind).
- **GammaPace watchlists (v1.0.7/v1.0.8)** — Admin-only IntraDay/LongTerm sections with unquoted lowercase tables, inline status feedback, DB Reset confirmation popup, standalone Supabase auto-init, and actionable error hints.
- **All Alpha Seventeen features preserved** — Admin lock, Getting Started card, admin panel, 2s Loop, admin-only preview, Settings labels, CSV export, resume logic.

### 1.3 Version History Summary (details in Section 13)
| Version | Date | One-liner |
|---------|------|-----------|
| v1.0.0 | 2026-08-17 | Alpha One created from Alpha Seventeen; 6 endpoints kept |
| v1.0.1 | 2026-08-18 | + Chart Data endpoint |
| v1.0.2 | 2026-08-18 | + Realtime Trades endpoint |
| v1.0.3 | 2026-08-19 | + Market Movers endpoint (10 insert-only tables) |
| v1.0.4 | 2026-08-20 | Screener full universe + data-state dedupe |
| v1.0.5 | 2026-08-20 | Realtime Trades fix + universal dedupe + `supabase_all_tables.sql` |
| v1.0.6 | 2026-08-20 | Performance pass (concurrency parity, direct property access) |
| v1.0.7 | 2026-08-22 | GammaPace: unquoted tables, status lines, reset confirmation |
| v1.0.8 | 2026-08-22 | GammaPace buttons fixed: standalone auto-init + unmissable feedback + error hints |
| v1.0.9 | 2026-08-22 | GammaPace buttons no longer scroll to log panel |
| v1.0.10 | 2026-08-22 | GammaPace button labels renamed: Refresh → Active, Load → Add |
| v1.0.11 | 2026-08-23 | Current Quote (Basic) FIXED: new data.records[] API structure mapped; stray & removed |
| v1.0.12 | 2026-08-23 | Basic Quotes schema adjusted: dropped dead OHLC columns, added company_name/data_as_of/url/asset_class |
| v1.0.13 | 2026-08-23 | Realtime Trades attribute alignment: added as_of column (topTable.asOf) |
| v1.0.14 | 2026-08-23 | getGammaPaceSymbols() auto-init + getActiveModeForAPI() + CSV symbolFilter scoping |
| v1.0.15 | 2026-08-23 | Quote Info 4-mode support (ALL/Single/Gamma IntraDay/Gamma LongTerm) + DISTINCT safety |
| v1.0.16 | 2026-08-24 | DEPLOYMENT FIX: stale GitHub Pages build was the real "gamma not working" cause; both pages synced + end-to-end verified |
| v1.0.17 | 2026-08-24 | Gamma_engine button live: executes the sno=4 SQL from gammapace_internal_mapping via execute_dynamic_sql() + auto-refreshes symbols list |
| v1.0.18 | 2026-08-24 | Gamma_engine_hist button live: executes the sno=5 SQL from gammapace_internal_mapping + auto-refreshes LongTerm symbols list — both engines now table-driven |

---

## 2. Architecture

```
USER BROWSER
  GitHub Pages Frontend
  https://gurukullam.github.io/nasdaq-analysis-frontend/
    - Golden/brown glassmorphism theme
    - GaP master logo in fixed glass header
    - Mobile hamburger nav
    - Supabase JS client (browser-safe anon key)
    - Calls Vercel backend via POST /api/nasdaq-proxy
         |
         | POST (CORS-enabled)
         v
  Vercel Backend (Serverless Function)
  https://nasdaq-historical-api.vercel.app
    - Receives { path: "/api/..." }
    - Forwards to api.nasdaq.com (server-to-server, no CORS)
    - Returns JSON to frontend
         |
         | fetch() (no CORS issues)
         v
  NASDAQ Free API
  https://api.nasdaq.com
    - No API key required
    - Public endpoints used by nasdaq.com website itself
         |
         | Supabase JS client (direct, for upserts + GammaPace watchlists)
         v
  Supabase PostgreSQL
    - 22 tables: 8 data + 10 movers + 4 GammaPace
    - RLS disabled on all data tables
```

### 2.1 Live URLs
| Component | URL | Purpose |
|-----------|-----|---------|
| **Frontend (index)** | `https://gurukullam.github.io/nasdaq-analysis-frontend/` | Golden-theme UI — user-facing app |
| **Frontend (standalone)** | `https://gurukullam.github.io/nasdaq-analysis-frontend/MarketTradingData.html` | Same app served under its working filename — kept in sync with `index.html` (v1.0.16) |
| **Backend** | `https://nasdaq-historical-api.vercel.app` | API proxy — handles NASDAQ requests |
| **Supabase (Bridge)** | User-configured in Settings | PostgreSQL database |
| **NASDAQ API** | `https://api.nasdaq.com` | Free data source (no auth) |

> **IMPORTANT — Deploy BOTH pages:** the repo serves two identical copies of the app (`index.html` and `MarketTradingData.html`). Every deployment must copy the local MVP3 `MarketTradingData.html` to **both** repo filenames, otherwise one URL silently serves a stale build (this was the root cause of the "Gamma IntraDay not working" incident fixed in v1.0.16 — the live page was an old pre-gamma build while local code was correct). After deploying, hard-refresh (Ctrl+Shift+R) to bypass browser cache.

> **IMPORTANT — Bridge URL:** The Bridge (Supabase URL) is whatever is entered in the Settings panel at runtime. The HTML ships with a default value (`https://mushchoxbywxcpfmgavj.supabase.co`); older MD revisions referenced `ppdfbmrmmuhnvnfilcdh` / `ppdmhmrmmwnbvnfilcdh`. Always verify the actual project against `API_Keys.txt` (Section 2.2) and the Supabase dashboard. If GammaPace buttons report "table missing," the #1 cause is the Bridge URL pointing at a different project than the one where the tables were created.

### 2.2 Credentials (Stored Locally)
```
File: C:\Users\chandran\Desktop\PI\02_STOCKS\International Stocks\NASDAQ-Analysis-AI\NEW PROJECT\API_Keys.txt

SUPABASE_URL=<see file>
SUPABASE_SERVICE_KEY=sb_secret_...[REDACTED — never use in browser]
SUPABASE_ANON_KEY=sb_publishable_...[REDACTED — browser-safe]
NASDAQ_API_KEY=NOT REQUIRED

> Never commit API_Keys.txt to Git. It is stored outside the project folder.
```

### 2.3 GitHub Repositories
| Repo | URL | Contents |
|------|-----|----------|
| Frontend | `https://github.com/Gurukullam/nasdaq-analysis-frontend` | `index.html` + `MarketTradingData.html` (identical copies of the app), `deploy-frontend.bat`, `README.MD` |
| Backend | `https://vercel.com/sivachandran-ramachandrans-projects/nasdaq-historical-api` | Vercel project (not a Git repo) |

> Local working copy of the frontend is `MarketTradingData.html` in the MVP3 folder; it is copied/renamed to `index.html` in the frontend repo for deployment.

---

## 3. API Endpoints Reference

### 3.1 Active NASDAQ Endpoints (9 Total)

| # | ID | Endpoint | Description | Table(s) | Modes |
|---|----|----------|-------------|----------|-------|
| 1 | market_movers | `/api/marketmovers` | Top movers — Most Active, Most Advanced, Most Declined, Dollar Volume, Nasdaq-100 — for STOCKS, ETF, MUTUALFUNDS. **Multi-table (10 insert-only tables), single call** | `nasdaq_movers_*` (10) | Single |
| 2 | chart | `/api/quote/{symbol}/chart?assetclass=stocks&charttype=rs` | Intraday OHLCV price chart data (one point per minute) | `nasdaq_chart` | Single / ALL / Gamma IntraDay / Gamma LongTerm |
| 3 | realtime_trades | `/api/quote/{symbol}/realtime-trades` | Real-time trade records + topTable summary (updates every 30 seconds) | `nasdaq_realtime_trades` | Single / ALL / Gamma IntraDay / Gamma LongTerm |
| 4 | screener | `/api/screener/stocks?tableonly=true&limit=500000&exchange=nasdaq` | List all stocks with price, change, market cap — FULL UNIVERSE (one call, no truncation) | `nasdaq_stocks` | Single |
| 5 | basic_quotes | `/api/quote/basic?symbol={symbol}%7Cstocks` | Lightweight ticker: price, change, percent change, delta indicator, volume (may include open/high/low/previous_close during market hours) | `nasdaq_basic_quotes` | Single / ALL / Gamma IntraDay / Gamma LongTerm |
| 6 | quotes | `/api/quote/{symbol}/info?assetclass=stocks` | Detailed quote data for individual symbols | `nasdaq_quotes` | Single / ALL / Gamma IntraDay / Gamma LongTerm |
| 7 | historical | `/api/quote/{symbol}/historical?assetclass=stocks&fromdate=...&todate=...&limit=5000` | Daily OHLCV price history for a symbol (From/To date inputs in UI, default last 30 days) | `nasdaq_historical` | Single / ALL / Gamma IntraDay / Gamma LongTerm |
| 8 | summary | `/api/quote/{symbol}/summary?assetclass=stocks` | Key stats: sector, industry, market cap, volume, yield, bid/ask | `nasdaq_summary` | Single / ALL / Gamma IntraDay / Gamma LongTerm |
| 9 | option_chain | `/api/quote/{symbol}/option-chain?assetclass=stocks` | Options chain with calls and puts, strikes, bid/ask, volume, open interest | `nasdaq_option_chain` | Single / ALL / Gamma IntraDay / Gamma LongTerm |

### 3.2 Removed Endpoints (10) — Not in MVP3
IPO Calendar, Dividend Calendar, Yearly Financials, Quarterly Financials, Institutional Holdings, Earnings Forecast, Earnings Surprise, Company News, Symbol Dividends, Insider Trades — all removed because they are not Market & Trading Data.

### 3.3 Mode Configuration (4 modes per per-symbol endpoint)
- **Single Symbol mode:** Fetches one symbol from the endpoint's symbol input (~1-3 seconds)
- **ALL NASDAQ mode:** Fetches all ~4,121 symbols from the cached screener list
- **Gamma IntraDay mode:** Fetches only symbols in the `gammapace_intraday` watchlist table
- **Gamma LongTerm mode:** Fetches only symbols in the `gammapace_longterm` watchlist table
- Gamma modes are **fully public** (no admin lock) — the chips sit in the public Available Data Sources section; CSV download buttons respect the selected mode.

**Mode variables in MarketTradingData.html** (values: `'all'`, `'single'`, `'gamma_intraday'`, `'gamma_longterm'`):
- `chartMode` — default `'single'`
- `realtimeTradesMode` — default `'single'`
- `basicQuotesMode` — default `'single'`
- `quotesMode` — default `'single'`
- `historicalMode` — default `'all'`
- `summaryMode` — default `'single'`
- `optionChainMode` — default `'single'`

**Current bulk-fetch concurrency (v1.0.6 parity):**
| Endpoint | Concurrency | Gap |
|----------|-------------|-----|
| Chart Data | 10 | 25ms |
| Realtime Trades | 10 | 25ms |
| Current Quote (Basic) | 10 | 25ms |
| Historical Prices | 8 | 40ms |
| Quote Summary | 8 | 40ms |
| Option Chain | 6 | 50ms |
| Quote Info | 5 | 80ms (+ 3× retry, resume every 20 symbols) |

`parallelFetchAll()` defaults (used when options omitted): concurrency 4, delayMs 150, logEvery 20.

---

## 4. Supabase Schema (22 Tables Total)

### 4.1 Data Tables (8) — Factual Data-State Unique Constraints

| # | Table | Key Columns | Insert Mode | Unique Constraint (factual values only — `NULLS NOT DISTINCT`) |
|---|-------|-------------|-------------|-------------------|
| 1 | `nasdaq_stocks` | symbol, name, last_sale, net_change, pct_change, market_cap, exchange, url, load_date, load_timestamp | UPSERT (data-state dedupe) | `(symbol, last_sale, net_change, pct_change, market_cap)` |
| 2 | `nasdaq_realtime_trades` | symbol, price, size, time_text, nls_volume, previous_close, today_high_low, fifty_two_week_range, as_of, load_date, load_timestamp | UPSERT (data-state dedupe) | `(symbol, nls_volume, previous_close, today_high_low, fifty_two_week_range)` |
| 3 | `nasdaq_basic_quotes` | symbol, company_name, last_sale_price, net_change, percentage_change, delta_indicator, volume, data_as_of, url, asset_class, load_date, load_timestamp | UPSERT (data-state dedupe) | `(symbol, last_sale_price, net_change, percentage_change, delta_indicator, volume)` |
| 4 | `nasdaq_quotes` | symbol, company_name, stock_type, exchange, is_nasdaq_listed, is_nasdaq_100, last_sale_price, net_change, percentage_change, volume, market_status, asset_class, delta_indicator, last_trade_timestamp, fifty_two_week_range, day_range, load_date, load_timestamp | UPSERT (data-state dedupe) | `(symbol, last_sale_price, net_change, percentage_change, volume, market_status, last_trade_timestamp, day_range)` |
| 5 | `nasdaq_summary` | symbol, exchange, sector, industry, one_year_target, today_high_low, share_volume, average_volume, previous_close, fifty_two_week_high_low, market_cap, annualized_dividend, ex_dividend_date, dividend_payment_date, yield, bid_size, ask_size, load_date, load_timestamp | UPSERT (data-state dedupe) | `(symbol, one_year_target, today_high_low, share_volume, average_volume, previous_close, fifty_two_week_high_low, market_cap, annualized_dividend, yield, bid_size, ask_size)` |
| 6 | `nasdaq_historical` | symbol, date, open, high, low, close, volume, load_date, load_timestamp | UPSERT | `(symbol, date)` |
| 7 | `nasdaq_option_chain` | symbol, expiry_date, strike, call_last, call_change, call_bid, call_ask, call_volume, call_open_interest, put_last, put_change, put_bid, put_ask, put_volume, put_open_interest, drill_down_url, load_date, load_timestamp | UPSERT (data-state dedupe) | `(symbol, expiry_date, strike, call_last, call_volume, put_last, put_volume)` |
| 8 | `nasdaq_chart` | symbol, timestamp, price, shares, previous_close, time_text, load_date, load_timestamp | UPSERT (ignoreDuplicates) | `(symbol, timestamp)` |

**IMPORTANT:** All uniqueness is based on REAL FACTUAL VALUES (`UNIQUE NULLS NOT DISTINCT` — Postgres 15+, treats NULLs as equal). `load_timestamp` is informational metadata only, NEVER part of a uniqueness key. Same-day re-loads with identical values SKIP; any data change appends a new row.

### 4.2 Market Movers Tables (10) — Insert-Only Snapshots
`nasdaq_movers_stock_activity`, `nasdaq_movers_stock_advanced`, `nasdaq_movers_stock_declined`, `nasdaq_movers_stock_dollarvol`, `nasdaq_movers_stock_nasdaq100`, `nasdaq_movers_etf_activity`, `nasdaq_movers_etf_advanced`, `nasdaq_movers_etf_declined`, `nasdaq_movers_funds_advanced`, `nasdaq_movers_funds_declined`

Each table: `id, symbol, name, last_sale_price, last_sale_change, change, delta_indicator, data_as_of, last_trade_timestamp, load_date` (+ created_at in SQL). **NO unique constraints → plain INSERT (append-only snapshots).** Every Loop cycle appends a fresh dated snapshot — history accumulates.

### 4.3 GammaPace Watchlist Tables (4) — Unquoted Lowercase Names (v1.0.7)
| Table | Purpose | Schema |
|-------|---------|--------|
| `gammapace_intraday` | Active IntraDay watchlist | `symbol VARCHAR(20) PRIMARY KEY, load_date_utc TIMESTAMPTZ NOT NULL DEFAULT now()` |
| `gammapace_intraday_hist` | Append-only archive | `id BIGSERIAL PK, symbol, load_date_utc, archived_at TIMESTAMPTZ NOT NULL DEFAULT now()` |
| `gammapace_longterm` | Active LongTerm watchlist | same as intraday active |
| `gammapace_longterm_hist` | Append-only archive | same as intraday hist |

> PostgreSQL lowercases unquoted identifiers — removing the quotes from `"GammaPace_Intraday"` produces the real name `gammapace_intraday`. The migration renames any old quoted tables WITHOUT losing data.

### 4.4 RLS Status
**RLS DISABLED** on all 22 tables (8 data + 10 movers + 4 GammaPace). If a GammaPace write fails with "row-level security" the table was created outside the SQL scripts — re-run them.

### 4.5 Required SQL Scripts — Run Once (in Supabase SQL Editor)
| Script | Creates/Manages |
|--------|-----------------|
| `supabase_all_tables.sql` | All 8 data tables — DROP + CREATE with `UNIQUE NULLS NOT DISTINCT` + `(load_date)`/`(symbol)` indexes |
| `supabase_market_movers.sql` | 10 movers insert-only tables + RLS disable |
| `supabase_nasdaq_stocks.sql` | `nasdaq_stocks` data-state schema (if not using all_tables) |
| `supabase_basic_quotes_update.sql` | v1.0.12 basic_quotes ALTER migration — drops dead OHLC columns, adds company_name/data_as_of/url/asset_class, rebuilds dedupe constraint (safe, preserves data) |
| `supabase_realtime_trades_update.sql` | v1.0.13 realtime_trades ALTER migration — adds `as_of` column (topTable.asOf; metadata only, not in dedupe constraint) (safe, preserves data) |
| `supabase_gammapace.sql` | GammaPace migration: RENAME quoted → lowercase + CREATE IF NOT EXISTS + RLS disable (safe to re-run) |

All scripts end with `NOTIFY pgrst, 'reload schema';`

---

## 5. JavaScript Functions Reference (v1.0.9)

### 5.1 Core Utilities
- `getUSLoadDate()` — US Eastern date, format YYYY-MM-DD
- `getUSLoadDateDisplay()` — Formatted US Eastern date for badges/logs
- `getUSLoadTimestamp()` — US NASDAQ wall-clock ISO 8601 with milliseconds + offset (e.g. `2026-08-20T19:20:27.463-04:00`); stamped on every row as metadata
- `getUTCTimestamp()` — `new Date().toISOString()` (UTC) — used by GammaPace watchlist writes
- `log(msg, type)` — Timestamped colored logging; auto-scrolls; keeps log in view if `active-log` class present
- `setProgress(pct, label)` — Progress bar update
- `scrollToLog()` / `focusLog()` — Scroll log into view with golden glow (`active-log` class)

### 5.2 State Variables
- `selectedAPIs` — Set of selected endpoint IDs (default: `{'screener'}`)
- `supabaseClient` — Initialized Supabase client (null until `initSupabase()` succeeds)
- `isLoading`, `cancelRequested` — Load operation flags
- `selectedExchange` — `'nasdaq'` (default; UI hidden), `quoteCount` — `'ALL'` (default; UI hidden)
- `screenerSymbolsCache` — Session cache of NASDAQ symbols
- `historicalMode='all'`, `summaryMode/optionChainMode/basicQuotesMode/chartMode/realtimeTradesMode/quotesMode='single'` — per-endpoint modes
- `autoReloadEnabled`, `autoReloadTimeout` — Loop auto-reload state
- `isAdminUnlocked` — Admin lock state (default false; resets on refresh)
- `pendingGammaReset` — `'intraday'` | `'longterm'` | null — pending DB Reset confirmation

### 5.3 Admin Lock System
**UI Element:** Lock icon (🔒) in Settings panel card header. **Password:** `191` (hardcoded in `checkAdminPassword()`).

**Behavior:**
- **Locked (default):** Loop toggle has `locked` CSS class (non-interactive). Data Preview suppressed. Admin Panel AND GammaPace panels hidden.
- **Unlocked:** Loop toggle interactive, Data Preview renders, Admin Panel + GammaPace panels shown.
- **Re-locking:** Re-engages lock, stops auto-reload, clears timeout, hides panels.
- **Not persisted** — refreshing the page resets to locked (by design).

```javascript
function toggleAdminLock() {
  if (isAdminUnlocked) {
    isAdminUnlocked = false;
    autoReloadEnabled = false;
    if (autoReloadTimeout) { clearTimeout(autoReloadTimeout); autoReloadTimeout = null; }
    const toggle = document.getElementById('autoReloadToggle');
    if (toggle) { toggle.classList.remove('active'); toggle.classList.add('locked'); }
    const lockBtn = document.getElementById('adminLockBtn');
    if (lockBtn) { lockBtn.textContent = '🔒'; lockBtn.title = 'Admin Lock'; }
    const adminPanel = document.getElementById('adminPanel');
    if (adminPanel) adminPanel.style.display = 'none';
    const gammaPacePanel = document.getElementById('gammaPacePanel');
    if (gammaPacePanel) gammaPacePanel.style.display = 'none';
    log('Admin lock engaged. Loop toggle disabled.', 'info');
  } else {
    document.getElementById('adminModal').style.display = 'flex';
    document.getElementById('adminPassword').value = '';
    setTimeout(() => document.getElementById('adminPassword').focus(), 100);
  }
}

function checkAdminPassword() {
  const input = document.getElementById('adminPassword');
  if (input.value === '191') {
    isAdminUnlocked = true;
    const toggle = document.getElementById('autoReloadToggle');
    if (toggle) toggle.classList.remove('locked');
    const lockBtn = document.getElementById('adminLockBtn');
    if (lockBtn) { lockBtn.textContent = '🔓'; lockBtn.title = 'Admin Unlock'; }
    const adminPanel = document.getElementById('adminPanel');
    if (adminPanel) adminPanel.style.display = 'block';
    const gammaPacePanel = document.getElementById('gammaPacePanel');
    if (gammaPacePanel) gammaPacePanel.style.display = 'block';
    closeAdminModal();
    log('Admin unlocked. Loop toggle is now enabled.', 'success');
  } else {
    log('Incorrect password. Access denied.', 'error');
    input.value = '';
    input.style.borderColor = 'var(--error)';
    setTimeout(() => input.style.borderColor = '', 1000);
  }
}
```

### 5.4 Mode System (per per-symbol endpoint)
- `MODE_LABELS = { all: 'ALL NASDAQ', single: 'Single Symbol', gamma_intraday: 'Gamma IntraDay', gamma_longterm: 'Gamma LongTerm' }`
- Seven selectors: `selectChartMode`, `selectRealtimeTradesMode`, `selectBasicQuotesMode`, `selectQuotesMode`, `selectHistoricalMode`, `selectSummaryMode`, `selectOptionChainMode` — each sets its mode variable, re-renders `discoverAPIs()`, and logs the label.
- Mode chips (4 per endpoint) render inline in `discoverAPIs()`; the Single Symbol input is shown only in single mode; Historical also shows From/To date inputs (default: last 30 days → today).

### 5.5 Data Loaders

| Function | Purpose | Modes | Concurrency |
|----------|---------|-------|-------------|
| `loadMarketMovers()` | ONE call → 10 insert-only groups. Loops `MOVER_TABLES` (STOCKS/ETF/MUTUALFUNDS × category), maps rows `{symbol, name, lastSalePrice, lastSaleChange, change, deltaIndicator}` + category-level `dataAsOf`, `lastTradeTimestamp`. Returns `[{table, rows}]`. | Single | — (1 call) |
| `loadScreener()` | ONE call fetches FULL universe (`limit=500000`) with `&offset=` pagination safety until `totalrecords` reached. | Single | — (1 call) |
| `loadBasicQuotes()` | Lightweight ticker — **data.records[] structure** (v1.0.12): ticker[0]→symbol, ticker[1]→company_name, lastSale/change/pctChange/deltaIndicator/volume + envelope date/url/assetclass. Legacy flat-shape fallback retained (metadata omitted). | Single / ALL / Gamma×2 | 10 / 25ms |
| `loadQuotes()` | Quote Info — v1.0.15 4-mode support: Single fetches one symbol; ALL uses today's `nasdaq_stocks` symbols (deduped, market_cap order, resume every 20 via localStorage); Gamma IntraDay/LongTerm use `getGammaPaceSymbols()`. 3× retry per symbol. | Single / ALL / Gamma×2 | 5 / 80ms |
| `loadHistorical()` | Daily OHLCV with From/To dates (`limit=5000`/symbol). Normalizes `tradesTable`/`historical`/array roots. | Single / ALL / Gamma×2 | 8 / 40ms |
| `loadSummary()` | Maps `summaryData` + `bidAsk`; `cleanText()` converts "N/A" → null. | Single / ALL / Gamma×2 | 8 / 40ms |
| `loadOptionChain()` | Parses `data.table.rows` with `expirygroup` headers; `parseExpiryDate()` handles "Aug 14", "Aug 14, 2026", M/D/YYYY. | Single / ALL / Gamma×2 | 6 / 50ms |
| `loadChart()` | Intraday points `{x,y,w,z}` → `symbol, timestamp (epoch ms), price, shares, previous_close, time_text`. deepFind fallback. | Single / ALL / Gamma×2 | 10 / 25ms |
| `loadRealtimeTrades()` | Trade rows + topTable summary + `as_of` (topTable.asOf); **always emits ≥1 summary snapshot row per symbol** (v1.0.5 fix). Full attribute alignment (v1.0.13) — every meaningful endpoint field maps to a column. | Single / ALL / Gamma×2 | 10 / 25ms |

All bulk modes go through `parallelFetchAll(symbols, fetchFn, {concurrency, delayMs, label, onProgress, logEvery})` — generic worker with cancel support, per-symbol error logging (first 5 failures), and throttled progress.

### 5.6 Value Cleaning Helpers
- `cleanText()` — strips whitespace, "N/A" → null
- `toISODate()` — M/D/YYYY → YYYY-MM-DD (also accepts already-ISO)
- `toBigInt()` — strips `$`/`,` then parseInt; null for empty/`--`
- `toPrice()` — strips `$`/`,` then parseFloat; null for empty/`--`
- `parseExpiryDate()` — "Aug 14" (current/next year), "Aug 14, 2026", M/D/YYYY fallback
- `parseSymbolList(text)` — splits on `,`, trims, uppercases, filters empties (GammaPace)
- `escapeCSV(val)` — RFC 4180 escaping

### 5.7 ⭐ STANDARD PATTERN FOR ALL FUTURE ENDPOINTS (Extraction + Loading)

**This is the canonical template. Every new per-symbol endpoint MUST follow it exactly.**

#### A) Extraction — fast direct access with deepFind fallback (v1.0.6 standard)

```javascript
const fetchSymbolX = async (symbol) => {
  const path = `/api/quote/${symbol}/xxx?assetclass=stocks`;
  let json;
  try { json = await fetchNasdaq(path); }
  catch (e) { log(`X [${symbol}]: fetch error — ${e.message}`, 'warn'); return []; }
  if (!json) { log(`X [${symbol}]: empty response`, 'warn'); return []; }

  // 1. Defensive root extraction — try wrapped, unwrapped, and array responses
  let d = json?.data;
  if (!d && json?.symbol) d = json;                                // unwrapped flat response
  if (!d && Array.isArray(json) && json.length > 0) d = json[0];   // array response
  if (!d || typeof d !== 'object') { log(`X [${symbol}]: no data`, 'warn'); return []; }

  // 2. FAST PATH — direct property access on the known response root (2-3× faster)
  const f = (...keys) => {
    for (const k of keys) {
      const v = d[k];
      if (v !== undefined && v !== null && v !== '') return v;
    }
    return undefined;
  };

  // 3. FALLBACK — deepFind only where the structure is genuinely unknown
  const deepFind = (obj, keys) => { /* recursive tree search, see loadChart() */ };

  const result = {
    symbol: cleanText(f('symbol', 'Symbol', 'SYMBOL')) || symbol,
    // multi-key fallbacks: camelCase, snake_case, TitleCase, abbreviations
    some_field: toPrice(f('someKey', 'some_key', 'SomeKey')),
  };
  return [result];   // or a row array for multi-row endpoints (chart, options, historical)
};
```

**Key principles:**
1. **Never assume response structure** — NASDAQ may wrap in `data`, return flat, or return arrays
2. **Direct property access first** (known roots) — deepFind only as fallback (performance)
3. **Try every key variant** — camelCase, snake_case, TitleCase, abbreviations, synonyms
4. **Log diagnostics in single mode** — print available keys for rapid debugging
5. **Remove dead fields** once confirmed never populated; **keep speculative fields** (may populate during market hours) with a comment

#### B) Loading — unified bulk-mode section (copy verbatim into every per-symbol loader)

```javascript
// ── SINGLE SYMBOL MODE ──
if (xMode === 'single') {
  const symbolInput = document.getElementById('x-symbol');
  const symbol = (symbolInput?.value || 'AAPL').toString().trim().toUpperCase();
  log(`Starting: X for ${symbol}`);
  try { /* fetch + return rows */ } catch (err) { log(...); return []; }
}

// ── BULK MODES: ALL NASDAQ / Gamma IntraDay / Gamma LongTerm ──
let symbols = [];
let modeLabel = 'ALL NASDAQ';
if (xMode === 'gamma_intraday') {
  modeLabel = 'GammaPace IntraDay';
  try { symbols = await getGammaPaceSymbols('gammapace_intraday'); }
  catch (e) { log(`X: Failed to fetch GammaPace IntraDay symbols — ${e.message}`, 'error'); return []; }
} else if (xMode === 'gamma_longterm') {
  modeLabel = 'GammaPace LongTerm';
  try { symbols = await getGammaPaceSymbols('gammapace_longterm'); }
  catch (e) { log(`X: Failed to fetch GammaPace LongTerm symbols — ${e.message}`, 'error'); return []; }
} else {
  try { symbols = await getScreenerSymbols(); }
  catch (e) { log(`X: Failed to fetch symbol list — ${e.message}`, 'error'); return []; }
}
if (symbols.length === 0) { log(`X: No symbols found for ${modeLabel}`, 'warn'); return []; }

log(`Starting: X for ${symbols.length} ${modeLabel} symbols · N concurrent · Mms gap`);
const allRows = [];
const { successCount, failCount } = await parallelFetchAll(
  symbols,
  async (symbol) => { const rows = await fetchSymbolX(symbol); if (rows.length) { allRows.push(...rows); return rows; } return []; },
  { concurrency: N, delayMs: M, label: 'X', onProgress: (p, t, ok) => setProgress(...) }
);
log(`X: ${allRows.length} rows from ${successCount} symbols (${failCount} failed)`);
return allRows;
```

#### C) New-endpoint wiring checklist (15 steps)
1. Add endpoint to `NASDAQ_ENDPOINTS` array (id, name, path, description, table, status)
2. Add mode variable: `let xMode = 'single';  // 'all' | 'single' | 'gamma_intraday' | 'gamma_longterm'`
3. Add mode selector `selectXMode(el)` using `MODE_LABELS`
4. Add input HTML in `discoverAPIs()`: symbol input + **4 mode chips** (ALL NASDAQ / Single Symbol / Gamma IntraDay / Gamma LongTerm)
5. Implement `loadX()` per the template above (Section 5.7 A + B)
6. Add handler in `startLoading()` dispatch switch
7. Add handler in `fetchAndUpsertAPI()` dispatch switch
8. Add table to `getTablesForAPI()` mapping
9. Add conflict key in `insertToSupabase()` if the unique constraint differs (Section 5.11)
10. Add table to `updateStats()` tables array
11. Create SQL: table with factual `UNIQUE NULLS NOT DISTINCT` constraint + `DISABLE ROW LEVEL SECURITY` + `NOTIFY pgrst, 'reload schema'`
12. Test Single Symbol mode first — check diagnostic logs for available keys
13. Remove dead fields; keep speculative fields with documentation
14. Run SQL in Supabase, test ALL mode + both Gamma modes, verify CSV download
15. Update this MD: Sections 3.1, 4, 5.5, 6, 7, 13

### 5.8 CSV Export System
| Function | Purpose |
|----------|---------|
| `escapeCSV(val)` | RFC 4180 escaping (commas, quotes, newlines) |
| `generateCSVFiles(data, tableName, maxBytes)` | UTF-8 byte-measured splitting at 5 MB; returns `[{name, content}]` |
| `getTablesForAPI(apiId)` | endpoint → table(s) map (market_movers → all 10 movers tables) |
| `fetchAndUpsertAPI(api)` | Single-API replica of `startLoading()` dispatch |
| `downloadTableAsCSV(tableName, loadDate)` | Queries today's `load_date` rows, generates + downloads file(s) with 150ms stagger |
| `downloadAPI(apiId)` | Main entry: validates settings → initSupabase → focusLog → fetch+upsert → download each table |

### 5.9 CSV File Naming
`table_name_1_1.csv`, `table_name_1_2.csv`, … — the `_1_` segment is reserved for future batch/date numbering. Downloads are **today-only** (`load_date = getUSLoadDate()`).

### 5.10 Supabase Operations
| Function | Purpose |
|----------|---------|
| `initSupabase()` | Creates client from Settings Bridge + Security Key; logs + opens Settings on failure |
| `insertToSupabase(table, rows)` | Stamps `load_date` + `load_timestamp`; 2,000-row batches (screener 2× concurrency, others 5×); per-table conflict key + `ignoreDuplicates: true`; row-by-row fallback on conflict errors |
| `updateStats()` | Counts for **all 18 nasdaq_* tables** (10 movers + 8 data); null-guards DOM (stats bar hidden) |

### 5.11 Upsert / Insert Logic (Complete List) — v1.0.5
- `nasdaq_stocks` → `symbol,last_sale,net_change,pct_change,market_cap`
- `nasdaq_realtime_trades` → `symbol,nls_volume,previous_close,today_high_low,fifty_two_week_range`
- `nasdaq_basic_quotes` → `symbol,last_sale_price,net_change,percentage_change,delta_indicator,volume`
- `nasdaq_quotes` → `symbol,last_sale_price,net_change,percentage_change,volume,market_status,last_trade_timestamp,day_range`
- `nasdaq_summary` → `symbol,one_year_target,today_high_low,share_volume,average_volume,previous_close,fifty_two_week_high_low,market_cap,annualized_dividend,yield,bid_size,ask_size`
- `nasdaq_historical` → `symbol,date`
- `nasdaq_option_chain` → `symbol,expiry_date,strike,call_last,call_volume,put_last,put_volume`
- `nasdaq_chart` → `symbol,timestamp`
- All with `ignoreDuplicates: true`
- `nasdaq_movers_*` (10 tables) → plain `insert()` — no unique constraint, append-only snapshots
- `gammapace_*` → direct upsert/insert/delete in the gamma functions (not via `insertToSupabase`)

### 5.12 Loop Auto-Reload Mechanism
**UI:** Toggle switch next to Load Data, labeled "Loop". **Requires admin unlock.**

- **OFF:** Load Data runs `startLoading()` once.
- **ON:** after completion, if `autoReloadEnabled && !cancelRequested && selectedAPIs.size > 0` → logs and schedules `setTimeout(startLoading, 2000)`.
- **Cancel:** `cancelLoading()` sets `cancelRequested`, clears timeout, disables flag, resets toggle.
- The 2s delay is fixed (not rate-limiting); loop runs until Cancel or toggle OFF; each iteration re-fetches + re-upserts (idempotent dedupe).

```javascript
// At end of startLoading():
if (autoReloadEnabled && !cancelRequested && selectedAPIs.size > 0) {
  log('Auto-reload: next iteration in 2 seconds...', 'info');
  autoReloadTimeout = setTimeout(() => {
    if (autoReloadEnabled && !isLoading) startLoading();
  }, 2000);
}
```

### 5.13 Data Preview (Admin-Only)
`showPreview(title, rows)` returns immediately if `!isAdminUnlocked`; otherwise renders the first 10 rows in `#previewCard`. `clearPreview()` hides it.

---

## 6. Performance Benchmarks (v1.0.6 concurrency)

| Endpoint (ALL mode) | Fetch Time | Insert Time | Notes |
|----------|-----------|-------------|-------|
| Historical Prices | ~4 min | ~1-2 min | 8 concurrent / 40ms |
| Quote Summary | ~4 min | ~30 sec | 8 concurrent / 40ms |
| Option Chain | ~4 min | ~30 sec | 6 concurrent / 50ms |
| Chart Data | ~4 min | ~30 sec | 10 concurrent / 25ms; inserts only NEW minutes per loop |
| Realtime Trades | ~4 min | ~30 sec | 10 concurrent / 25ms; inserts only NEW trades/changes per loop |
| Current Quote (Basic) | ~4 min | ~30 sec | 10 concurrent / 25ms; direct property access |
| **Full pipeline (all APIs)** | **~25-35 min** | — | Alpha One baseline |

Gamma modes run the same mechanics on a much smaller symbol list (seconds instead of minutes).

---

## 7. Features (Current State)

### 7.1 Preserved from Alpha Seventeen
Admin lock (191) · Loop toggle admin-locked · Data Preview admin-only · Settings labels (Backend key / Bridge / Security Key) · Settings message ("Email GammaPace@outlook.com…") · auto-rendering API list (no Discover button) · hidden exchange/quote-count/resume UI (backend defaults: nasdaq / ALL / resume on) · admin-only Load Database panel · Getting Started card · title "NASDAQ Analysis AI — Market & Trading Data".

### 7.2 Added in Alpha One (v1.0.0 → v1.0.9)
- **9 Market & Trading Data endpoints** (see Section 3.1) with factual data-state dedupe
- **4-mode system** on all 6 per-symbol endpoints (ALL NASDAQ / Single / Gamma IntraDay / Gamma LongTerm) with public gamma chips
- **GammaPace Recommends** admin watchlists (Section 15) — standalone buttons, status lines, reset confirmation, error hints
- **Market Movers** multi-table insert-only snapshots
- **Historical From/To date range** inputs (default last 30 days)
- **CSV export** with 5 MB splitting, today-only queries
- **Loop auto-reload** (2s) with cancel safety

---

## 8. Current Quote (Basic) — Endpoint-Specific Documentation

### 8.1 What This Endpoint Returns (v1.0.11 — structure verified live 2026-08-23)
NASDAQ changed the response shape from a flat object to a `data.records[]` envelope:

```json
{"data":{"date":"Data as of Aug 20, 2026","records":[{
  "key":"AAPL|STOCKS","ticker":["AAPL","Apple Inc. Common Stock"],
  "lastSale":"$309.35","change":"-1.95","pctChange":"-0.63%",
  "deltaIndicator":"down","volume":"46,876,985",
  "url":"/market-activity/stocks/aapl","assetclass":"STOCKS"}]},
 "message":null,"status":{"rCode":200,"bCodeMessage":null}}
```

| DB Column | Source in response | Notes |
|-----------|--------------------|-------|
| `symbol` | `records[].ticker[0]` | fallback: text before `\|` in `records[].key` |
| `company_name` | `records[].ticker[1]` | e.g. "Apple Inc. Common Stock" |
| `last_sale_price` | `records[].lastSale` | `$`/`,` stripped → numeric |
| `net_change` | `records[].change` | numeric |
| `percentage_change` | `records[].pctChange` | `%` sign kept (e.g. `-0.63%`) |
| `delta_indicator` | `records[].deltaIndicator` | `up` / `down` |
| `volume` | `records[].volume` | commas stripped → integer |
| `data_as_of` | envelope `data.date` | e.g. "Data as of Aug 20, 2026" |
| `url` | `records[].url` | e.g. "/market-activity/stocks/aapl" |
| `asset_class` | `records[].assetclass` | e.g. "STOCKS" |

The legacy flat shape (`data.lastSalePrice` etc.) remains supported as a defensive fallback path inside `fetchSymbolBasic()` (metadata columns omitted there).

### 8.2 Fields NOT Stored (v1.0.12 schema)
- **Removed from the schema entirely (v1.0.12):** `open_price`, `high_price`, `low_price`, `previous_close` — never returned by the API; dropped via `supabase_basic_quotes_update.sql`.
- **Never provided by this endpoint (use Quote Info / Screener instead):** `stock_type`, `exchange`, `market_status`, `fifty_two_week_range`, `last_trade_timestamp`.
- The dedupe UNIQUE constraint and upsert conflict key now reference only real market values: `(symbol, last_sale_price, net_change, percentage_change, delta_indicator, volume)`.

### 8.3 Schema Migration — Run Once (`supabase_basic_quotes_update.sql`)
For an EXISTING table, run the safe data-preserving migration in Supabase SQL Editor:
```sql
ALTER TABLE nasdaq_basic_quotes DROP CONSTRAINT IF EXISTS unique_basic_quotes;
ALTER TABLE nasdaq_basic_quotes
  DROP COLUMN IF EXISTS open_price,
  DROP COLUMN IF EXISTS high_price,
  DROP COLUMN IF EXISTS low_price,
  DROP COLUMN IF EXISTS previous_close;
ALTER TABLE nasdaq_basic_quotes
  ADD COLUMN IF NOT EXISTS company_name VARCHAR(255),
  ADD COLUMN IF NOT EXISTS data_as_of VARCHAR(80),
  ADD COLUMN IF NOT EXISTS url TEXT,
  ADD COLUMN IF NOT EXISTS asset_class VARCHAR(20);
ALTER TABLE nasdaq_basic_quotes
  ADD CONSTRAINT unique_basic_quotes UNIQUE NULLS NOT DISTINCT
    (symbol, last_sale_price, net_change, percentage_change, delta_indicator, volume);
ALTER TABLE nasdaq_basic_quotes DISABLE ROW LEVEL SECURITY;
NOTIFY pgrst, 'reload schema';
```
Fresh installs already get this shape from `supabase_all_tables.sql`. Do NOT run the old metadata-drop SQL from earlier revisions — it would remove now-used columns.

### 8.4 Optional Cleanup of Legacy NULL Rows (pre-v1.0.11 junk)
Rows loaded before v1.0.11 carry NULLs in every value column except `symbol`. Optional one-time cleanup:
```sql
DELETE FROM nasdaq_basic_quotes
WHERE last_sale_price IS NULL AND net_change IS NULL
  AND percentage_change IS NULL AND delta_indicator IS NULL
  AND volume IS NULL;
```

---

## 9. Troubleshooting Guide

### 9.1 General
- Vercel dashboard for backend errors · Supabase Table Editor for data · browser console for frontend errors

### 9.2 Admin Lock
- Cannot toggle Loop / no Data Preview / no panels → unlock (🔒 → `191`). Lock state resets on refresh (by design). Password hardcoded — modify source to change.

### 9.3 Loop Auto-Reload
- Toggle not responding → unlock admin. Loop continues after Cancel → verify `cancelLoading()` clears timeout. Fires immediately after long loads → expected (fixed 2s). Background-tab throttling → keep tab active.

### 9.4 CSV Download
- "No data in table for YYYY-MM-DD" → upsert failed or zero rows; re-run Load. Multiple downloads blocked → allow pop-ups. Empty CSV → check `load_date` rows exist. Split count odd → UTF-8 byte measurement with special characters.

### 9.5 Current Quote (Basic)
- Null open/high/low/previous_close → expected permanently: the current API does not return these fields (v1.0.11); symbol/price/change/pct/delta/volume populate normally.
- "No data in response" for a specific symbol → invalid or delisted symbol (NASDAQ returns rCode 400 "Symbol not exists") or rate limit; skipped gracefully in bulk mode.
- Values null again after working → NASDAQ changed the response shape again; compare against the sample in Section 8.1 and extend the extractor.

### 9.6 Option Chain
- Missing column error → run Section 4.5 SQL + NOTIFY. Empty rows → valid (no options for symbol). Expiry parse fails → check `parseExpiryDate()` formats.

### 9.7 GammaPace IntraDay / LongTerm (v1.0.8)
- **"🔒 Admin locked"** on status line → unlock admin in Settings (password `191`).
- **"❌ Supabase not connected"** → Bridge URL and/or Security Key empty in Settings; fill both and retry (auto-init will then connect).
- **"❌ … Could not find the table 'gammapace_intraday' in the schema cache"** → tables don't exist in the connected project: re-run `supabase_gammapace.sql` in the SAME project the Bridge URL points to.
- **"❌ … row-level security"** → table created outside the SQL scripts; run the `ALTER TABLE ... DISABLE ROW LEVEL SECURITY` statements from `supabase_gammapace.sql`.
- **"❌ Invalid API key"** → wrong Security Key; paste the anon/publishable key from the same project.
- **Load succeeds but table looks empty** → verify you're inspecting the same Supabase project as the Bridge URL (common mix-up between projects).
- **Engine buttons report "No engine SQLs configured"** → expected until `INTRADAY_ENGINE_SQLS` / `LONGTERM_ENGINE_SQLS` are populated (Section 15.5).

### 9.8 Stale Deployment — "feature exists locally but not on the live page" (v1.0.16)
- **Symptom:** a feature (e.g. Gamma mode chips) works in the local HTML but is absent on the GitHub Pages URL.
- **Check:** view-source the live URL and search for a known marker string (`getGammaPaceSymbols`, `getActiveModeForAPI`). Missing → stale build.
- **Fix:** copy local `MarketTradingData.html` → repo **both** `index.html` AND `MarketTradingData.html`; commit + push; wait ~60-90s for Pages rebuild; **hard-refresh (Ctrl+Shift+R)** — browsers cache Pages aggressively.
- **Prevention:** always deploy both filenames together (Section 12.1); consider adding a visible version badge to the page.

---

## 10. Known Limitations

### Carried Forward (Alpha Eleven → Seventeen)
1. Option Chain availability depends on NASDAQ API options endpoints
2. Resume may not resume perfectly if browser/cache cleared
3. ALL mode uses the full symbol universe; exchange filter is UI-hidden (backend default nasdaq)
4. NASDAQ API may rate-limit excessive concurrent requests
5. CSV download holds full dataset in browser memory before splitting (5 MB split mitigates)
6. CSV export is today-only (`load_date = CURRENT_DATE` US Eastern)
7. Multi-file downloads may be blocked without pop-up permission (150ms stagger mitigates)
8. CSV `_1_` filename segment reserved for future batch numbering
9. Basic Quotes stores company_name/data_as_of/url/asset_class (v1.0.12); deeper metadata still requires Quote Info / Screener
10. Basic Quotes open/high/low/previous_close are NEVER returned by the current API (v1.0.11 verified) — columns REMOVED from schema in v1.0.12 via supabase_basic_quotes_update.sql
11. deepFind fallback is slower than direct access — use direct access where structure is known (v1.0.6 standard)
12. Loop delay fixed at 2s; toggle state not persisted; tight loops may trigger rate limits; loop re-upserts regardless of data change (idempotent by design)
13. Admin password hardcoded (`191`) — client-side guard, not a security boundary; lock state resets on refresh
14. Admin Panel hidden by default; Getting Started card is static

### New in Alpha One (v1.0.0 → v1.0.15)
15. **Init log says "8 endpoints found"** while 9 render — cosmetic; fix the string in `discoverAPIs()` when convenient
16. ~~`basic_quotes` display path stray `&`~~ — RESOLVED in v1.0.11 (path cleaned to `?symbol=`)
17. ~~**`getGammaPaceSymbols()` does not auto-init**~~ — RESOLVED in v1.0.14 (now auto-initializes Supabase from Settings; parity with `gammaRequireSupabase()`)
18. **GammaPace Engine buttons are placeholders** until `INTRADAY_ENGINE_SQLS` / `LONGTERM_ENGINE_SQLS` are populated with Postgres function names
19. **Bridge URL ambiguity** — multiple historical URLs exist in docs; the Settings value is authoritative (see Section 2.1 warning)
20. **Historical ALL mode with wide date ranges** can produce very large datasets (limit=5000/symbol)
21. **Quote Info ALL mode still sources symbols from `nasdaq_stocks`** (requires Stock Screener first) — Gamma modes are the recommended lightweight path

---

## 11. Roadmap / Future Enhancements

### 11.1 Priority
- Date-range CSV export (custom date range, not just today)
- Exchange-aware ALL mode
- Progress persistence (LocalStorage resume backup)
- Error recovery / auto-retry for failed symbols
- Data validation before insertion
- Confirm Basic Quote speculative fields during market hours; drop if still NULL
- Adaptive/configurable Loop delay; Loop state persistence
- Admin password via config
- **Populate Gamma engine SQLs** (IntraDay + LongTerm) — extension points ready (Section 15.5)

### 11.2 UI
Comparison view · advanced filtering · visualizations · download history · stats bar toggle

### 11.3 Performance
Streaming CSV generation · screener cache TTL · dynamic batch sizing · adaptive concurrency · cold-start improvement

### 11.4 CSV Export
Custom split threshold · ZIP archive · column selection · JSON export

---

## 12. Deployment

### 12.1 Frontend (GitHub Pages)
```bash
# Clone once (or reuse the local clone):
git clone https://github.com/Gurukullam/nasdaq-analysis-frontend.git
cd nasdaq-analysis-frontend

# Copy the local MVP3 file to BOTH repo filenames — they must stay identical:
copy "...\MVP3\MarketTradingData.html" index.html
copy "...\MVP3\MarketTradingData.html" MarketTradingData.html
git add index.html MarketTradingData.html
git commit -m "Your commit message - Alpha One v1.0.16 update"
git push origin main
```
Wait ~60-90s for the Pages rebuild, then **hard-refresh (Ctrl+Shift+R)**. Verify by searching the served page source for `getActiveModeForAPI` (v1.0.16 lesson: deploying only one filename leaves the other URL stale).

### 12.2 Backend (Vercel)
Deploy `nasdaq-historical-api` project; ensure frontend Backend key matches; Supabase credentials configured.

### 12.3 Supabase Setup (Run Once)
1. Run `supabase_all_tables.sql` (8 data tables)
2. Run `supabase_market_movers.sql` (10 movers tables)
3. Run `supabase_gammapace.sql` (4 GammaPace tables + rename migration)
4. RLS disabled by all scripts; keys in `API_Keys.txt`

### 12.4 Initial Data Load
Open frontend → Settings: Backend key + Bridge + Security Key → Load Data or per-endpoint ⬇️ CSV → monitor progress bar + logs.

### 12.5 Using Loop Auto-Reload
Unlock admin (191) → select APIs + modes → toggle Loop → Load Data → auto-iterates every 2s after completion → Cancel to stop.

### 12.6 Using GammaPace Watchlists
Unlock admin → type tickers (comma-separated) → 💾 Load → verify ✅ status → use 🔄 Refresh / ⚙️ Engine / 🗑️ DB Reset (confirmation popup). Buttons work standalone (auto-init) as long as Settings credentials are filled.

---

## 13. Changelog — Alpha One (Full History)

| Date | Version | Change |
|------|---------|--------|
| 2026-08-24 | v1.0.18 | **GAMMA_ENGINE_HIST BUTTON IS NOW FUNCTIONAL — both engines table-driven** — User request: ⚙️ Gamma_engine_hist must execute the SQL stored in GammaPace_Internal_Mapping for title='Gamma_engine_hist in Longterm symbols list update from SQL_Anlysis' and sno=5, then repopulate the LongTerm textarea. Mirrors v1.0.17 exactly: new LONGTERM_ENGINE_SQL_SOURCE constant (table/title/sno), gammaLongTermEngine() rewritten as fetch-SQL → rpc('execute_dynamic_sql') → re-select gammapace_longterm symbols into #longTermSymbols; status line reports each step ("✅ Gamma_engine_hist executed — symbols list updated — N symbol(s)"); same actionable hints (missing function → run supabase_gamma_engine.sql; empty row → warning; Postgres errors surfaced verbatim). Verified live: sno=5 row present (SQL = INSERT INTO gammapace_longterm SELECT DISTINCT symbol FROM nasdaq_movers_stock_nasdaq100 ON CONFLICT DO NOTHING); user confirmed execute_dynamic_sql() created (rpc ping returns "OK"); SYNTAX_OK; deployed both pages (commit b4d32b9). MD Sections 1, 13, 15.5 updated. |
| 2026-08-24 | v1.0.17 | **GAMMA_ENGINE BUTTON IS NOW FUNCTIONAL** — User request: ⚙️ Gamma_engine must execute the SQL stored in `GammaPace_Internal_Mapping` for title='Gamma_engine in Intraday symbols list update from SQL_Anlysis' and sno=4, then repopulate the symbols textarea from `gammapace_intraday`. Implementation: (1) new `supabase_gamma_engine.sql` — creates `execute_dynamic_sql(query TEXT)` SECURITY DEFINER function returning 'OK' or 'ERROR: <msg>', GRANT EXECUTE to anon+authenticated, disables RLS on the mapping table, NOTIFY pgrst (browsers cannot run raw SQL; rpc is the only path); (2) rewrote `gammaIntradayEngine()` as a 3-step flow — fetch `sql` via `.eq('title',...).eq('sno',4).limit(1)`, execute via rpc, then re-select `gammapace_intraday` symbols into `#intradaySymbols` like 🔄 Active; status line reports each step (✅ Gamma engine executed — symbols list updated — N symbol(s)); (3) actionable hints: missing function → run supabase_gamma_engine.sql; empty mapping row → warning with title/sno echoed; Postgres errors surfaced verbatim; (4) replaced the old placeholder INTRADAY_ENGINE_SQLS loop for IntraDay (LONGTERM_ENGINE_SQLS remains placeholder); verified mapping row live (sno=4 SQL = INSERT INTO gammapace_intraday SELECT DISTINCT symbol FROM nasdaq_movers_stock_dollarvol UNION nasdaq_movers_stock_nasdaq100 ON CONFLICT DO NOTHING) + SYNTAX_OK + deployed both pages (commit 92fe0c4, includes supabase_gamma_engine.sql in repo). Requires ONE-TIME manual step: run supabase_gamma_engine.sql in the Supabase SQL Editor. Sections 1, 9.8 n/a, 13, 15.4, 15.5 updated. |
| 2026-08-24 | v1.0.16 | **DEPLOYMENT FIXED — Gamma IntraDay end-to-end verified live** — User report: "Gamma IntraDay should load/download only symbols in `gammapace_intraday` across all applicable endpoints — not working." Root cause was NOT code: the deployed GitHub Pages build (`index.html`, "Phase 2.9") predated ALL gamma work, while local `MarketTradingData.html` (v1.0.15) was correct. Diagnosis steps: (1) REST-verified Supabase project `mushchoxbywxcpfmgavj` — `gammapace_intraday` reachable (SKHY at test time; NVDA+SKHY later), all 8 `nasdaq_*` tables present, RLS off; (2) Vercel proxy healthy (SKHY resolves as "SK hynix Inc. ADS"); (3) built a Node VM harness that runs the page's actual inline script with stubbed DOM/Supabase against the REAL backend + REAL credentials — all 7 per-symbol endpoints in `gamma_intraday` mode fetched ONLY watchlist symbols (SKHY: 950 chart rows etc.; with NVDA+SKHY: 1,920/2/2/2/40/2/322 rows across chart/trades/basic/quotes/historical/summary/options ≈2,290 rows in <4s) — fetch scoping 100% correct; (4) compared LIVE page vs local — live lacked every gamma marker (`getGammaPaceSymbols`, `getActiveModeForAPI`, mode chips). Fixes/deployments: commit `795eb8d` (local v1.0.15 → repo `index.html`) and commit `89f605f` (local v1.0.15 → repo **both** `MarketTradingData.html` AND `index.html` — the standalone URL `https://gurukullam.github.io/nasdaq-analysis-frontend/MarketTradingData.html` is now the canonical user-facing page and is kept byte-identical to local modulo git line-ending normalization; verified content-identical post-rebuild). Local MVP3 copy remains the single source of truth. New troubleshooting entry 9.8 (stale deployment). Sections 1, 2.1, 12.1, 13 updated. |
| 2026-08-23 | v1.0.15 | **Quote Info 4-MODE SUPPORT — all per-symbol endpoints now have Gamma modes** — User request: choosing Gamma LongTerm on ANY endpoint must pull `SELECT DISTINCT symbol FROM gammapace_longterm` and run the full end-to-end flow (CSV button, Load Data button, and Loop auto-reload all respect the chosen filter). Quote Info (`quotes`) was the last per-symbol endpoint without mode chips. Fixes: (1) new `quotesMode` state variable (default `'single'`) + `selectQuotesMode()` selector; (2) 4 mode chips + symbol input rendered in `discoverAPIs()` (`#quotes-symbol`, default AAPL); (3) `loadQuotes()` rewritten with the canonical 4-mode template — Single fetches one symbol, ALL preserves the legacy nasdaq_stocks-sourced + resume path, Gamma IntraDay/LongTerm use `getGammaPaceSymbols()`; (4) `getActiveModeForAPI()` gained `case 'quotes'` so CSV downloads scope to the watchlist; (5) `getGammaPaceSymbols()` now returns `[...new Set(...)]` — JS-level DISTINCT safety guarantee (equivalent to `SELECT DISTINCT symbol`; the active tables already use symbol as PRIMARY KEY). Verified via Node syntax check — SYNTAX_OK. Sections 1, 3.1, 3.3, 5.2, 5.4, 5.5, 10, 11, 13, 15.7 updated. |
| 2026-08-23 | v1.0.14 | **Gamma watchlist auto-init + CSV symbol scoping** — `getGammaPaceSymbols()` now AUTO-INITIALIZES Supabase from Settings when null (parity with `gammaRequireSupabase()`) — resolves former limitation #17, so selecting a Gamma chip and immediately clicking ⬇️ CSV or ▶️ Load Data works standalone. New `getActiveModeForAPI(apiId)` maps each per-symbol endpoint to its active mode variable. `downloadAPI()` resolves the active Gamma watchlist and passes `symbolFilter` to `downloadTableAsCSV()` — CSV downloads are scoped to exactly the watchlist symbols, never mixing in earlier ALL-NASDAQ rows. `startLoading()` surfaces the active filter on every cycle (incl. Loop iterations). |
| 2026-08-23 | v1.0.13 | **Realtime Trades END-TO-END ATTRIBUTE ALIGNMENT** — User request: endpoint fetch attributes did not align with the Supabase table. Live audit of `/api/quote/{symbol}/realtime-trades` (verified 2026-08-23) mapped every meaningful field to a column: data.symbol→symbol, rows[].price/size/time→price/size/time_text (market hours), topTable.nlsVolume/previousClose/todayHighLow/fiftyTwoWeekHighLow→nls_volume/previous_close/today_high_low/fifty_two_week_range — all already aligned EXCEPT `topTable.asOf` ("Data as of ..." timestamp), which was not captured. New `supabase_realtime_trades_update.sql` (safe ALTER, preserves data): ADD COLUMN `as_of VARCHAR(80)` + RLS off + NOTIFY. HTML: `fetchSymbolTrades()` extracts asOf and stamps it on BOTH emission paths (summary snapshot rows and market-hours trade rows); loader comment block now documents the full attribute-alignment map; envelope chrome (totalRecords/offset/limit/headers/description/message) intentionally NOT stored. Dedupe constraint UNCHANGED `(symbol, nls_volume, previous_close, today_high_low, fifty_two_week_range)` — as_of is metadata-only like load_timestamp (including it would append duplicate rows every Loop cycle during market hours since its value changes continuously). supabase_all_tables.sql section 2 updated for fresh installs. Verified live: AAPL → vol=46,876,816 prevCls=$311.30 hi/lo=$312.38/$307.01 52w=$344.5699/$223.7804 as_of=null (NULL expected outside market hours); MSFT same pattern — row keys exactly match table columns, ALL CHECKS PASSED + SYNTAX_OK. Sections 1.3, 4.1, 4.5, 5.5, 13 updated. |
| 2026-08-23 | v1.0.12 | **Current Quote (Basic) SCHEMA ADJUSTED to match the real endpoint payload** — User request: remove unneeded columns, store the fields the API actually returns. New `supabase_basic_quotes_update.sql` (safe ALTER migration, preserves data): DROPS `open_price`/`high_price`/`low_price`/`previous_close` (never returned); ADDS `company_name` (records[].ticker[1], e.g. "Apple Inc. Common Stock"), `data_as_of` (envelope data.date, "Data as of Aug 20, 2026"), `url` (/market-activity/stocks/aapl), `asset_class` (STOCKS); REBUILDS dedupe constraint on market values only `(symbol, last_sale_price, net_change, percentage_change, delta_indicator, volume)` + RLS off + NOTIFY. HTML: records[] mapping extended with the 4 new fields, OHLC keys removed from both primary and legacy-fallback paths (legacy rows would fail against dropped columns), conflict key in insertToSupabase() updated to match. supabase_all_tables.sql section 3 updated for fresh installs. Verified live: AAPL → Apple Inc. Common Stock · $309.35 · -1.95 · -0.63% · down · 46,876,985 · "Data as of Aug 20, 2026" · STOCKS · /market-activity/stocks/aapl; MSFT same pattern — ALL CHECKS PASSED + SYNTAX_OK. Sections 4.1, 4.5, 5.5, 5.11, 8, 10 updated. |
| 2026-08-23 | v1.0.11 | **Current Quote (Basic) FIXED — new API response structure mapped** — NASDAQ changed `/api/quote/basic` from a flat object (`lastSalePrice`/`netChange`/`percentageChange`) to a `data.records[]` envelope (`ticker[]`, `lastSale`, `change`, `pctChange`, `deltaIndicator`, `volume`, `key`, `url`, `assetclass`). The old extractor matched zero keys → every row loaded with NULL values except symbol. Fixes: (1) primary extraction maps `records[]` (ticker[0]/key-prefix → symbol; `$`/`,` stripping via toPrice/toBigInt); (2) legacy flat-shape fallback retained defensively; (3) `fetchSymbolBasic()` now returns a row ARRAY (multi-record ready); (4) single/bulk modes consume arrays; (5) cosmetic stray `&` removed from the basic_quotes display path; (6) invalid symbols (rCode 400 "Symbol not exists") confirmed handled gracefully. Verified live via backend proxy: AAPL $309.35/-1.95/-0.63%/down/46,876,985 · MSFT $483.24/+2.09/+0.43%/up · NVDA $214.72/-2.13/-0.98%/down — ALL CHECKS PASSED + full inline-script syntax check OK. Multi-symbol batching tested and NOT supported (comma list → rCode 400) — per-symbol flow retained. Sections 3.1, 5.5, 8, 9.5, 10 updated. |
| 2026-08-22 | v1.0.10 | **GammaPace button labels renamed (cosmetic)** — In both GammaPace IntraDay and GammaPace LongTerm sections: 🔄 Refresh → **🔄 Active** and 💾 Load → **💾 Add**. Display labels only — underlying functions (`gammaIntradayRefresh`/`gammaIntradayLoad`/`gammaLongTermRefresh`/`gammaLongTermLoad`), behavior, status messages, and log entries unchanged. Section 15.3 snippet updated to match. |
| 2026-08-22 | v1.0.9 | **GammaPace buttons no longer scroll to the log panel** — Removed the `focusLog()` call from all 8 GammaPace handlers (Refresh/Load/Engine/Reset × IntraDay/LongTerm). The inline status line under each section's buttons is now the SOLE feedback channel — clicking a GammaPace button keeps the viewport in place. Log entries are still written to the bottom log panel for the record, but silently (no `active-log` engagement, no page scroll). Scroll-to-log behavior is retained EXCLUSIVELY for the main flows: `startLoading()` (Load Data button, via `scrollToLog()`) and `downloadAPI()` (CSV buttons, via `focusLog()`). Verified via Node syntax check. |
| 2026-08-22 | v1.0.8 | **GammaPace buttons FIXED — standalone operation + unmissable feedback** — Root cause of "Load does nothing": `supabaseClient` was only initialized by Load Data / CSV flows, so going straight to a GammaPace button left it null and the error was written only to the log panel far down the page (invisible). Fixes: (1) `gammaRequireSupabase()` now **auto-initializes Supabase** from Settings values when null — GammaPace buttons work standalone on first click; if credentials are missing it opens Settings AND shows the status line. (2) All 8 handlers now show **status-line messages for locked/unconnected states** ("🔒 Admin locked…" / "❌ Supabase not connected…") instead of log-only output, and call `focusLog()` so the log trail scrolls into view. (3) New `gammaErrorHint(msg)` appends actionable hints to status errors: table-missing → re-run supabase_gammapace.sql + verify Bridge URL project; RLS violation → disable RLS SQL; invalid key → check Security Key. Verified via Node syntax check (`node --check`) that the full inline script parses cleanly. |
| 2026-08-22 | v1.0.7 | **GammaPace sections improved — unquoted tables, inline status feedback, reset confirmation** — (1) Tables renamed from quoted `"GammaPace_*"` to unquoted lowercase `gammapace_*` via data-preserving `ALTER TABLE ... RENAME` migration in `supabase_gammapace.sql`; all HTML references updated (12 loader sites + 8 watchlist-function sites); no data lost during rename. (2) Inline status line added under each section's buttons (`setGammaStatus()` → `#intradayStatus` / `#longTermStatus`) reporting Refresh ("text space refreshed"), Load ("table updated"), Engine ("gamma engine retrieved/executed"), and Reset ("table truncated/reset") outcomes with ✅/❌/ℹ️ states. (3) DB Reset now opens a themed confirmation popup (`#gammaResetModal`) naming the affected tables — OK proceeds with archive+truncate via new `executeIntradayReset()` / `executeLongTermReset()`, Cancel aborts. |
| 2026-08-20 | v1.0.6 | **Performance pass — Current Quote (Basic) + all endpoints** — (1) `loadBasicQuotes()`: replaced slow recursive `deepFind()` with **direct property access** on the known response root (2-3× faster per symbol) and bumped ALL-mode to **10 concurrent / 25ms**. (2) Parity bumps: Realtime Trades → 10/25ms; Quote Summary → 8/40ms; Historical Prices → 8/40ms; Option Chain → 6/50ms. (3) Screener progress label updated to "data-state dedupe upsert". No SQL changes. |
| 2026-08-20 | v1.0.5 | **Realtime Trades FIXED + universal factual data-state dedupe** — (1) Realtime Trades no longer loads zero rows: free API always returns `rows: []` but `topTable` summary is real data — loader ALWAYS emits one summary snapshot row per symbol (table fills 24/7). (2) `insertToSupabase()` universal optimization: 2,000-row batches + `load_timestamp` metadata on EVERY row; per-table factual `conflictKey` + `ignoreDuplicates: true`. (3) New `supabase_all_tables.sql` — complete DROP + CREATE for all 8 tables using `UNIQUE NULLS NOT DISTINCT` (Postgres 15+) + optimized indexes. |
| 2026-08-20 | v1.0.4 | **Stock Screener single-logical-insert + data-state dedupe** — Screener upgraded to `limit=500000` with `&offset=` pagination safety. Screener fast-path: 2,000-row batches × 2 concurrency + `load_timestamp` stamping. New `nasdaq_stocks` schema: `UNIQUE (symbol, last_sale, net_change, pct_change, market_cap)` with `ignoreDuplicates: true` → identical re-loads SKIPPED, data changes append. Added `getUSLoadTimestamp()`. `loadQuotes()` dedupes symbols from multi-state `nasdaq_stocks`. Run `supabase_nasdaq_stocks.sql`. |
| 2026-08-19 | v1.0.3 | **Added Market Movers endpoint** — `/api/marketmovers` at position 1. 10 insert-only tables (`nasdaq_movers_*` for STOCKS/ETF/MUTUALFUNDS × categories). `loadMarketMovers()` single call → `{table, rows}` groups; plain `insert()` fast path; every Loop cycle appends a fresh dated snapshot. Wired into startLoading, fetchAndUpsertAPI, getTablesForAPI (CSV exports all 10), updateStats. |
| 2026-08-18 | v1.0.2 | **Added Realtime Trades endpoint** — position 2. `nasdaq_realtime_trades` with `UNIQUE (symbol, time_text, load_date)` + ignoreDuplicates. `loadRealtimeTrades()` dual mode via parallelFetchAll. |
| 2026-08-18 | v1.0.1 | **Added Chart Data endpoint** — top of list. `nasdaq_chart` with `UNIQUE (symbol, timestamp)` + ignoreDuplicates so Loop re-runs insert only new minutes. `loadChart()` dual mode via parallelFetchAll. |
| 2026-08-17 | v1.0.0 | **Alpha One** — Created `MarketTradingData.html` from Alpha Seventeen `index.html`. Removed 10 non-Market endpoints; kept 6 Market & Trading Data endpoints; simplified startLoading/fetchAndUpsertAPI/insertToSupabase/updateStats/getTablesForAPI; preserved all Alpha Seventeen features. |

---

## 14. How to Resume Work

### 14.1 If Starting Fresh in a New Chat
1. Read this file (`MVP3_Alpha_One.md`) — it is the single source of truth
2. Verify live: Vercel backend, GitHub Pages frontend, Supabase project (match Bridge URL!)
3. Open the frontend → Settings → confirm Backend key / Bridge / Security Key
4. Unlock admin (191) → test GammaPace 💾 Load with one ticker → expect ✅ status + row in `gammapace_intraday`
5. If any tables are missing, run in Supabase SQL Editor: `supabase_all_tables.sql`, `supabase_market_movers.sql`, `supabase_gammapace.sql` (all safe/re-runnable)
6. Run one ⬇️ CSV download to confirm the full fetch→upsert→download pipeline
7. Proceed with roadmap items (Section 11) or new endpoints (Section 5.7 checklist)

### 14.2 If Something Is Broken
1. Vercel dashboard → backend errors
2. Supabase Table Editor → data present? correct project?
3. Browser console → JS errors
4. Section 9 troubleshooting (incl. 9.7 GammaPace)
5. Compare against versioned backups (`MarketTradingData - vN.html`) or Git history

### 14.3 If Credentials Are Lost
Supabase URL + Anon Key: Dashboard → Settings → API. Service key: same page (never in browser). Vercel: `vercel.com/sivachandran-ramachandrans-projects/nasdaq-historical-api`.

### 14.4 Deployment Command
```bash
cd nasdaq-analysis-frontend
# Copy local MVP3 MarketTradingData.html to BOTH filenames first (see Section 12.1)
git add index.html MarketTradingData.html
git commit -m "Your commit message - Alpha One update"
git push origin main
```

### 14.5 When Adding a New Endpoint
Follow **Section 5.7** exactly — it contains the canonical extraction template (direct access + deepFind fallback), the unified bulk-mode load template (Single / ALL / Gamma IntraDay / Gamma LongTerm), and the 15-step wiring checklist. Update this MD afterwards (Sections 3.1, 4, 5.5, 6, 7, 13).

---

## 15. GammaPace Recommends — IntraDay & LongTerm (Admin-Only)

### 15.1 Overview
Two admin-only sections in `MarketTradingData.html` between the **Getting Started** card and the **Available Data Sources** card. Each manages a watchlist of ticker symbols in Supabase with a UTC load timestamp. Hidden until admin unlock (password `191`).

| Section | Active Table | Archive Table | Engine Button |
|---------|--------------|---------------|---------------|
| ⚡ **GammaPace IntraDay** | `gammapace_intraday` | `gammapace_intraday_hist` | `Gamma_engine` |
| 📈 **GammaPace LongTerm** | `gammapace_longterm` | `gammapace_longterm_hist` | `Gamma_engine_hist` |

**v1.0.7 + v1.0.8 capabilities:**
- **Unquoted lowercase tables** (`gammapace_*`) — data-preserving RENAME migration (Section 4.3)
- **Inline status line** under each section's buttons — every operation reports ✅ success / ❌ error (+hint) / ℹ️ info
- **DB Reset confirmation popup** — themed modal names the affected tables; OK proceeds, Cancel aborts
- **Standalone operation (v1.0.8)** — buttons auto-initialize Supabase from Settings; no need to run Load Data first
- **Visible guard states (v1.0.8)** — locked/unconnected clicks show status messages instead of invisible log-only output
- **No page scroll (v1.0.9)** — GammaPace buttons never navigate the viewport; the inline status line is the sole feedback channel (log entries still recorded silently). Scroll-to-log is reserved for Load Data / CSV flows only.
- **Actionable error hints (v1.0.8)** — `gammaErrorHint()` explains table-missing / RLS / invalid-key failures

### 15.2 Supabase Tables — Run `supabase_gammapace.sql` Once (safe to re-run)
See Section 4.3 for schema and Section 4.5 for the script list. The script: (A) `ALTER TABLE IF EXISTS "GammaPace_*" RENAME TO gammapace_*` (preserves data), (B) `CREATE TABLE IF NOT EXISTS gammapace_*` for fresh installs, (C) `DISABLE ROW LEVEL SECURITY` on all four, (D) `NOTIFY pgrst, 'reload schema'`.

### 15.3 HTML Structure
```html
<div id="gammaPacePanel" style="display:none;">
  <!-- IntraDay card -->
  <div class="card">
    <div class="card-header"><div class="card-title"><span class="icon">⚡</span> GammaPace IntraDay</div></div>
    <div class="input-group">
      <label>Ticker Symbols (comma-separated)</label>
      <textarea id="intradaySymbols" rows="5" placeholder="AAPL, MSFT, NVDA, GOOGL, AMZN"></textarea>
    </div>
    <div style="display:flex;gap:8px;flex-wrap:wrap;">
      <button class="btn btn-secondary btn-sm" onclick="gammaIntradayRefresh()">🔄 Active</button>
      <button class="btn btn-primary btn-sm" onclick="gammaIntradayLoad()">💾 Add</button>
      <button class="btn btn-primary btn-sm" onclick="gammaIntradayEngine()">⚙️ Gamma_engine</button>
      <button class="btn btn-danger btn-sm" onclick="gammaIntradayReset()">🗑️ DB Reset</button>
    </div>
    <div id="intradayStatus" class="gamma-status"></div>
  </div>
  <!-- LongTerm card (ids: longTermSymbols, longTermStatus; functions: gammaLongTerm*) -->
</div>
```
- Textareas: editable, `rows="5"`, `min-height:120px`, uppercase transform
- Status lines: `.gamma-status` CSS (success green / error red / info muted)
- Reset modal: `#gammaResetModal` + `#gammaResetMessage`, Cancel / "OK — Proceed"
- Panel visibility wired to admin lock in `toggleAdminLock()` / `checkAdminPassword()`

### 15.4 JavaScript Functions

**Helpers:**
- `getUTCTimestamp()` — `new Date().toISOString()`
- `parseSymbolList(text)` — split/trim/uppercase/filter
- `gammaRequireSupabase()` — **auto-initializes Supabase from Settings when null (v1.0.8)**; opens Settings + scrolls top if credentials missing
- `gammaErrorHint(msg)` — appends fix-it hints for table-missing / RLS / invalid-key errors (v1.0.8)
- `setGammaStatus(elementId, msg, type)` — inline status line ('success' | 'error' | 'info')
- `requestGammaReset(section)` / `closeGammaResetModal()` / `confirmGammaReset()` — confirmation popup flow (`pendingGammaReset`)

**IntraDay (table `gammapace_intraday`):**
| Function | Behavior |
|----------|----------|
| `gammaIntradayRefresh()` | Select all symbols (ordered) → fill `#intradaySymbols` → status "Text space refreshed — N symbol(s)" |
| `gammaIntradayLoad()` | Parse textarea → upsert `{symbol, load_date_utc: now}` `onConflict:'symbol'` → status "Table updated — N symbol(s) upserted" |
| `gammaIntradayEngine()` | Iterate `INTRADAY_ENGINE_SQLS[]` via `supabaseClient.rpc(sql)` → status "Gamma engine retrieved/executed — X/N SQL(s) OK" |
| `gammaIntradayReset()` | Opens confirmation popup; OK → `executeIntradayReset()` |
| `executeIntradayReset()` | Select all → insert into `gammapace_intraday_hist` → delete all from `gammapace_intraday` → status "Table truncated/reset — N ticker(s) archived" |

**LongTerm (table `gammapace_longterm`):** identical pattern with `gammaLongTerm*` functions, `LONGTERM_ENGINE_SQLS`, `executeLongTermReset()`, `#longTermSymbols` / `#longTermStatus`.

All handlers: admin guard (visible 🔒 status message), Supabase guard (visible ❌ status + auto-init). **No `focusLog()`** — the inline status line is the sole feedback channel and the page never scrolls (v1.0.9); log entries are still appended to the bottom log panel silently.

### 15.5 Engine SQL Extension Points
```javascript
// v1.0.18 — BOTH engines are now LIVE. Each reads its SQL text from the
// gammapace_internal_mapping table instead of a hardcoded array:
const INTRADAY_ENGINE_SQL_SOURCE = {
  table: 'gammapace_internal_mapping',
  title: 'Gamma_engine in Intraday symbols list update from SQL_Anlysis',
  sno: 4
};
const LONGTERM_ENGINE_SQL_SOURCE = {
  table: 'gammapace_internal_mapping',
  title: 'Gamma_engine_hist in Longterm symbols list update from SQL_Anlysis',
  sno: 5
};
```
**IntraDay flow (v1.0.17, `gammaIntradayEngine()`):**
1. Fetch `sql` from `gammapace_internal_mapping` WHERE title = 'Gamma_engine in Intraday symbols list update from SQL_Anlysis' AND sno = 4 (currently: `INSERT INTO gammapace_intraday SELECT DISTINCT symbol FROM nasdaq_movers_stock_dollarvol UNION SELECT DISTINCT symbol FROM nasdaq_movers_stock_nasdaq100 ON CONFLICT DO NOTHING`)
2. Execute it via `supabaseClient.rpc('execute_dynamic_sql', { query: sqlText })` — requires **`supabase_gamma_engine.sql` run once** in the Supabase SQL Editor (creates the SECURITY DEFINER function + grants EXECUTE to anon/authenticated + disables RLS on the mapping table)
3. On success, re-select all symbols from `gammapace_intraday` and populate the `#intradaySymbols` textarea exactly like 🔄 Active; status line reports "✅ Gamma engine executed — symbols list updated — N symbol(s)"

Error hints: missing function → "run supabase_gamma_engine.sql"; Postgres-level failure → the SQL error message is surfaced verbatim.

**LongTerm flow (v1.0.18, `gammaLongTermEngine()`):** identical 3-step pattern —
1. Fetch `sql` from `gammapace_internal_mapping` WHERE title = 'Gamma_engine_hist in Longterm symbols list update from SQL_Anlysis' AND sno = 5 (currently: `INSERT INTO gammapace_longterm SELECT DISTINCT symbol FROM nasdaq_movers_stock_nasdaq100 ON CONFLICT DO NOTHING`)
2. Execute via `rpc('execute_dynamic_sql', { query })`
3. Re-select all symbols from `gammapace_longterm` and populate `#longTermSymbols`; status reports "✅ Gamma_engine_hist executed — symbols list updated — N symbol(s)"

Both engines are fully table-driven: editing the SQL in `gammapace_internal_mapping` changes engine behavior with no code changes.

```javascript
// (no remaining placeholder engine arrays — both wired in v1.0.17/v1.0.18)
```

### 15.6 Replication Checklist (for another HTML page)
1. Run `supabase_gammapace.sql` once
2. Add `.gamma-status` CSS + `.input-group textarea` CSS
3. Add `#gammaPacePanel` wrapper with both cards (4 buttons + status div each)
4. Add `#gammaResetModal` confirmation modal
5. Wire admin lock to show/hide `#gammaPacePanel`
6. Copy the GammaPace JS section (helpers incl. auto-init `gammaRequireSupabase` + `gammaErrorHint` + 10 functions + 2 engine arrays)
7. Test: Refresh → Load → Engine (once SQLs provided) → DB Reset (confirm popup)
8. Verify `_hist` tables accumulate archived rows after each DB Reset

### 15.7 Gamma IntraDay / Gamma LongTerm Mode Chips (Public)
- 4 mode chips on all 7 per-symbol endpoints (Chart, Realtime Trades, Basic Quotes, Quote Info, Historical, Summary, Option Chain); gamma modes read symbols from `gammapace_intraday` / `gammapace_longterm` via `getGammaPaceSymbols(table)` and run the same `parallelFetchAll` bulk mechanism — fully public, CSV buttons respect the mode
- `getGammaPaceSymbols(table)` selects `symbol` ordered, dedupes via `[...new Set(...)]` (v1.0.15 — equivalent to `SELECT DISTINCT symbol`), logs count, returns array. **Auto-initializes Supabase from Settings when null (v1.0.14)** — Gamma modes work standalone without running other flows first.
- Template in Section 5.7 B is the standard for wiring gamma modes into any new endpoint
