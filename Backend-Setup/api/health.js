// Health check endpoint for Vercel backend monitoring

export default async function handler(req, res) {
    // Set CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    
    // Handle preflight requests
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }
    
    // Only allow GET requests
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }
    
    const healthStatus = {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        service: 'GammaPace Backend API',
        version: '1.0.0',
        environment: process.env.NODE_ENV || 'development',
        endpoints: {
            webhook: '/api/stripe/webhook',
            payment_intent: '/api/stripe/create-payment-intent',
            health: '/api/health'
        },
        stripe: {
            configured: !!process.env.STRIPE_SECRET_KEY,
            webhook_configured: !!process.env.STRIPE_WEBHOOK_SECRET
        }
    };
    
    console.log('🔍 Health check requested:', healthStatus);
    
    res.status(200).json(healthStatus);
} 