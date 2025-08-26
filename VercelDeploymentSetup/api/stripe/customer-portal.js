// /api/stripe/customer-portal.js
// Vercel serverless function for Stripe Customer Portal

import Stripe from 'stripe';

// Initialize Stripe with your secret key
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export default async function handler(req, res) {
  console.log('🏢 Customer Portal API called:', req.method);
  
  // Add CORS headers for multiple origins (development & production)
  const allowedOrigins = [
    'https://www.gammapace.com',
    'https://gurukullam.github.io',
    'null' // For local file:// testing
  ];
  
  const origin = req.headers.origin;
  if (allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  } else if (!origin) {
    // Allow requests with no origin (like from local files)
    res.setHeader('Access-Control-Allow-Origin', '*');
  }
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  // Handle preflight OPTIONS request
  if (req.method === 'OPTIONS') {
    console.log('✅ Handling OPTIONS preflight request');
    return res.status(200).end();
  }

  // Only allow POST requests
  if (req.method !== 'POST') {
    console.log('❌ Method not allowed:', req.method);
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    console.log('📋 Processing customer portal request...');
    console.log('Request body:', JSON.stringify(req.body, null, 2));

    const { customer_id, customer_email, return_url } = req.body;

    // Validate required fields - need either customer_id or customer_email
    if (!customer_id && !customer_email) {
      console.log('❌ Missing required fields');
      return res.status(400).json({ 
        success: false, 
        error: 'Either customer_id or customer_email is required' 
      });
    }

    let customerId = customer_id;

    // If email provided instead of ID, find the customer
    if (!customerId && customer_email) {
      console.log('🔍 Finding customer by email:', customer_email);
      
      const customers = await stripe.customers.list({
        email: customer_email,
        limit: 1
      });

      if (customers.data.length === 0) {
        console.log('❌ Customer not found:', customer_email);
        return res.status(404).json({
          success: false,
          error: 'Customer not found. Please ensure you have an active subscription.'
        });
      }

      customerId = customers.data[0].id;
      console.log('✅ Found customer:', customerId);
    }

    // Validate customer exists
    try {
      const customer = await stripe.customers.retrieve(customerId);
      console.log('✅ Customer validated:', {
        id: customer.id,
        email: customer.email,
        name: customer.name
      });
    } catch (error) {
      console.log('❌ Invalid customer ID:', customerId);
      return res.status(404).json({
        success: false,
        error: 'Customer not found. Please contact support.'
      });
    }

    // Create customer portal session
    console.log('🏢 Creating customer portal session...');
    
    const portalSession = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: return_url || 'https://www.gammapace.com',
    });

    console.log('✅ Customer portal session created:', {
      id: portalSession.id,
      customer: customerId,
      url: portalSession.url
    });

    return res.status(200).json({
      success: true,
      url: portalSession.url,
      customer_id: customerId,
      session_id: portalSession.id
    });

  } catch (error) {
    console.error('❌ Customer portal error:', error);
    
    // Handle specific Stripe errors
    if (error.type === 'StripeInvalidRequestError') {
      return res.status(400).json({
        success: false,
        error: 'Invalid customer information',
        type: 'invalid_request'
      });
    } else if (error.code === 'customer_portal_inactive') {
      return res.status(400).json({
        success: false,
        error: 'Customer portal is not activated. Please contact support.',
        type: 'portal_inactive'
      });
    } else {
      return res.status(500).json({
        success: false,
        error: 'Unable to create customer portal session',
        type: 'server_error'
      });
    }
  }
} 