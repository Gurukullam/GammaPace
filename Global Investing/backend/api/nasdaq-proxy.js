// api/nasdaq-proxy.js
// Vercel Serverless Function — NASDAQ API Proxy
// CORS-enabled for GitHub Pages frontend

module.exports = async (req, res) => {
  // CORS headers — public, unauthenticated data proxy → allow any origin.
  // Sending 'Access-Control-Allow-Origin: *' is safe here because this
  // endpoint never uses cookies or credentials, and it lets the frontend
  // work from file://, any localhost port, AND GitHub Pages without re-deploys.
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed. Use POST.' });
  }

  const { path } = req.body;
  if (!path) {
    return res.status(400).json({ error: 'Missing path in request body' });
  }

  const url = `https://api.nasdaq.com${path}`;

  try {
    const fetchRes = await fetch(url, {
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });

    if (!fetchRes.ok) {
      return res.status(fetchRes.status).json({
        error: `NASDAQ API returned ${fetchRes.status}`,
        path
      });
    }

    const data = await fetchRes.json();
    return res.status(200).json(data);

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};