// /api/stripe/create-payment-intent.js
// Vercel serverless function for IELTS payment processing

import Stripe from 'stripe';

// Initialize Stripe with your secret key (from environment variables)
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export default async function handler(req, res) {
  console.log('🚀 Payment Intent API called:', req.method);
  
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
    console.log('📋 Processing payment request...');
    console.log('Request body:', JSON.stringify(req.body, null, 2));

    const {
      amount,
      currency,
      payment_method_id,
      customer_name,
      customer_email,
      plan_type,
      user_country
    } = req.body;

    // Validate required fields
    if (!amount || !currency || !payment_method_id || !customer_email) {
      console.log('❌ Missing required fields');
      return res.status(400).json({ 
        success: false, 
        error: 'Missing required fields: amount, currency, payment_method_id, customer_email' 
      });
    }

    console.log('💳 Creating/retrieving Stripe customer...');

    // Create or retrieve customer
    let customer;
    const existingCustomers = await stripe.customers.list({
      email: customer_email,
      limit: 1
    });

    if (existingCustomers.data.length > 0) {
      customer = existingCustomers.data[0];
      console.log('✅ Found existing customer:', customer.id);
    } else {
      customer = await stripe.customers.create({
        email: customer_email,
        name: customer_name || 'IELTS Student',
        metadata: {
          user_country: user_country || 'Unknown',
          plan_type: plan_type || 'monthly',
          source: 'IELTS_Practice_App'
        }
      });
      console.log('✅ Created new customer:', customer.id);
    }

    console.log('💰 Creating payment intent...');

    // Create payment intent
    const paymentIntent = await stripe.paymentIntents.create({
      amount: parseInt(amount),
      currency: currency.toLowerCase(),
      customer: customer.id,
      payment_method: payment_method_id,
      confirmation_method: 'manual',
      confirm: true,
      return_url: 'https://www.gammapace.com',
      metadata: {
        plan_type: plan_type || 'monthly',
        user_country: user_country || 'Unknown',
        customer_name: customer_name || 'IELTS Student',
        app_source: 'IELTS_Practice'
      }
    });

    console.log('📊 Payment Intent created:', {
      id: paymentIntent.id,
      status: paymentIntent.status,
      amount: paymentIntent.amount,
      currency: paymentIntent.currency
    });

    // Handle different payment statuses
    if (paymentIntent.status === 'requires_action' || paymentIntent.status === 'requires_source_action') {
      // 3D Secure authentication required
      console.log('🔐 Payment requires 3D Secure authentication');
      return res.status(200).json({
        success: false,
        requires_action: true,
        payment_intent: {
          id: paymentIntent.id,
          client_secret: paymentIntent.client_secret,
          status: paymentIntent.status
        },
        message: '3D Secure authentication required'
      });
    } else if (paymentIntent.status === 'succeeded') {
      // Payment successful
      console.log('🎉 Payment succeeded!');
      
      const subscriptionData = {
        plan_type: plan_type || 'monthly',
        start_date: new Date().toISOString(),
        end_date: calculateEndDate(new Date(), plan_type || 'monthly').toISOString()
      };

      return res.status(200).json({
        success: true,
        payment_intent: {
          id: paymentIntent.id,
          amount: paymentIntent.amount,
          currency: paymentIntent.currency,
          status: paymentIntent.status
        },
        customer: {
          id: customer.id,
          email: customer.email,
          name: customer.name
        },
        subscription_data: subscriptionData
      });
    } else {
      // Payment failed or incomplete
      console.log('❌ Payment failed:', paymentIntent.status);
      return res.status(400).json({
        success: false,
        error: 'Payment failed',
        payment_intent: {
          id: paymentIntent.id,
          status: paymentIntent.status,
          last_payment_error: paymentIntent.last_payment_error
        }
      });
    }

  } catch (error) {
    console.error('❌ Payment processing error:', error);
    
    // Handle specific Stripe errors
    if (error.type === 'StripeCardError') {
      return res.status(400).json({
        success: false,
        error: error.message,
        type: 'card_error'
      });
    } else if (error.type === 'StripeInvalidRequestError') {
      return res.status(400).json({
        success: false,
        error: 'Invalid payment request',
        type: 'invalid_request'
      });
    } else {
      return res.status(500).json({
        success: false,
        error: 'Payment processing failed',
        type: 'server_error'
      });
    }
  }
}

// Helper function to calculate subscription end date
function calculateEndDate(startDate, planType) {
  const endDate = new Date(startDate.getTime());
  
  switch (planType) {
    case 'weekly':
      endDate.setDate(endDate.getDate() + 7);
      console.log('📅 Weekly plan: +7 days');
      break;
    case 'monthly':
      endDate.setDate(endDate.getDate() + 30);
      console.log('📅 Monthly plan: +30 days');
      break;
    case 'quarterly':
      endDate.setDate(endDate.getDate() + 90);
      console.log('📅 Quarterly plan: +90 days');
      break;
    default:
      endDate.setDate(endDate.getDate() + 30); // Default to monthly
      console.log('📅 Default plan: +30 days');
  }
  
  return endDate;
} 