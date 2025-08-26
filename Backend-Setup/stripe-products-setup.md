# **Stripe Products Setup Guide**

## **🎯 Create Subscription Products**

### **1. Weekly Plan**
**Via Stripe Dashboard:**
- Navigate to Products → Add Product
- Name: `Weekly IELTS Plan`
- Price: $9.99 CAD
- Billing: Recurring weekly

**Via Stripe CLI:**
```bash
stripe products create \
  --name="Weekly IELTS Plan" \
  --description="Perfect for short-term IELTS preparation"

stripe prices create \
  --product=prod_XXXXX \
  --unit-amount=999 \
  --currency=cad \
  --recurring[interval]=week
```

### **2. Monthly Plan**
**Via Stripe Dashboard:**
- Navigate to Products → Add Product
- Name: `Monthly IELTS Plan`
- Price: $24.99 CAD
- Billing: Recurring monthly

**Via Stripe CLI:**
```bash
stripe products create \
  --name="Monthly IELTS Plan" \
  --description="Most popular - Save 38% vs weekly billing"

stripe prices create \
  --product=prod_XXXXX \
  --unit-amount=2499 \
  --currency=cad \
  --recurring[interval]=month
```

### **3. Quarterly Plan**
**Via Stripe Dashboard:**
- Navigate to Products → Add Product
- Name: `Quarterly IELTS Plan`
- Price: $59.99 CAD
- Billing: Recurring every 3 months

**Via Stripe CLI:**
```bash
stripe products create \
  --name="Quarterly IELTS Plan" \
  --description="Best value - Save 50% vs weekly billing"

stripe prices create \
  --product=prod_XXXXX \
  -d unit_amount=5999 \
  -d currency=cad \
  -d "recurring[interval]=month" \
  -d "recurring[interval_count]=3"
```

## **🔧 Update JavaScript Configuration**

**File: `Reference-Lookup/Stripe-Integration.js`**

```javascript
const SUBSCRIPTION_PLANS = {
    weekly: {
        priceId: 'price_YOUR_WEEKLY_PRICE_ID',
        amount: 999,                    // $9.99 CAD
        currency: 'cad',
        interval: 'week',
        name: 'Weekly Plan',
        description: 'Perfect for short-term IELTS preparation'
    },
    monthly: {
        priceId: 'price_YOUR_MONTHLY_PRICE_ID',
        amount: 2499,                   // $24.99 CAD  
        currency: 'cad',
        interval: 'month',
        name: 'Monthly Plan',
        description: 'Most popular - Save 38% vs weekly billing'
    },
    quarterly: {
        priceId: 'price_YOUR_QUARTERLY_PRICE_ID',
        amount: 5999,                   // $59.99 CAD
        currency: 'cad',
        interval: 'month',
        intervalCount: 3,
        name: 'Quarterly Plan',
        description: 'Best value - Save 50% vs weekly billing'
    }
};
```

## **📊 Pricing Summary**

| Plan | Price ID | Amount | Duration |
|------|----------|---------|-----------|
| Weekly | `price_...` | $9.99 CAD | week |
| Monthly | `price_...` | $24.99 CAD | month |
| Quarterly | `price_...` | $59.99 CAD | 3 months |

## **✅ Setup Checklist**

**Products Created:**
- [ ] Weekly plan created ($9.99 CAD)
- [ ] Monthly plan created ($24.99 CAD)  
- [ ] Quarterly plan created ($59.99 CAD)
- [ ] Price IDs copied and updated in code
- [ ] Test payments verified
- [ ] Firebase integration tested 