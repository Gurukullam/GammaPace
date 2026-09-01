# GammaPace NASDAQ Proxy — Cloudflare Worker (FREE)

Drop-in replacement for the suspended `nasdaq-historical-api.vercel.app` backend.
Same protocol, same endpoints — the frontend needs **no code changes**.

**Free tier:** 100,000 requests/day (all endpoints combined), resets 00:00 UTC,
no credit card required.

---

## Deploy — Option A: Cloudflare Dashboard (easiest, no tools)

1. Create a free account: https://workers.cloudflare.com (sign up with email — no card needed).
2. Dashboard -> **Workers & Pages** -> **Create** -> **Create Worker**.
3. Name it `gammapace-nasdaq-proxy` -> **Deploy**.
4. Click **Edit code**, delete the sample code, paste the entire contents of
   `worker.js` from this folder, then click **Deploy**.
5. Copy your worker URL, shown at the top of the editor:
   `https://gammapace-nasdaq-proxy.<your-subdomain>.workers.dev`

## Deploy — Option B: Wrangler CLI

```bash
npm install -g wrangler
wrangler login
# from this CloudflareWorker folder:
wrangler deploy
```

---

## Point the frontend at it

1. Open **Global Investing/MarketTradingData.html**.
2. Click **⚙️ Settings**.
3. Replace the **Backend key** value with your worker URL:
   `https://gammapace-nasdaq-proxy.<your-subdomain>.workers.dev`
4. Done. The URL is saved in the browser (localStorage) and survives reloads.
   The log will show `Backend probe OK: ... (HTTP 200)` on the next page load.

## Verify

- `GET  https://<worker-url>/` -> `{"status":"healthy",...}`
- `POST https://<worker-url>/api/nasdaq-proxy` with body
  `{"path":"/api/quote/AAPL/info?assetclass=stocks"}` -> NASDAQ JSON

## Optional: lock the worker to your site only

By default the worker answers any origin (`ALLOWED_ORIGIN = '*'` in `worker.js`).
To allow only your GitHub Pages site, edit line ~20 of `worker.js`:

```js
const ALLOWED_ORIGIN = 'https://gurukullam.github.io';
```

then redeploy (Dashboard: Edit code -> Deploy; CLI: `wrangler deploy`).

## Quota math (free tier)

| Operation | Requests |
|---|---|
| Page load (health probe) | 1 |
| Single-symbol fetch | 1 |
| GammaPace IntraDay (50 tickers) | ~50 |
| Full ALL-NASDAQ bulk load (1 endpoint) | ~7,000 |
| All 9 endpoints, complete ALL-mode sweep | ~30,000–40,000 |

Avoid Loop mode (2s auto-reload) in ALL-NASDAQ mode — 7,000 symbols per cycle
exhausts 100,000/day in minutes. Loop mode is fine for Gamma watchlist sizes.

When the daily limit is hit, requests are rejected until the 00:00 UTC reset;
nothing breaks permanently and your Supabase data is unaffected.

## Troubleshooting

| Log message | Meaning / fix |
|---|---|
| `Backend probe OK ... HTTP 200` | Worker is live and reachable. |
| `Backend probe failed ... unreachable` | Wrong URL in Settings, or worker not deployed yet. |
| `HTTP 402 DEPLOYMENT_DISABLED` (old Vercel URL) | Settings still points at the suspended Vercel backend — swap in the worker URL. |
| `HTTP 429 / quota` | Daily 100k limit reached — wait for the UTC reset. |
| `Origin not allowed (403)` | `ALLOWED_ORIGIN` in worker.js doesn't match your site's origin. |