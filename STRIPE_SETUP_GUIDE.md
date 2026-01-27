# Stripe Subscription Setup Guide

## 🎯 **Your Pricing Structure**

### **Starter - $0/month**
- 1 company page
- Manual repost only
- Basic analytics
- **FREE forever** ✅

### **Pro - $19/month (yearly) or $22.80/month (monthly)**
- 10 company pages
- Auto-repost daily
- AI features (100 generations/month)
- Advanced analytics
- **Most Popular** ⭐

### **Elite - $49/month (yearly) or $58.80/month (monthly)**
- Unlimited company pages
- Auto-repost realtime
- Unlimited AI features
- White-label reports
- API access
- **For agencies** 👑

**Monthly billing is 20% higher than yearly!**

---

## 🚀 **Step-by-Step Stripe Setup**

### **Step 1: Create Stripe Account**

```
1. Go to: https://stripe.com
2. Click "Sign Up"
3. Fill in your business details
4. Verify your email
5. Complete business verification
```

### **Step 2: Create Products in Stripe**

#### **Create Pro Plan:**

```
1. Go to Stripe Dashboard → Products
2. Click "+ Add Product"
3. Fill in:

Name: NexaShare Pro
Description: For professionals and growing teams
Statement Descriptor: NEXASHARE PRO

4. Click "Add pricing"

Price 1 (Yearly):
- Model: Recurring
- Price: $19 USD
- Billing period: Monthly
- Name: Pro Yearly
- Description: Billed yearly at $228/year
- Click "Add price"

Price 2 (Monthly):
- Model: Recurring
- Price: $22.80 USD
- Billing period: Monthly
- Name: Pro Monthly
- Description: Billed monthly
- Click "Add price"

5. Save Product
```

#### **Create Elite Plan:**

```
1. Click "+ Add Product" again
2. Fill in:

Name: NexaShare Elite
Description: For agencies and enterprises
Statement Descriptor: NEXASHARE ELITE

3. Add pricing:

Price 1 (Yearly):
- Model: Recurring
- Price: $49 USD
- Billing period: Monthly
- Name: Elite Yearly
- Billed yearly at $588/year
- Click "Add price"

Price 2 (Monthly):
- Model: Recurring
- Price: $58.80 USD
- Billing period: Monthly
- Name: Elite Monthly
- Click "Add price"

4. Save Product
```

### **Step 3: Get Price IDs**

```
1. Go to Products → NexaShare Pro → Pricing
2. You'll see two prices listed
3. Click on "Pro Yearly" price
4. Copy the Price ID (starts with price_...)
   Example: price_1QLe3fJ2kRZTvxyz123abc

5. Click on "Pro Monthly" price
6. Copy the Price ID
   Example: price_1QLe4gK3mSTUwxyz456def

7. Repeat for Elite plan
```

### **Step 4: Update NexaShare Code**

Open: `shared/pricing.ts`

```typescript
pro: {
  // ... other config
  stripeIds: {
    monthly: 'price_1QLe4gK3mSTUwxyz456def',  // ← Your Pro Monthly Price ID
    yearly: 'price_1QLe3fJ2kRZTvxyz123abc'    // ← Your Pro Yearly Price ID
  }
},

elite: {
  // ... other config
  stripeIds: {
    monthly: 'price_1QLe6hL4nTUVwxyz789ghi',  // ← Your Elite Monthly Price ID
    yearly: 'price_1QLe5iM5oUWXwxyz012jkl'    // ← Your Elite Yearly Price ID
  }
}
```

### **Step 5: Get API Keys**

```
1. Go to Stripe Dashboard → Developers → API Keys
2. You'll see:
   - Publishable key (starts with pk_...)
   - Secret key (starts with sk_...)

3. Copy both keys
```

### **Step 6: Add to Environment Variables**

**On Render.com (or your hosting):**

```bash
# Stripe Keys
STRIPE_SECRET_KEY=sk_test_51QLe...  # ← Your Secret Key
VITE_STRIPE_PUBLIC_KEY=pk_test_51QLe...  # ← Your Publishable Key

# Domain (for redirects)
DOMAIN=https://nexashare.onrender.com  # ← Your domain

# Webhook Secret (we'll get this next)
STRIPE_WEBHOOK_SECRET=whsec_...  # ← We'll add this in Step 7
```

### **Step 7: Set Up Webhooks**

Webhooks notify your app when subscriptions change.

```
1. Go to Stripe Dashboard → Developers → Webhooks
2. Click "+ Add endpoint"
3. Fill in:

Endpoint URL: https://nexashare.onrender.com/api/stripe/webhook
Description: NexaShare subscription events

4. Select events to listen to:
   ✅ checkout.session.completed
   ✅ customer.subscription.updated
   ✅ customer.subscription.deleted
   ✅ invoice.payment_succeeded
   ✅ invoice.payment_failed

5. Click "Add endpoint"

6. Copy the "Signing secret" (starts with whsec_...)
7. Add to environment variables:
   STRIPE_WEBHOOK_SECRET=whsec_your_secret_here
```

### **Step 8: Test in Development**

```bash
# Install Stripe CLI for local testing
brew install stripe/stripe-cli/stripe  # Mac
# or
scoop install stripe  # Windows

# Login to Stripe
stripe login

# Forward webhooks to local server
stripe listen --forward-to localhost:5000/api/stripe/webhook

# This will give you a webhook secret starting with whsec_
# Add it to your .env.local file
```

---

## 🧪 **Testing Your Setup**

### **Test Checkout Flow:**

```
1. Start your app locally
2. Go to http://localhost:5000/pricing
3. Click "Start Pro Trial"
4. You'll be redirected to Stripe Checkout
5. Use test card: 4242 4242 4242 4242
   - Expiry: Any future date (e.g., 12/34)
   - CVC: Any 3 digits (e.g., 123)
   - ZIP: Any 5 digits (e.g., 12345)
6. Complete payment
7. You'll be redirected back to your app
8. Check if subscription is active!
```

### **Stripe Test Cards:**

```
Success:
4242 4242 4242 4242  → Payment succeeds

Decline:
4000 0000 0000 0002  → Card declined

3D Secure:
4000 0027 6000 3184  → Requires authentication

Insufficient Funds:
4000 0000 0000 9995  → Insufficient funds
```

---

## 💰 **Pricing Breakdown**

### **What You Charge:**

| Plan | Yearly (monthly) | Monthly | Yearly Total |
|------|------------------|---------|--------------|
| Starter | $0 | $0 | $0 |
| Pro | $19/mo | $22.80/mo | $228/year |
| Elite | $49/mo | $58.80/mo | $588/year |

### **Stripe Fees:**

```
Stripe charges: 2.9% + $0.30 per transaction

Pro Yearly ($228):
- Stripe fee: $6.91
- You receive: $221.09

Elite Yearly ($588):
- Stripe fee: $17.35
- You receive: $570.65

Monthly billing (Pro $22.80):
- Stripe fee per month: $0.96
- You receive per month: $21.84
- Annual: $262.08
```

### **Why Yearly is Better:**

```
Pro Plan:
- Customer pays yearly: $228
- Stripe fee: $6.91 (one time)
- You keep: $221.09

vs.

- Customer pays monthly: $22.80 × 12 = $273.60
- Stripe fees: $0.96 × 12 = $11.52
- You keep: $262.08

Yearly saves customer $45.60 and saves you $4.61 in fees!
```

---

## 🔐 **Security Best Practices**

### **1. Never Expose Secret Keys:**
```bash
✅ Store in environment variables
✅ Use .env files (gitignored)
✅ Different keys for dev and prod
❌ Never commit to git
❌ Never expose in frontend code
```

### **2. Verify Webhook Signatures:**
```typescript
// Always verify webhooks (already implemented)
const sig = req.headers['stripe-signature'];
const event = stripe.webhooks.constructEvent(
  req.body,
  sig,
  process.env.STRIPE_WEBHOOK_SECRET
);
```

### **3. Use Test Mode First:**
```
Test keys: sk_test_... and pk_test_...
Live keys: sk_live_... and pk_live_...

Always test thoroughly before going live!
```

---

## 🎨 **User Experience Flow**

### **New User:**
```
1. Signs up → Starter plan (free)
2. Uses app with 1 company page
3. Wants more → Goes to /pricing
4. Clicks "Start Pro Trial"
5. Stripe checkout → Enters card
6. Subscription activated
7. Can now add 10 company pages + AI features!
```

### **Upgrading:**
```
1. Current: Pro plan
2. Goes to /pricing
3. Clicks "Start Elite Trial"
4. Stripe handles upgrade
5. Prorated billing (pays difference)
6. Elite features unlocked!
```

### **Cancelling:**
```
1. User wants to cancel
2. Goes to Dashboard → Manage Subscription
3. Clicks "Cancel Subscription"
4. Subscription continues until period end
5. Then reverts to Starter plan
6. Data preserved, just loses premium features
```

---

## 📊 **Monitoring & Analytics**

### **Stripe Dashboard Shows:**
```
✅ Monthly recurring revenue (MRR)
✅ Customer lifetime value (LTV)
✅ Churn rate
✅ Payment success rate
✅ Trial conversion rate
```

### **Track in Your App:**
```typescript
// Add to analytics table
{
  userId: 123,
  event: 'subscription_started',
  plan: 'pro',
  billingPeriod: 'yearly',
  amount: 228,
  timestamp: new Date()
}
```

---

## 🐛 **Troubleshooting**

### **Issue: Checkout fails**
```
Check:
1. Stripe keys are correct (test vs live)
2. Price IDs match your Stripe products
3. Domain is correct in success_url
4. Browser allows redirects
```

### **Issue: Webhook not working**
```
Check:
1. Webhook endpoint URL is correct
2. Webhook secret is set in environment
3. Endpoint is publicly accessible
4. Events are selected in Stripe
```

### **Issue: Subscription not activating**
```
Check:
1. Webhook handler is working
2. Database is updating
3. Check Stripe webhook logs
4. Check server logs
```

### **Issue: Payment declined**
```
This is expected sometimes:
- Customer's card declined
- Insufficient funds
- Card expired
- Fraud detection

Stripe will:
1. Retry payment automatically
2. Email customer
3. Update subscription to past_due
4. Your app handles this gracefully
```

---

## 🚀 **Going Live (Production)**

### **Before Launch:**
```
✅ Test all flows with test cards
✅ Verify webhooks work
✅ Set up proper error handling
✅ Add terms of service
✅ Add privacy policy
✅ Add refund policy
✅ Test cancellation flow
✅ Test upgrade/downgrade
```

### **Switch to Live Mode:**
```
1. In Stripe Dashboard → Switch to "Live mode"
2. Get your live API keys
3. Create same products/prices in live mode
4. Get live price IDs
5. Update environment variables with live keys
6. Update webhook endpoint (create new for live)
7. Test with real (small) purchase
8. Launch! 🚀
```

---

## 📋 **Environment Variables Checklist**

```bash
# Required for Stripe
✅ STRIPE_SECRET_KEY=sk_...
✅ VITE_STRIPE_PUBLIC_KEY=pk_...
✅ STRIPE_WEBHOOK_SECRET=whsec_...
✅ DOMAIN=https://your-domain.com

# Already have
✅ ANTHROPIC_API_KEY=sk-ant-...
✅ DATABASE_URL=postgresql://...
✅ LINKEDIN_CLIENT_SECRET=...
✅ SESSION_SECRET=...
```

---

## 💡 **Pro Tips**

### **1. Offer Trials:**
```typescript
// In Stripe, set up trials
trial_period_days: 14  // 14-day free trial
```

### **2. Promo Codes:**
```
1. Go to Stripe → Products → Coupons
2. Create: "LAUNCH50" for 50% off first month
3. Users enter at checkout
```

### **3. Lifetime Deals:**
```typescript
// One-time payment, lifetime access
mode: 'payment'  // Instead of 'subscription'
```

### **4. Custom Billing:**
```typescript
// Usage-based pricing
billing_scheme: 'tiered'
// Charge per company page or AI generation
```

---

## 🎉 **Summary**

**What You Built:**
- ✅ 3-tier pricing (Starter, Pro, Elite)
- ✅ Yearly + Monthly billing
- ✅ Beautiful pricing page
- ✅ Stripe integration
- ✅ Webhook handling
- ✅ Subscription management
- ✅ Upgrade/downgrade flow
- ✅ Cancellation handling

**Ready to:**
1. Create Stripe products
2. Get Price IDs
3. Add to code
4. Test with test cards
5. Go live!

**Estimated Setup Time:** 30-45 minutes

**Monthly Revenue Potential:**
```
10 Pro users × $19 = $190/month
20 Pro users × $19 = $380/month
50 Pro users × $19 = $950/month
100 Pro users × $19 = $1,900/month 🎉
```

Let's make it happen! 🚀
