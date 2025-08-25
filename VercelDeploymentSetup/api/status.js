// /api/status.js
// Simple status endpoint to verify API is working

export default async function handler(req, res) {
  // Add CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const status = {
    status: 'OK',
    message: 'IELTS Stripe Backend API is running',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
    endpoints: {
      payment: '/api/stripe/create-payment-intent',
      webhook: '/api/stripe/webhook',
      portal: '/api/stripe/customer-portal'
    },
    environment: {
      node_version: process.version,
      stripe_configured: !!process.env.STRIPE_SECRET_KEY,
      webhook_configured: !!process.env.STRIPE_WEBHOOK_SECRET
    }
  };

  res.status(200).json(status);
} 