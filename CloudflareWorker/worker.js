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
//
// ── ROOT-CAUSE FIX for intermittent upstream HTTP 403 (2026-10-20) ──
// The 403s are NASDAQ/Akamai RATE-LIMITING this worker's egress IP when
// request bursts exceed its threshold. Verified live: a simultaneous burst
// of 40 requests from an idle state produced a 403, while single requests
// always returned 200. The previous version AMPLIFIED every block — each
// request re-hit the upstream up to 4 times with sleeps (a 403 wave became
// a self-sustaining stampede) and held the browser waiting for seconds.
//
// v2 protection layers (module-scope state = per-isolate, best-effort):
//   1. PACE      — a slot queue smooths upstream calls to ~10 req/s
//                  (adaptive 4..20 rps: +1 after every 250 clean
//                  responses, halved on every 403/429/503 observed).
//   2. FAST-FAIL — if the pacing queue is >4s deep or the circuit is
//                  open, answer 429 IMMEDIATELY (no upstream call, no
//                  sleeping) so the frontend's fail-fast skip engages
//                  and the load keeps moving to the next symbol.
//   3. CIRCUIT   — 5 upstream rate-limit responses within 10s opens the
//                  circuit for 20-60s: ZERO upstream traffic during the
//                  block window lets Akamai's per-IP limit clear, then
//                  a single probe request closes the circuit on success.
//   4. RETRY     — max 2 upstream attempts (was 4), 300-700ms jitter,
//                  only while the circuit is closed.
// ============================================================

// Security lock: '*' = allow any origin (easiest to start with).
// To lock the worker to your GitHub Pages site only, change to:
//   const ALLOWED_ORIGIN = 'https://gurukullam.github.io';
const ALLOWED_ORIGIN = '*';

const NASDAQ_ORIGIN = 'https://api.nasdaq.com';

// NASDAQ rejects requests without browser-like headers, so we present the
// full first-party header shape a www.nasdaq.com XHR would send (the added
// sec-ch-ua / Sec-Fetch-* headers match what a real Chrome session emits).
const UPSTREAM_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  'Accept': 'application/json, text/plain, */*',
  'Accept-Language': 'en-US,en;q=0.9',
  'Referer': 'https://www.nasdaq.com/',
  'sec-ch-ua': '"Chromium";v="126", "Google Chrome";v="126", "Not-A.Brand";v="99"',
  'sec-ch-ua-mobile': '?0',
  'sec-ch-ua-platform': '"Windows"',
  'Sec-Fetch-Site': 'same-site',
  'Sec-Fetch-Mode': 'cors',
  'Sec-Fetch-Dest': 'empty'
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

// ── Layer 1: PACE — smooth slot queue for upstream calls ──────────────
// Akamai 403s bursts (verified live 2026-10-20: 40 simultaneous requests
// produced a 403; singles always 200). Every upstream call reserves the
// next time-slot so traffic arrives at a steady rate instead of a
// stampede. Adaptive rate (AIMD): halves on every upstream 403/429/503,
// +1 req/s per 250 clean responses, bounded to 4..20 req/s.
const PACE_MIN_RPS = 4;
const PACE_MAX_RPS = 20;
const PACE_START_RPS = 10;
const PACE_RAMP_EVERY = 250;
const PACE_MAX_WAIT_MS = 4000; // deeper queue -> instant 429 instead of waiting

let paceRps = PACE_START_RPS;
let paceNextSlotAt = 0;
let paceCleanSinceRamp = 0;

// Reserve the next upstream slot. Returns { waitMs, gap } — sleep waitMs
// before fetching; call paceRefund(gap) if you end up NOT fetching.
function paceReserve() {
  const now = Date.now();
  if (paceNextSlotAt < now) paceNextSlotAt = now; // idle -> no phantom backlog
  const slot = paceNextSlotAt;
  const gap = (1000 / paceRps) + (Math.random() * 20 - 10); // ±10ms jitter
  paceNextSlotAt = slot + gap;
  return { waitMs: Math.max(0, slot - now), gap: gap };
}

function paceRefund(gap) {
  paceNextSlotAt -= gap;
}

function paceNoteClean() {
  paceCleanSinceRamp++;
  if (paceCleanSinceRamp >= PACE_RAMP_EVERY) {
    paceCleanSinceRamp = 0;
    paceRps = Math.min(PACE_MAX_RPS, paceRps + 1);
  }
}

function paceNoteBlocked() {
  paceRps = Math.max(PACE_MIN_RPS, Math.round(paceRps / 2));
  paceCleanSinceRamp = 0;
}

// ── Layer 3: CIRCUIT — stop hammering during a block window ───────────
// 5 upstream 403/429/503 within 10s -> circuit OPEN: every request gets
// an instant 429 (zero upstream calls, zero sleeping) for 20-60s so
// Akamai's per-IP window can clear. After the window, ONE probe request
// goes through: success closes the circuit, a block re-opens it longer.
const CB_WINDOW_MS = 10000;
const CB_FAIL_THRESHOLD = 5;
const CB_OPEN_BASE_MS = 20000;
const CB_OPEN_MAX_MS = 60000;

let cbFailStamps = [];
let cbOpenUntil = 0;
let cbOpenLevel = 0;
let cbLastTripAt = 0;
let cbProbeInFlight = false;

function cbState() { // 'open' | 'half-open' | 'closed'
  const now = Date.now();
  if (now < cbOpenUntil) return 'open';
  if (cbOpenUntil > 0) return 'half-open';
  return 'closed';
}

function cbTrip() {
  const now = Date.now();
  // Trips in quick succession escalate the cooldown: 20s, 30s, 45s, 60s.
  cbOpenLevel = (cbLastTripAt && (now - cbLastTripAt) < 60000)
    ? Math.min(3, cbOpenLevel + 1) : 0;
  cbLastTripAt = now;
  cbOpenUntil = now + Math.min(CB_OPEN_MAX_MS, Math.round(CB_OPEN_BASE_MS * Math.pow(1.5, cbOpenLevel)));
  cbFailStamps = [];
  cbProbeInFlight = false;
}

function cbNoteUpstream(status) {
  if (status !== 403 && status !== 429 && status !== 503) return;
  paceNoteBlocked();
  const now = Date.now();
  cbFailStamps.push(now);
  cbFailStamps = cbFailStamps.filter(t => now - t <= CB_WINDOW_MS);
  if (cbFailStamps.length >= CB_FAIL_THRESHOLD) cbTrip();
}

function cbNoteProbeResult(wasRateLimited) {
  cbProbeInFlight = false;
  if (!wasRateLimited) { // probe succeeded -> block cleared
    cbOpenUntil = 0;
    cbFailStamps = [];
    cbOpenLevel = 0;
    cbLastTripAt = 0;
  } else { // blocked again -> re-open, longer
    cbFailStamps = [];
    cbOpenLevel = Math.min(3, cbOpenLevel + 1);
    cbLastTripAt = Date.now();
    cbOpenUntil = Date.now() + Math.min(CB_OPEN_MAX_MS, Math.round(CB_OPEN_BASE_MS * Math.pow(1.5, cbOpenLevel)));
  }
}

// Instant 429 (Layer 2: FAST-FAIL) — the frontend sees this immediately
// and skips the symbol instead of hanging on retries/sleeps.
function rateLimitedResponse(request, message, retryAfterSec, circuitState) {
  return new Response(
    JSON.stringify({ error: message + ' (HTTP 429)', circuit: circuitState, rps: paceRps }),
    {
      status: 429,
      headers: Object.assign(
        {
          'Content-Type': 'application/json; charset=utf-8',
          'Cache-Control': 'no-store',
          'Retry-After': String(retryAfterSec || 5),
          'X-Circuit': circuitState || cbState()
        },
        buildCorsHeaders(request)
      )
    }
  );
}
async function proxyNasdaq(request, path) {
  const target = NASDAQ_ORIGIN + path;
  const MAX_ATTEMPTS = 2; // one quick retry only — no more 4x amplification
  const UPSTREAM_TIMEOUT_MS = 6000;
  let attemptsUsed = 0;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    // --- Layer 3 (pre-check): circuit open -> instant answer, no waiting ---
    if (cbState() === 'open') {
      return rateLimitedResponse(
        request,
        'Upstream circuit OPEN — NASDAQ is rate-limiting this IP; skipping to next symbol.',
        Math.max(1, Math.ceil((cbOpenUntil - Date.now()) / 1000)),
        'open'
      );
    }
    if (cbState() === 'half-open' && cbProbeInFlight) {
      return rateLimitedResponse(request, 'Upstream circuit HALF-OPEN — probe in flight; skipping.', 5, 'half-open');
    }

    // --- Layer 1: pacing — queue too deep -> fast-fail instead of hanging ---
    const maxWait = attempt === 1 ? PACE_MAX_WAIT_MS : 2000;
    const reserved = paceReserve();
    if (reserved.waitMs > maxWait) {
      paceRefund(reserved.gap); // slot not consumed — hand it back
      return rateLimitedResponse(
        request,
        'Upstream queue busy — fast-fail so the load keeps moving.',
        Math.max(1, Math.ceil(reserved.waitMs / 1000)),
        cbState() === 'closed' ? 'queued' : cbState()
      );
    }
    if (reserved.waitMs > 0) await new Promise(r => setTimeout(r, reserved.waitMs));

    // Re-check after the pacing sleep; claim the half-open probe slot
    // atomically (JS is single-threaded per isolate, so this can't race).
    if (cbState() === 'open') {
      paceRefund(reserved.gap);
      return rateLimitedResponse(request, 'Upstream circuit OPEN — skipping to next symbol.', Math.max(1, Math.ceil((cbOpenUntil - Date.now()) / 1000)), 'open');
    }
    let claimedProbe = false;
    if (cbState() === 'half-open') {
      if (cbProbeInFlight) {
        paceRefund(reserved.gap);
        return rateLimitedResponse(request, 'Upstream circuit HALF-OPEN — probe in flight; skipping.', 5, 'half-open');
      }
      cbProbeInFlight = true;
      claimedProbe = true;
    }

    // --- upstream call ---
    attemptsUsed = attempt;
    let upstream;
    try {
      upstream = await fetch(target, { headers: UPSTREAM_HEADERS, signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS) });
    } catch (e) {
      // Network error is NOT a rate-limit block — release the probe slot and retry once.
      if (claimedProbe) cbProbeInFlight = false;
      if (attempt === MAX_ATTEMPTS) {
        return jsonResponse(request, { error: 'Upstream fetch failed: ' + (e && e.message ? e.message : String(e)) }, 502);
      }
      await new Promise(r => setTimeout(r, 300 + Math.random() * 400));
      continue;
    }

    const isRate = upstream.status === 403 || upstream.status === 429 || upstream.status === 503;

    // --- record the outcome (drives pacing rate + circuit state) ---
    if (claimedProbe) {
      cbNoteProbeResult(isRate); // success closes the circuit; a block re-opens it
      if (isRate) paceNoteBlocked();
    } else if (isRate) {
      cbNoteUpstream(upstream.status);
    } else {
      paceNoteClean();
    }

    // One quick jittered retry — but never while the circuit just opened.
    if (isRate && attempt < MAX_ATTEMPTS && cbState() === 'closed') {
      await new Promise(r => setTimeout(r, 300 + Math.random() * 400));
      continue;
    }

    // Final answer to the caller (pass-through of upstream status/body).
    const text = await upstream.text();
    return new Response(text, {
      status: upstream.status,
      headers: Object.assign(
        {
          'Content-Type': upstream.headers.get('Content-Type') || 'application/json; charset=utf-8',
          'X-Retried-Attempts': String(attemptsUsed),
          'X-Circuit': cbState(),
          'X-Pace-Rps': String(paceRps)
        },
        buildCorsHeaders(request)
      )
    });
  }
  return jsonResponse(request, { error: 'Upstream kept failing after ' + MAX_ATTEMPTS + ' attempts. Retry shortly.' }, 502);
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