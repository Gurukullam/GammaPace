# Vercel Backend Integration Strategy for IELTS Payment System

## 📋 **Executive Summary**

This document outlines the strategy to migrate the IELTS payment system from GitHub Pages webhook handler to an existing Vercel backend that already has Stripe secret keys and webhooks configured.

**Current State:** GitHub Pages static webhook handler  
**Target State:** Vercel serverless backend with proper API endpoints  
**Benefits:** Better security, server-side validation, real webhook handling, scalability

---

## 🏗️ **Current Architecture Analysis**

### **Current GitHub Pages Approach:**
```javascript
// Current problematic approach in Stripe-Integration.js
const webhookUrl = 'https://gurukullam.github.io/GammaPace-SetUp/stripe-webhook-handler.html';

// Uses postMessage communication
iframe.contentWindow.postMessage({
    type: 'CREATE_PAYMENT_INTENT',
    payload: { ... }
}, 'https://gurukullam.github.io');
```

### **Issues with Current Approach:**
- ❌ No server-side processing
- ❌ Limited security (client-side only)
- ❌ Complex postMessage communication
- ❌ Cannot handle real Stripe webhooks
- ❌ CORS limitations

---

## 🎯 **Vercel Backend Integration Strategy**

### **Architecture Overview:**
```
┌─────────────────┐    HTTPS API    ┌─────────────────┐    Stripe API    ┌─────────────────┐
│   IELTS App     │ ────────────────▶│  Vercel Backend │ ─────────────────▶│   Stripe        │
│ (Custom Domain) │                  │   (Serverless)  │                   │   (Live Keys)   │
└─────────────────┘                  └─────────────────┘                   └─────────────────┘
         │                                     │                                     │
         │              Firebase               │           Webhooks                  │
         └─────────────────────────────────────┼─────────────────────────────────────┘
                                               │
                                    ┌─────────────────┐
                                    │   Firebase      │
                                    │   (User Data)   │
                                    └─────────────────┘
```

---

## 🛠️ **Implementation Plan**

### **Phase 1: Vercel API Endpoints** (Required)

Create the following API endpoints on your existing Vercel backend:

#### **1. Create Payment Intent Endpoint**
**Endpoint:** `POST /api/stripe/create-payment-intent`

```javascript
// /api/stripe/create-payment-intent.js
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export default async function handler(req, res) {
  // Add CORS headers for your custom domain
  res.setHeader('Access-Control-Allow-Origin', 'https://your-custom-domain.com');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
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
      return res.status(400).json({ 
        success: false, 
        error: 'Missing required fields' 
      });
    }

    // Create or retrieve customer
    let customer;
    const existingCustomers = await stripe.customers.list({
      email: customer_email,
      limit: 1
    });

    if (existingCustomers.data.length > 0) {
      customer = existingCustomers.data[0];
    } else {
      customer = await stripe.customers.create({
        email: customer_email,
        name: customer_name,
        metadata: {
          user_country: user_country,
          plan_type: plan_type,
          source: 'IELTS_App'
        }
      });
    }

    // Create payment intent
    const paymentIntent = await stripe.paymentIntents.create({
      amount: amount,
      currency: currency.toLowerCase(),
      customer: customer.id,
      payment_method: payment_method_id,
      confirmation_method: 'manual',
      confirm: true,
      return_url: 'https://your-custom-domain.com/payment-success',
      metadata: {
        plan_type: plan_type,
        user_country: user_country,
        customer_name: customer_name
      }
    });

    // Handle different payment statuses
    if (paymentIntent.status === 'requires_action' || paymentIntent.status === 'requires_source_action') {
      // 3D Secure authentication required
      return res.status(200).json({
        success: false,
        requires_action: true,
        payment_intent: {
          id: paymentIntent.id,
          client_secret: paymentIntent.client_secret,
          status: paymentIntent.status
        }
      });
    } else if (paymentIntent.status === 'succeeded') {
      // Payment successful
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
          email: customer.email
        },
        subscription_data: {
          plan_type: plan_type,
          start_date: new Date().toISOString(),
          end_date: calculateEndDate(new Date(), plan_type).toISOString()
        }
      });
    } else {
      // Payment failed
      return res.status(400).json({
        success: false,
        error: 'Payment failed',
        payment_intent: paymentIntent
      });
    }

  } catch (error) {
    console.error('Payment processing error:', error);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

function calculateEndDate(startDate, planType) {
  const endDate = new Date(startDate);
  switch (planType) {
    case 'weekly':
      endDate.setDate(endDate.getDate() + 7);
      break;
    case 'monthly':
      endDate.setDate(endDate.getDate() + 30);
      break;
    case 'quarterly':
      endDate.setDate(endDate.getDate() + 90);
      break;
    default:
      endDate.setDate(endDate.getDate() + 30);
  }
  return endDate;
}
```

#### **2. Stripe Webhook Endpoint**
**Endpoint:** `POST /api/stripe/webhook`

```javascript
// /api/stripe/webhook.js
import Stripe from 'stripe';
import { buffer } from 'micro';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

export const config = {
  api: {
    bodyParser: false,
  },
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).end();
  }

  const buf = await buffer(req);
  const sig = req.headers['stripe-signature'];

  let event;

  try {
    event = stripe.webhooks.constructEvent(buf, sig, webhookSecret);
  } catch (err) {
    console.log('Webhook signature verification failed.', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // Handle the event
  switch (event.type) {
    case 'payment_intent.succeeded':
      const paymentIntent = event.data.object;
      console.log('Payment succeeded:', paymentIntent.id);
      
      // Update your database (Firebase) here
      await updateFirebaseSubscription(paymentIntent);
      break;
    
    case 'customer.subscription.created':
      const subscription = event.data.object;
      console.log('Subscription created:', subscription.id);
      break;
    
    case 'customer.subscription.deleted':
      const deletedSubscription = event.data.object;
      console.log('Subscription cancelled:', deletedSubscription.id);
      break;

    default:
      console.log(`Unhandled event type ${event.type}`);
  }

  res.json({ received: true });
}

async function updateFirebaseSubscription(paymentIntent) {
  // Implementation depends on your Firebase setup
  // This would update the user's subscription status in Firebase
  console.log('Updating Firebase for payment:', paymentIntent.id);
}
```

#### **3. Customer Portal Endpoint**
**Endpoint:** `POST /api/stripe/customer-portal`

```javascript
// /api/stripe/customer-portal.js
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', 'https://your-custom-domain.com');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { customer_id, return_url } = req.body;

    if (!customer_id) {
      return res.status(400).json({ error: 'Customer ID required' });
    }

    const session = await stripe.billingPortal.sessions.create({
      customer: customer_id,
      return_url: return_url || 'https://your-custom-domain.com'
    });

    return res.status(200).json({
      success: true,
      url: session.url
    });

  } catch (error) {
    console.error('Customer portal error:', error);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
}
```

---

## 🔧 **Frontend Code Modifications**

### **Phase 2: Update Stripe-Integration.js**

Replace the complex postMessage communication with simple HTTPS API calls:

```javascript
/**
 * Process real Stripe payment using Vercel backend
 */
async function processRealStripePayment(paymentMethod, plan, customerName, customerEmail) {
    console.log('🚀 Processing REAL Stripe payment via Vercel backend...');
    
    // Get user country for payment processing
    let userCountry = 'Unknown';
    try {
        if (auth.currentUser) {
            const userDoc = await db.collection('users').doc(auth.currentUser.uid).get();
            if (userDoc.exists) {
                userCountry = userDoc.data().Country || 'Unknown';
            }
        }
    } catch (error) {
        console.warn('⚠️ Could not get user country, proceeding with Unknown');
    }
    
    // Determine plan type from plan data
    const planType = Object.keys(SUBSCRIPTION_PLANS).find(key => 
        SUBSCRIPTION_PLANS[key].amount === plan.originalAmount || 
        SUBSCRIPTION_PLANS[key].amount === plan.amount
    ) || 'monthly';
    
    console.log('🔄 Calling Vercel backend to process real payment...');
    
    try {
        // Call Vercel backend API
        const response = await fetch('https://your-vercel-app.vercel.app/api/stripe/create-payment-intent', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                amount: plan.amount,
                currency: plan.currency,
                payment_method_id: paymentMethod.id,
                customer_name: customerName,
                customer_email: customerEmail,
                plan_type: planType,
                user_country: userCountry
            })
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const paymentResponse = await response.json();
        console.log('✅ Vercel backend response:', paymentResponse);
        
        if (paymentResponse.success) {
            console.log('🎉 Payment processed successfully!', {
                paymentIntentId: paymentResponse.payment_intent.id,
                customerId: paymentResponse.customer.id,
                amountCharged: `${(paymentResponse.payment_intent.amount / 100).toFixed(2)} ${paymentResponse.payment_intent.currency.toUpperCase()}`,
                subscriptionData: paymentResponse.subscription_data
            });
            
            return { 
                paymentIntent: paymentResponse.payment_intent, 
                subscriptionData: paymentResponse.subscription_data,
                customerId: paymentResponse.customer.id
            };
            
        } else if (paymentResponse.requires_action) {
            console.log('🔐 Payment requires additional authentication (3D Secure)');
            
            // Handle 3D Secure authentication
            const {error, paymentIntent: confirmedPaymentIntent} = await stripe.confirmCardPayment(
                paymentResponse.payment_intent.client_secret
            );
            
            if (error) {
                throw new Error(`3D Secure authentication failed: ${error.message}`);
            }
            
            if (confirmedPaymentIntent.status === 'succeeded') {
                console.log('✅ 3D Secure authentication successful, payment completed!');
                return { 
                    paymentIntent: confirmedPaymentIntent,
                    subscriptionData: paymentResponse.subscription_data,
                    customerId: paymentResponse.customer.id  
                };
            } else {
                throw new Error('Payment authentication incomplete');
            }
            
        } else {
            throw new Error(paymentResponse.error || 'Payment processing failed');
        }
        
    } catch (error) {
        console.error('❌ Vercel backend payment processing failed:', error);
        
        // Provide user-friendly error messages
        if (error.message.includes('card_declined')) {
            throw new Error('Your card was declined. Please try a different payment method.');
        } else if (error.message.includes('insufficient_funds')) {
            throw new Error('Insufficient funds. Please check your account balance.');
        } else if (error.message.includes('expired_card')) {
            throw new Error('Your card has expired. Please use a different payment method.');
        } else if (error.message.includes('invalid_cvc')) {
            throw new Error('Invalid security code. Please check your CVC and try again.');
        } else {
            throw new Error(`Payment failed: ${error.message}`);
        }
    }
}

/**
 * Open Stripe Customer Portal via Vercel backend
 */
async function openStripeCustomerPortal() {
    try {
        console.log('🔄 Opening Stripe Customer Portal via Vercel backend...');
        
        if (!auth.currentUser) {
            alert('Please sign in to manage your subscription');
            return;
        }

        // Get customer ID from Firebase or localStorage
        let customerId = null;
        try {
            const userDoc = await db.collection('users').doc(auth.currentUser.uid).get();
            if (userDoc.exists) {
                customerId = userDoc.data().Stripe_Customer_ID;
            }
        } catch (error) {
            console.error('Error getting customer ID:', error);
        }

        if (!customerId) {
            alert('No subscription found. Please subscribe first.');
            return;
        }

        // Call Vercel backend to create portal session
        const response = await fetch('https://your-vercel-app.vercel.app/api/stripe/customer-portal', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                customer_id: customerId,
                return_url: window.location.href
            })
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const result = await response.json();
        
        if (result.success) {
            // Redirect to customer portal
            window.location.href = result.url;
        } else {
            throw new Error(result.error);
        }
        
    } catch (error) {
        console.error('❌ Error opening customer portal:', error);
        alert('Unable to open customer portal. Please try again later.');
    }
}
```

---

## ⚙️ **Configuration Requirements**

### **Environment Variables (Vercel)**
```bash
# Add to your Vercel dashboard or .env.local
STRIPE_SECRET_KEY=sk_live_your_secret_key_here
STRIPE_WEBHOOK_SECRET=whsec_your_webhook_secret_here
FIREBASE_PROJECT_ID=your_firebase_project_id
```

### **Vercel Deployment Configuration**
```json
// vercel.json
{
  "functions": {
    "api/stripe/*.js": {
      "maxDuration": 10
    }
  },
  "headers": [
    {
      "source": "/api/(.*)",
      "headers": [
        {
          "key": "Access-Control-Allow-Origin",
          "value": "https://your-custom-domain.com"
        },
        {
          "key": "Access-Control-Allow-Methods",
          "value": "GET, POST, PUT, DELETE, OPTIONS"
        },
        {
          "key": "Access-Control-Allow-Headers",
          "value": "Content-Type, Authorization"
        }
      ]
    }
  ]
}
```

---

## 🔐 **Security Considerations**

### **1. CORS Configuration**
- ✅ Whitelist only your custom domain
- ✅ Restrict HTTP methods to required ones
- ✅ Validate request origins

### **2. Input Validation**
- ✅ Validate all incoming payment data
- ✅ Sanitize user inputs
- ✅ Check amount limits and currencies

### **3. Rate Limiting**
- ✅ Implement rate limiting on payment endpoints
- ✅ Protect against brute force attacks
- ✅ Monitor for suspicious activity

### **4. Error Handling**
- ✅ Never expose internal errors to client
- ✅ Log all payment attempts
- ✅ Implement proper error responses

---

## 🧪 **Testing Strategy**

### **Phase 3: Testing Plan**

#### **1. Unit Tests**
```javascript
// Test payment intent creation
describe('Create Payment Intent', () => {
  test('should create payment intent successfully', async () => {
    const response = await fetch('/api/stripe/create-payment-intent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        amount: 999,
        currency: 'cad',
        payment_method_id: 'pm_test_visa',
        customer_email: 'test@example.com',
        customer_name: 'Test User',
        plan_type: 'weekly'
      })
    });
    
    expect(response.ok).toBe(true);
    const result = await response.json();
    expect(result.success).toBe(true);
  });
});
```

#### **2. Integration Tests**
- ✅ Test complete payment flow
- ✅ Test 3D Secure authentication
- ✅ Test webhook processing
- ✅ Test customer portal access

#### **3. End-to-End Tests**
- ✅ Test from frontend to backend
- ✅ Test Firebase integration
- ✅ Test currency conversion
- ✅ Test subscription management

---

## 🚀 **Deployment Process**

### **Step 1: Vercel Backend**
1. Deploy API endpoints to your existing Vercel app
2. Configure environment variables
3. Test API endpoints manually

### **Step 2: Frontend Updates**
1. Update Stripe-Integration.js with new API calls
2. Update your custom domain in CORS settings
3. Test payment flow on staging

### **Step 3: DNS & Domain**
1. Configure your custom domain
2. Update CNAME file if needed
3. Wait for DNS propagation

### **Step 4: Stripe Dashboard**
1. Update webhook URL to point to Vercel: `https://your-vercel-app.vercel.app/api/stripe/webhook`
2. Test webhook delivery
3. Verify payment processing

---

## 📊 **Benefits of Vercel Integration**

### **Technical Benefits:**
- ✅ **Real server-side processing**
- ✅ **Proper webhook handling**
- ✅ **Better security and validation**
- ✅ **Simplified API communication**
- ✅ **Auto-scaling and performance**

### **Business Benefits:**
- ✅ **More reliable payments**
- ✅ **Better error handling**
- ✅ **Easier maintenance**
- ✅ **Enhanced monitoring**
- ✅ **PCI compliance ready**

---

## 🔄 **Migration Timeline**

### **Phase 1: Backend Setup (1-2 days)**
- [ ] Create Vercel API endpoints
- [ ] Test endpoints individually
- [ ] Configure environment variables

### **Phase 2: Frontend Integration (1-2 days)**
- [ ] Update Stripe-Integration.js
- [ ] Test payment flow
- [ ] Update error handling

### **Phase 3: Deployment & Testing (1-2 days)**
- [ ] Deploy to production
- [ ] Configure DNS and domain
- [ ] End-to-end testing

### **Phase 4: Go Live (1 day)**
- [ ] Switch DNS to custom domain
- [ ] Monitor payment processing
- [ ] Final verification

---

## 🆘 **Troubleshooting Guide**

### **Common Issues & Solutions:**

#### **1. CORS Errors**
```bash
Error: Access to fetch at 'vercel-app.vercel.app' from origin 'your-domain.com' has been blocked by CORS policy
```
**Solution:** Update CORS headers in Vercel API endpoints

#### **2. Webhook Signature Verification Failed**
```bash
Webhook Error: Invalid signature
```
**Solution:** Verify STRIPE_WEBHOOK_SECRET in Vercel environment variables

#### **3. Payment Intent Creation Failed**
```bash
Error: Missing required parameter: customer
```
**Solution:** Ensure customer creation or retrieval before payment intent

#### **4. Firebase Authentication Issues**
```bash
Firebase: Error (auth/unauthorized-domain)
```
**Solution:** Add custom domain to Firebase authorized domains

---

## 📞 **Support & Maintenance**

### **Monitoring:**
- Monitor Vercel function logs
- Track payment success rates
- Monitor Firebase database updates
- Set up alerts for payment failures

### **Maintenance Tasks:**
- Regular security updates
- Monitor Stripe Dashboard
- Review error logs
- Update rate limits as needed

---

## 🎯 **Next Steps**

1. **Review this strategy document**
2. **Set up Vercel API endpoints**
3. **Update frontend code**
4. **Test thoroughly**
5. **Deploy to production**

**Questions or need clarification on any part of this strategy?** 