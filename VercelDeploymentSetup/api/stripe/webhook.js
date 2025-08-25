// /api/stripe/webhook.js
// Vercel serverless function for handling Stripe webhooks

import Stripe from 'stripe';
import { buffer } from 'micro';

// Initialize Stripe with your secret key
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

// Disable body parser for webhook signature verification
export const config = {
  api: {
    bodyParser: false,
  },
};

export default async function handler(req, res) {
  console.log('🔗 Stripe Webhook called:', req.method);
  
  if (req.method !== 'POST') {
    console.log('❌ Method not allowed for webhook:', req.method);
    return res.status(405).end();
  }

  try {
    // Get the raw body for signature verification
    const buf = await buffer(req);
    const sig = req.headers['stripe-signature'];

    if (!sig) {
      console.log('❌ Missing Stripe signature');
      return res.status(400).send('Missing Stripe signature');
    }

    if (!webhookSecret) {
      console.log('❌ Missing webhook secret in environment variables');
      return res.status(500).send('Webhook secret not configured');
    }

    let event;

    try {
      // Verify webhook signature
      event = stripe.webhooks.constructEvent(buf, sig, webhookSecret);
      console.log('✅ Webhook signature verified:', event.type);
    } catch (err) {
      console.log('❌ Webhook signature verification failed:', err.message);
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    // Handle the event
    console.log('📨 Processing webhook event:', event.type);
    console.log('Event data:', JSON.stringify(event.data, null, 2));

    switch (event.type) {
      case 'payment_intent.succeeded':
        const paymentIntent = event.data.object;
        console.log('🎉 Payment succeeded:', paymentIntent.id);
        console.log('Customer:', paymentIntent.customer);
        console.log('Amount:', paymentIntent.amount, paymentIntent.currency);
        
        // Here you could update Firebase with subscription data
        await handlePaymentSuccess(paymentIntent);
        break;
      
      case 'payment_intent.payment_failed':
        const failedPayment = event.data.object;
        console.log('❌ Payment failed:', failedPayment.id);
        console.log('Error:', failedPayment.last_payment_error?.message);
        
        await handlePaymentFailed(failedPayment);
        break;
      
      case 'customer.subscription.created':
        const subscription = event.data.object;
        console.log('📋 Subscription created:', subscription.id);
        console.log('Customer:', subscription.customer);
        console.log('Status:', subscription.status);
        
        await handleSubscriptionCreated(subscription);
        break;
      
      case 'customer.subscription.updated':
        const updatedSubscription = event.data.object;
        console.log('🔄 Subscription updated:', updatedSubscription.id);
        console.log('Status:', updatedSubscription.status);
        
        await handleSubscriptionUpdated(updatedSubscription);
        break;
      
      case 'customer.subscription.deleted':
        const deletedSubscription = event.data.object;
        console.log('🗑️ Subscription cancelled:', deletedSubscription.id);
        console.log('Customer:', deletedSubscription.customer);
        
        await handleSubscriptionCancelled(deletedSubscription);
        break;
      
      case 'invoice.payment_succeeded':
        const invoice = event.data.object;
        console.log('💰 Invoice paid:', invoice.id);
        console.log('Customer:', invoice.customer);
        console.log('Amount:', invoice.amount_paid, invoice.currency);
        
        await handleInvoicePayment(invoice);
        break;
      
      case 'invoice.payment_failed':
        const failedInvoice = event.data.object;
        console.log('❌ Invoice payment failed:', failedInvoice.id);
        console.log('Customer:', failedInvoice.customer);
        
        await handleInvoicePaymentFailed(failedInvoice);
        break;

      default:
        console.log(`ℹ️ Unhandled event type: ${event.type}`);
    }

    // Always respond with 200 to acknowledge receipt
    res.json({ received: true, event_type: event.type });

  } catch (error) {
    console.error('❌ Webhook processing error:', error);
    return res.status(500).send('Webhook processing failed');
  }
}

// Handler functions for different webhook events
async function handlePaymentSuccess(paymentIntent) {
  console.log('🎯 Processing successful payment...');
  
  try {
    // Extract metadata
    const planType = paymentIntent.metadata?.plan_type || 'monthly';
    const customerName = paymentIntent.metadata?.customer_name || 'IELTS Student';
    const userCountry = paymentIntent.metadata?.user_country || 'Unknown';
    
    // Here you would update Firebase with subscription data
    // For now, just log the information
    console.log('📊 Payment success details:', {
      paymentIntentId: paymentIntent.id,
      customerId: paymentIntent.customer,
      amount: paymentIntent.amount,
      currency: paymentIntent.currency,
      planType: planType,
      customerName: customerName,
      userCountry: userCountry
    });
    
    // TODO: Implement Firebase update logic here
    // await updateFirebaseSubscription(paymentIntent);
    
  } catch (error) {
    console.error('❌ Error handling payment success:', error);
  }
}

async function handlePaymentFailed(paymentIntent) {
  console.log('⚠️ Processing failed payment...');
  
  try {
    console.log('📊 Payment failure details:', {
      paymentIntentId: paymentIntent.id,
      customerId: paymentIntent.customer,
      error: paymentIntent.last_payment_error?.message,
      code: paymentIntent.last_payment_error?.code
    });
    
    // TODO: Implement failure notification logic here
    // You might want to send an email or update user status
    
  } catch (error) {
    console.error('❌ Error handling payment failure:', error);
  }
}

async function handleSubscriptionCreated(subscription) {
  console.log('📋 Processing subscription creation...');
  
  try {
    console.log('📊 Subscription creation details:', {
      subscriptionId: subscription.id,
      customerId: subscription.customer,
      status: subscription.status,
      currentPeriodStart: new Date(subscription.current_period_start * 1000).toISOString(),
      currentPeriodEnd: new Date(subscription.current_period_end * 1000).toISOString()
    });
    
    // TODO: Update Firebase with subscription information
    
  } catch (error) {
    console.error('❌ Error handling subscription creation:', error);
  }
}

async function handleSubscriptionUpdated(subscription) {
  console.log('🔄 Processing subscription update...');
  
  try {
    console.log('📊 Subscription update details:', {
      subscriptionId: subscription.id,
      customerId: subscription.customer,
      status: subscription.status,
      cancelAtPeriodEnd: subscription.cancel_at_period_end
    });
    
    // TODO: Update Firebase with subscription changes
    
  } catch (error) {
    console.error('❌ Error handling subscription update:', error);
  }
}

async function handleSubscriptionCancelled(subscription) {
  console.log('🗑️ Processing subscription cancellation...');
  
  try {
    console.log('📊 Subscription cancellation details:', {
      subscriptionId: subscription.id,
      customerId: subscription.customer,
      cancelledAt: new Date(subscription.canceled_at * 1000).toISOString(),
      endedAt: subscription.ended_at ? new Date(subscription.ended_at * 1000).toISOString() : null
    });
    
    // TODO: Update Firebase to reflect subscription cancellation
    
  } catch (error) {
    console.error('❌ Error handling subscription cancellation:', error);
  }
}

async function handleInvoicePayment(invoice) {
  console.log('💰 Processing invoice payment...');
  
  try {
    console.log('📊 Invoice payment details:', {
      invoiceId: invoice.id,
      customerId: invoice.customer,
      subscriptionId: invoice.subscription,
      amountPaid: invoice.amount_paid,
      currency: invoice.currency
    });
    
    // TODO: Update Firebase with payment confirmation
    
  } catch (error) {
    console.error('❌ Error handling invoice payment:', error);
  }
}

async function handleInvoicePaymentFailed(invoice) {
  console.log('❌ Processing invoice payment failure...');
  
  try {
    console.log('📊 Invoice payment failure details:', {
      invoiceId: invoice.id,
      customerId: invoice.customer,
      subscriptionId: invoice.subscription,
      attemptCount: invoice.attempt_count
    });
    
    // TODO: Handle payment failure (retry, notify, suspend service, etc.)
    
  } catch (error) {
    console.error('❌ Error handling invoice payment failure:', error);
  }
} 