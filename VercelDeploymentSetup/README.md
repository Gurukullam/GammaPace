# 🚀 IELTS Stripe Backend - Vercel Deployment

A serverless backend for processing IELTS subscription payments using Stripe, designed for deployment on Vercel.

## 📋 **Quick Deployment (5 minutes)**

### **1. Clone & Deploy**
```bash
# Option A: Create new GitHub repo from this folder
# 1. Upload this entire VercelDeploymentSetup folder to GitHub
# 2. Create new repository: VercelDeploymentSetup
# 3. Connect to Vercel

# Option B: Deploy directly with Vercel CLI
npm install -g vercel
vercel login
vercel deploy --prod
```

### **2. Configure Environment Variables**
In Vercel Dashboard → Settings → Environment Variables, add:

```bash
# Required Environment Variables:
STRIPE_SECRET_KEY=sk_live_your_secret_key_here
STRIPE_WEBHOOK_SECRET=whsec_your_webhook_secret_here
```

**Where to get these:**
- **STRIPE_SECRET_KEY**: Stripe Dashboard → Developers → API keys → Secret key
- **STRIPE_WEBHOOK_SECRET**: Stripe Dashboard → Webhooks → [Your webhook] → Signing secret

### **3. Update Stripe Webhook URL**
1. Go to [Stripe Dashboard > Webhooks](https://dashboard.stripe.com/webhooks)
2. Update webhook URL to: `https://your-vercel-app.vercel.app/api/stripe/webhook`
3. Select events: `payment_intent.succeeded`, `payment_intent.payment_failed`

### **4. Test Deployment**
```bash
# Test status endpoint
curl https://your-vercel-app.vercel.app/api/status

# Expected response:
{
  "status": "OK",
  "message": "IELTS Stripe Backend API is running",
  "stripe_configured": true,
  "webhook_configured": true
}
```

---

## 🛠️ **API Endpoints**

### **Payment Processing**
```bash
POST /api/stripe/create-payment-intent
```
**Request:**
```json
{
  "amount": 2499,
  "currency": "cad",
  "payment_method_id": "pm_...",
  "customer_email": "user@example.com",
  "customer_name": "John Doe",
  "plan_type": "monthly",
  "user_country": "CA"
}
```

**Response:**
```json
{
  "success": true,
  "payment_intent": {
    "id": "pi_...",
    "amount": 2499,
    "currency": "cad",
    "status": "succeeded"
  },
  "customer": {
    "id": "cus_...",
    "email": "user@example.com"
  },
  "subscription_data": {
    "plan_type": "monthly",
    "start_date": "2024-01-01T00:00:00.000Z",
    "end_date": "2024-01-31T00:00:00.000Z"
  }
}
```

### **Webhook Handler**
```bash
POST /api/stripe/webhook
```
Handles Stripe webhook events for payment confirmations and subscription updates.

### **Customer Portal**
```bash
POST /api/stripe/customer-portal
```
**Request:**
```json
{
  "customer_id": "cus_...",
  "customer_email": "user@example.com",
  "return_url": "https://guruvammal.com"
}
```

**Response:**
```json
{
  "success": true,
  "url": "https://billing.stripe.com/session/...",
  "customer_id": "cus_...",
  "session_id": "bps_..."
}
```

---

## 🧪 **Testing**

### **Test Payment Processing**
```bash
curl -X POST https://your-vercel-app.vercel.app/api/stripe/create-payment-intent \
  -H "Content-Type: application/json" \
  -d '{
    "amount": 999,
    "currency": "cad",
    "payment_method_id": "pm_card_visa",
    "customer_email": "test@example.com",
    "customer_name": "Test User",
    "plan_type": "weekly"
  }'
```

### **Test Webhook**
In Stripe Dashboard → Webhooks → Send test webhook

### **Monitor Logs**
```bash
# View real-time logs
vercel logs --follow

# View specific function logs
vercel logs api/stripe/create-payment-intent
```

---

## 🔧 **Local Development**

```bash
# Install dependencies
npm install

# Start local development server
npm run dev

# Test local endpoints
curl http://localhost:3000/api/status
```

---

## 📊 **Frontend Integration**

Update your frontend `Stripe-Integration.js` to use your Vercel backend:

```javascript
// Replace this URL with your actual Vercel deployment
const vercelApiUrl = 'https://your-vercel-app.vercel.app/api/stripe/create-payment-intent';

// Example payment processing
const response = await fetch(vercelApiUrl, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
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

const result = await response.json();
if (result.success) {
  // Payment successful!
  console.log('Payment processed:', result.payment_intent.id);
}
```

---

## 🔐 **Security Features**

- ✅ **CORS Protection** - Configurable allowed origins
- ✅ **Webhook Signature Verification** - Validates Stripe signatures
- ✅ **Input Validation** - Validates all incoming data
- ✅ **Error Handling** - Comprehensive error responses
- ✅ **Environment Variables** - Secure key management

---

## 🚀 **Production Checklist**

- [ ] Environment variables configured in Vercel
- [ ] Stripe webhook URL updated to Vercel deployment
- [ ] Live Stripe keys configured (not test keys)
- [ ] CORS origins updated to your domain
- [ ] Webhook events configured in Stripe Dashboard
- [ ] Customer portal activated in Stripe Dashboard
- [ ] Payment flows tested end-to-end

---

## 🆘 **Troubleshooting**

### **Common Issues**

#### **1. CORS Errors**
```javascript
// Update CORS in vercel.json or individual API files
res.setHeader('Access-Control-Allow-Origin', 'https://your-domain.com');
```

#### **2. Webhook Signature Verification Failed**
- Verify `STRIPE_WEBHOOK_SECRET` in Vercel environment variables
- Check webhook URL in Stripe Dashboard
- Ensure webhook events are selected

#### **3. Payment Processing Fails**
- Check `STRIPE_SECRET_KEY` is configured
- Verify live keys (not test keys) for production
- Check Vercel function logs: `vercel logs --follow`

#### **4. Customer Portal Inactive**
- Enable customer portal in Stripe Dashboard → Settings → Billing → Customer portal

### **Debug Commands**
```bash
# Check deployment status
vercel ls

# View function logs
vercel logs api/stripe/create-payment-intent --follow

# Test environment variables
curl https://your-vercel-app.vercel.app/api/status
```

---

## 📞 **Support**

- **Vercel Logs**: `vercel logs --follow`
- **Stripe Dashboard**: [https://dashboard.stripe.com/](https://dashboard.stripe.com/)
- **Vercel Dashboard**: [https://vercel.com/dashboard](https://vercel.com/dashboard)

---

## 📁 **Project Structure**

```
VercelDeploymentSetup/
├── api/
│   ├── stripe/
│   │   ├── create-payment-intent.js  # Payment processing
│   │   ├── webhook.js               # Webhook handler
│   │   └── customer-portal.js       # Customer portal
│   └── status.js                    # Status endpoint
├── package.json                     # Dependencies
├── vercel.json                      # Vercel configuration
└── README.md                        # This file
```

---

## 🎯 **Next Steps**

1. **Deploy this backend** to Vercel
2. **Get your Vercel app URL** (e.g., `https://your-app.vercel.app`)
3. **Update your frontend** `Stripe-Integration.js` with the Vercel URL
4. **Test the complete payment flow**
5. **Go live** with your custom domain!

**Ready to deploy?** 🚀 