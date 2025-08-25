# 🏗️ IELTS Payment System Architecture

## 📋 **System Overview**

This is a **distributed architecture** separating frontend and backend concerns for optimal performance and security.

```
┌─────────────────────────┐    HTTPS API Calls    ┌─────────────────────────┐
│   FRONTEND              │ ──────────────────────▶│   BACKEND               │
│   GitHub Pages          │                        │   Vercel Serverless     │
│   www.gammapace.com     │                        │   your-app.vercel.app   │
│                         │                        │                         │
│ • IELTS Practice App    │◀──────────────────────│ • Stripe API Processing │
│ • Stripe.js (Frontend)  │    JSON Responses      │ • Payment Intents       │
│ • User Interface        │                        │ • Webhook Handling      │
│ • Firebase Auth         │                        │ • Customer Portal       │
└─────────────────────────┘                        └─────────────────────────┘
```

---

## 🎯 **Architecture Benefits**

### **✅ Separation of Concerns**
- **Frontend**: User interface, client-side logic
- **Backend**: Payment processing, sensitive operations

### **✅ Security**
- **Stripe secrets never exposed** to frontend
- **Server-side validation** of all payments
- **Webhook signature verification** 

### **✅ Scalability**
- **Frontend**: Static hosting (fast, global CDN)
- **Backend**: Auto-scaling serverless functions

### **✅ Cost Efficiency**
- **GitHub Pages**: Free static hosting
- **Vercel**: Pay-per-request serverless functions

---

## 🌐 **Domain Configuration**

### **Frontend Domain**
- **Primary**: `https://www.gammapace.com`
- **Hosting**: GitHub Pages
- **Content**: IELTS Practice App

### **Backend Domain**
- **API Base**: `https://your-vercel-app.vercel.app`
- **Hosting**: Vercel
- **Content**: Stripe API endpoints

---

## 🔗 **Integration Points**

### **1. Payment Processing**
```javascript
// Frontend calls backend
fetch('https://your-vercel-app.vercel.app/api/stripe/create-payment-intent', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    amount: 2499,
    currency: 'cad',
    payment_method_id: 'pm_...',
    customer_email: 'user@example.com'
  })
})
```

### **2. Customer Portal**
```javascript  
// Frontend calls backend for portal access
fetch('https://your-vercel-app.vercel.app/api/stripe/customer-portal', {
  method: 'POST',
  body: JSON.stringify({
    customer_email: 'user@example.com',
    return_url: 'https://www.gammapace.com'
  })
})
```

### **3. Webhook Processing**
```
Stripe ──▶ https://your-vercel-app.vercel.app/api/stripe/webhook
       └─▶ Updates Firebase with subscription data
```

---

## 📊 **Data Flow**

### **Payment Flow**
1. **User** visits `www.gammapace.com`
2. **Frontend** collects payment details with Stripe.js
3. **Frontend** calls Vercel backend API
4. **Backend** processes payment with Stripe
5. **Backend** returns success/failure to frontend
6. **Frontend** updates UI and redirects user

### **Webhook Flow**
1. **Stripe** sends webhook to Vercel backend
2. **Backend** verifies webhook signature
3. **Backend** processes event (payment success, failure, etc.)
4. **Backend** updates Firebase database
5. **Frontend** reflects updated subscription status

---

## 🛠️ **Configuration Requirements**

### **Frontend (GitHub Pages)**
- Custom domain: `www.gammapace.com`
- Update `Stripe-Integration.js` with Vercel backend URLs
- Ensure HTTPS is enabled

### **Backend (Vercel)**
- Environment variables: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`
- CORS configured for `https://www.gammapace.com`
- Webhook URL configured in Stripe Dashboard

### **Stripe Dashboard**
- Webhook endpoint: `https://your-vercel-app.vercel.app/api/stripe/webhook`
- Allowed domains: `www.gammapace.com`
- Customer portal activated

---

## 🔐 **Security Considerations**

### **CORS Protection**
```javascript
// Backend only accepts requests from www.gammapace.com
res.setHeader('Access-Control-Allow-Origin', 'https://www.gammapace.com');
```

### **Webhook Verification**
```javascript
// Backend verifies all webhooks from Stripe
const event = stripe.webhooks.constructEvent(buf, sig, webhookSecret);
```

### **Input Validation**
```javascript
// Backend validates all incoming data
if (!amount || !currency || !payment_method_id || !customer_email) {
  return res.status(400).json({ error: 'Missing required fields' });
}
```

---

## 🚀 **Deployment Process**

### **Step 1: Deploy Backend**
1. Upload `VercelDeploymentSetup` to GitHub
2. Connect to Vercel and deploy
3. Configure environment variables

### **Step 2: Configure Frontend**
1. Update `Stripe-Integration.js` with Vercel URLs
2. Deploy to GitHub Pages
3. Configure custom domain `www.gammapace.com`

### **Step 3: Configure Stripe**
1. Update webhook URL to Vercel backend
2. Test webhook delivery
3. Verify payment processing

---

## 🧪 **Testing Strategy**

### **Integration Testing**
```bash
# Test backend API
curl https://your-vercel-app.vercel.app/api/status

# Test frontend → backend communication
# Visit www.gammapace.com and try to subscribe
```

### **End-to-End Testing**
1. Visit `www.gammapace.com`
2. Select subscription plan
3. Enter test card: `4242424242424242`
4. Verify payment processes successfully
5. Check Stripe Dashboard for payment
6. Verify Firebase is updated

---

## 📊 **Performance Characteristics**

### **Frontend Performance**
- **GitHub Pages CDN**: Global distribution
- **Static content**: Fast loading
- **Stripe.js**: Client-side card validation

### **Backend Performance**
- **Vercel Edge Functions**: Low latency
- **Auto-scaling**: Handles traffic spikes
- **Cold start**: ~100-300ms first request

---

## 🔍 **Monitoring & Debugging**

### **Frontend Debugging**
- Browser Developer Tools
- Console logs for payment flow
- Network tab for API calls

### **Backend Monitoring**
```bash
# View Vercel function logs
vercel logs --follow

# Check specific endpoint
vercel logs api/stripe/create-payment-intent
```

### **Stripe Monitoring**
- Stripe Dashboard → Payments
- Stripe Dashboard → Webhooks → Logs
- Real-time event monitoring

---

## 🎯 **Success Metrics**

- ✅ **Frontend loads**: `www.gammapace.com` resolves correctly
- ✅ **API responds**: Backend status endpoint returns 200
- ✅ **Payments process**: Test transactions complete successfully
- ✅ **Webhooks work**: Stripe events reach backend
- ✅ **CORS configured**: No browser console errors

---

## 🆘 **Troubleshooting**

### **Common Issues**

#### **1. CORS Errors**
```
Access to fetch at 'vercel-app.vercel.app' from origin 'www.gammapace.com' 
has been blocked by CORS policy
```
**Solution**: Verify CORS headers in backend APIs

#### **2. Payment Processing Fails**
**Check**: Environment variables in Vercel
**Check**: Stripe keys are live keys (not test)
**Check**: Vercel function logs

#### **3. Webhook Not Working**  
**Check**: Webhook URL in Stripe Dashboard
**Check**: Webhook secret in Vercel environment variables
**Check**: Test webhook delivery in Stripe

---

This architecture provides a **secure, scalable, and maintainable** payment system for your IELTS practice application! 🚀 