// Vercel serverless function for Stripe webhook processing
// Securely handles subscription events with environment variables

const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

export default async function handler(req, res) {
    // Set CORS headers for GitHub Pages frontend
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, stripe-signature');
    
    // Handle preflight requests
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }
    
    // Only allow POST requests
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }
    
    const sig = req.headers['stripe-signature'];
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    
    let event;
    
    console.log('🔔 Webhook received:', new Date().toISOString());
    
    try {
        // Verify webhook signature
        event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
        console.log('✅ Webhook signature verified:', event.type);
    } catch (err) {
        console.error('❌ Webhook signature verification failed:', err.message);
        return res.status(400).json({ error: `Webhook signature verification failed: ${err.message}` });
    }
    
    try {
        // Handle different webhook events
        switch (event.type) {
            case 'checkout.session.completed':
                await handleCheckoutCompleted(event.data.object);
                break;
                
            case 'customer.subscription.created':
                await handleSubscriptionCreated(event.data.object);
                break;
                
            case 'customer.subscription.updated':
                await handleSubscriptionUpdated(event.data.object);
                break;
                
            case 'customer.subscription.deleted':
                await handleSubscriptionDeleted(event.data.object);
                break;
                
            case 'invoice.payment_succeeded':
                await handlePaymentSucceeded(event.data.object);
                break;
                
            case 'invoice.payment_failed':
                await handlePaymentFailed(event.data.object);
                break;
                
            default:
                console.log(`ℹ️ Unhandled event type: ${event.type}`);
        }
        
        // Return success response
        res.status(200).json({ 
            received: true, 
            event_type: event.type,
            timestamp: new Date().toISOString()
        });
        
    } catch (error) {
        console.error('❌ Webhook processing error:', error);
        res.status(500).json({ 
            error: 'Webhook processing failed',
            message: error.message 
        });
    }
}

// Handle successful checkout completion
async function handleCheckoutCompleted(session) {
    console.log('💳 Processing checkout completion:', session.id);
    
    const customerId = session.customer;
    const subscriptionId = session.subscription;
    const customerEmail = session.customer_details.email;
    
    console.log('📊 Checkout details:', {
        customer: customerId,
        subscription: subscriptionId,
        email: customerEmail,
        amount: session.amount_total,
        currency: session.currency
    });
    
    // Here you would typically update your database
    // For now, we'll log the successful payment
    console.log('✅ Subscription activated for:', customerEmail);
    
    // You can integrate with Firebase Admin SDK here to update user records
    // Example: await updateFirebaseSubscription(customerEmail, subscriptionData);
}

// Handle subscription creation
async function handleSubscriptionCreated(subscription) {
    console.log('🎯 New subscription created:', subscription.id);
    
    const customerId = subscription.customer;
    const status = subscription.status;
    const priceId = subscription.items.data[0].price.id;
    
    console.log('📈 Subscription details:', {
        id: subscription.id,
        customer: customerId,
        status: status,
        price_id: priceId,
        current_period_start: new Date(subscription.current_period_start * 1000),
        current_period_end: new Date(subscription.current_period_end * 1000)
    });
}

// Handle subscription updates
async function handleSubscriptionUpdated(subscription) {
    console.log('🔄 Subscription updated:', subscription.id);
    
    const status = subscription.status;
    const customerId = subscription.customer;
    
    console.log('📊 Updated subscription status:', {
        id: subscription.id,
        customer: customerId,
        status: status,
        cancel_at_period_end: subscription.cancel_at_period_end
    });
}

// Handle subscription cancellation
async function handleSubscriptionDeleted(subscription) {
    console.log('❌ Subscription cancelled:', subscription.id);
    
    const customerId = subscription.customer;
    
    console.log('📊 Cancelled subscription:', {
        id: subscription.id,
        customer: customerId,
        ended_at: new Date(subscription.ended_at * 1000)
    });
    
    // Update user access in your database
    console.log('🔒 Removing subscription access for customer:', customerId);
}

// Handle successful payment
async function handlePaymentSucceeded(invoice) {
    console.log('✅ Payment succeeded:', invoice.id);
    
    const subscriptionId = invoice.subscription;
    const customerId = invoice.customer;
    const amount = invoice.amount_paid;
    const currency = invoice.currency;
    
    console.log('💰 Payment details:', {
        invoice: invoice.id,
        subscription: subscriptionId,
        customer: customerId,
        amount: amount / 100, // Convert from cents
        currency: currency.toUpperCase()
    });
}

// Handle failed payment
async function handlePaymentFailed(invoice) {
    console.log('❌ Payment failed:', invoice.id);
    
    const subscriptionId = invoice.subscription;
    const customerId = invoice.customer;
    
    console.log('💸 Failed payment:', {
        invoice: invoice.id,
        subscription: subscriptionId,
        customer: customerId,
        attempt_count: invoice.attempt_count
    });
    
    // You might want to notify the customer or take other actions
} 