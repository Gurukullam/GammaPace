// ============================================================
// GammaPace — NASDAQ CORS Proxy (Cloudflare Worker, FREE plan)
//
// Drop-in replacement for the nasdaq-historical-api Vercel backend.
// Speaks the EXACT same protocol, so NO frontend changes are needed:
// just paste this worker's URL into the "Backend key" field in the
// Settings panel on Global Investing/MarketTradingData.html.
//
//   GET  /                  -> health JSON (used by checkBackendHealth())
//   POST /api/nasdaq-proxy  body: { "path": "/api/quote/AAPL/info?assetclass=stocks" }
//                           -> proxies https://api.nasdaq.com{path} with
//                              browser-like headers + CORS enabled
//
// Free tier: 100,000 requests/day (all endpoints combined), resets 00:00 UTC.
// Deploy: see README.md (Dashboard paste-in, no tools required).
// ============================================================

// Security lock: '*' = allow any origin (easiest to start with).
// To lock the worker to your GitHub Pages site only, change to:
//   const ALLOWED_ORIGIN = 'https://gurukullam.github.io';
const ALLOWED_ORIGIN = '*';

const NASDAQ_ORIGIN = 'https://api.nasdaq.com';

// NASDAQ rejects requests without a browser-like User-Agent, so we
// always present browser headers to the upstream API.
const UPSTREAM_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  'Accept': 'application/json, text/plain, */*',
  'Accept-Language': 'en-US,en;q=0.9',
  'Referer': 'https://www.nasdaq.com/'
};

function buildCorsHeaders(request) {
  if (ALLOWED_ORIGIN === '*') {
    return { 'Access-Control-Allow-Origin': '*' };
  }
  return { 'Access-Control-Allow-Origin': ALLOWED_ORIGIN, 'Vary': 'Origin' };
}

function isOriginAllowed(request) {
  if (ALLOWED_ORIGIN === '*') return true;
  return (request.headers.get('Origin') || '') === ALLOWED_ORIGIN;
}

function jsonResponse(request, obj, status) {
  return new Response(JSON.stringify(obj), {
    status: status || 200,
    headers: Object.assign(
      { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
      buildCorsHeaders(request)
    )
  });
}

async function proxyNasdaq(request, path) {
  const target = NASDAQ_ORIGIN + path;
  let upstream;
  try {
    upstream = await fetch(target, { headers: UPSTREAM_HEADERS });
  } catch (e) {
    return jsonResponse(request, { error: 'Upstream fetch failed: ' + (e && e.message ? e.message : String(e)) }, 502);
  }
  const text = await upstream.text();
  return new Response(text, {
    status: upstream.status,
    headers: Object.assign(
      { 'Content-Type': upstream.headers.get('Content-Type') || 'application/json; charset=utf-8' },
      buildCorsHeaders(request)
    )
  });
}

export default {
  async fetch(request) {
    // CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: Object.assign({
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
          'Access-Control-Max-Age': '86400'
        }, buildCorsHeaders(request))
      });
    }

    if (!isOriginAllowed(request)) {
      return jsonResponse(request, { error: 'Origin not allowed' }, 403);
    }

    const url = new URL(request.url);

    // GET / — health probe (MarketTradingData.html pings this at page init)
    if (request.method === 'GET') {
      return jsonResponse(request, {
        status: 'healthy',
        service: 'gammapace-nasdaq-proxy',
        timestamp: new Date().toISOString()
      });
    }

    // POST /api/nasdaq-proxy — main proxy endpoint (same contract as the
    // old Vercel backend: JSON body { "path": "..." })
    if (request.method === 'POST' && url.pathname === '/api/nasdaq-proxy') {
      let body = null;
      try {
        body = await request.json();
      } catch (e) {
        return jsonResponse(request, { error: 'Invalid JSON body' }, 400);
      }
      const path = body ? body.path : null;
      if (typeof path !== 'string' || path.indexOf('/api/') !== 0 || path.length > 2000) {
        return jsonResponse(request, { error: 'Missing or invalid "path" (must start with /api/)' }, 400);
      }
      return proxyNasdaq(request, path);
    }

    return jsonResponse(request, { error: 'Not found' }, 404);
  }
};