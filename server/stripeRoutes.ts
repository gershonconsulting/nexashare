import { Router, Request, Response } from 'express';
import Stripe from 'stripe';
import { storage } from './storage.js';
import { PRICING_PLANS, getPlan } from '../shared/pricing.js';

const router = Router();

// Initialize Stripe
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '');

/**
 * POST /api/stripe/create-checkout-session
 * Create Stripe checkout session for subscription
 */
router.post('/create-checkout-session', async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId;
    if (!userId) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const { planId, billingPeriod } = req.body;

    if (!planId || !['monthly', 'yearly'].includes(billingPeriod)) {
      return res.status(400).json({ 
        message: 'Invalid planId or billingPeriod' 
      });
    }

    const plan = getPlan(planId);
    if (!plan) {
      return res.status(400).json({ message: 'Invalid plan' });
    }

    if (planId === 'starter') {
      return res.status(400).json({ 
        message: 'Starter plan is free, no checkout needed' 
      });
    }

    const user = await storage.getUser(userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Get or create Stripe customer
    let customerId = user.stripeCustomerId;
    
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        name: user.fullName,
        metadata: {
          userId: userId.toString()
        }
      });
      customerId = customer.id;
      await storage.updateStripeCustomerId(userId, customerId);
    }

    // Get the Stripe Price ID
    const priceId = plan.stripeIds[billingPeriod as 'monthly' | 'yearly'];
    
    if (!priceId) {
      return res.status(500).json({ 
        message: 'Stripe price ID not configured for this plan' 
      });
    }

    // Create checkout session
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [
        {
          price: priceId,
          quantity: 1
        }
      ],
      success_url: `${process.env.DOMAIN || 'http://localhost:5000'}/subscription/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.DOMAIN || 'http://localhost:5000'}/pricing`,
      metadata: {
        userId: userId.toString(),
        planId,
        billingPeriod
      }
    });

    res.json({
      sessionId: session.id,
      url: session.url
    });
  } catch (error) {
    console.error('[Stripe] Error creating checkout session:', error);
    res.status(500).json({ 
      message: 'Failed to create checkout session',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * POST /api/stripe/webhook
 * Handle Stripe webhooks
 */
router.post('/webhook', async (req: Request, res: Response) => {
  const sig = req.headers['stripe-signature'];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!sig || !webhookSecret) {
    return res.status(400).json({ message: 'Missing signature or webhook secret' });
  }

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
  } catch (err) {
    console.error('[Stripe] Webhook signature verification failed:', err);
    return res.status(400).json({ message: 'Webhook signature verification failed' });
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        await handleCheckoutComplete(session);
        break;
      }

      case 'customer.subscription.updated': {
        const subscription = event.data.object as Stripe.Subscription;
        await handleSubscriptionUpdated(subscription);
        break;
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription;
        await handleSubscriptionDeleted(subscription);
        break;
      }

      case 'invoice.payment_succeeded': {
        const invoice = event.data.object as Stripe.Invoice;
        await handlePaymentSucceeded(invoice);
        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice;
        await handlePaymentFailed(invoice);
        break;
      }
    }

    res.json({ received: true });
  } catch (error) {
    console.error('[Stripe] Error handling webhook:', error);
    res.status(500).json({ message: 'Webhook handler failed' });
  }
});

/**
 * GET /api/stripe/subscription-status
 * Get current subscription status
 */
router.get('/subscription-status', async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId;
    if (!userId) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const user = await storage.getUser(userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    let subscription = null;
    
    if (user.stripeSubscriptionId) {
      try {
        subscription = await stripe.subscriptions.retrieve(user.stripeSubscriptionId);
      } catch (error) {
        console.error('[Stripe] Error retrieving subscription:', error);
      }
    }

    res.json({
      subscriptionTier: user.subscriptionTier || 'starter',
      subscriptionStatus: user.subscriptionStatus || 'free',
      subscription: subscription ? {
        id: subscription.id,
        status: subscription.status,
        currentPeriodEnd: subscription.current_period_end,
        cancelAtPeriodEnd: subscription.cancel_at_period_end
      } : null
    });
  } catch (error) {
    console.error('[Stripe] Error getting subscription status:', error);
    res.status(500).json({ message: 'Failed to get subscription status' });
  }
});

/**
 * POST /api/stripe/cancel-subscription
 * Cancel subscription (at period end)
 */
router.post('/cancel-subscription', async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId;
    if (!userId) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const user = await storage.getUser(userId);
    if (!user || !user.stripeSubscriptionId) {
      return res.status(404).json({ message: 'No active subscription found' });
    }

    // Cancel at period end (not immediately)
    const subscription = await stripe.subscriptions.update(
      user.stripeSubscriptionId,
      { cancel_at_period_end: true }
    );

    res.json({
      message: 'Subscription will be cancelled at period end',
      cancelAt: subscription.cancel_at
    });
  } catch (error) {
    console.error('[Stripe] Error cancelling subscription:', error);
    res.status(500).json({ message: 'Failed to cancel subscription' });
  }
});

/**
 * POST /api/stripe/reactivate-subscription
 * Reactivate a cancelled subscription
 */
router.post('/reactivate-subscription', async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId;
    if (!userId) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const user = await storage.getUser(userId);
    if (!user || !user.stripeSubscriptionId) {
      return res.status(404).json({ message: 'No subscription found' });
    }

    const subscription = await stripe.subscriptions.update(
      user.stripeSubscriptionId,
      { cancel_at_period_end: false }
    );

    res.json({
      message: 'Subscription reactivated',
      subscription: {
        id: subscription.id,
        status: subscription.status
      }
    });
  } catch (error) {
    console.error('[Stripe] Error reactivating subscription:', error);
    res.status(500).json({ message: 'Failed to reactivate subscription' });
  }
});

/**
 * POST /api/stripe/create-portal-session
 * Create Stripe Customer Portal session
 */
router.post('/create-portal-session', async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId;
    if (!userId) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const user = await storage.getUser(userId);
    if (!user || !user.stripeCustomerId) {
      return res.status(404).json({ message: 'No Stripe customer found' });
    }

    const session = await stripe.billingPortal.sessions.create({
      customer: user.stripeCustomerId,
      return_url: `${process.env.DOMAIN || 'http://localhost:5000'}/dashboard`
    });

    res.json({
      url: session.url
    });
  } catch (error) {
    console.error('[Stripe] Error creating portal session:', error);
    res.status(500).json({ message: 'Failed to create portal session' });
  }
});

// ============================================================
// Webhook Handlers
// ============================================================

async function handleCheckoutComplete(session: Stripe.Checkout.Session) {
  const userId = parseInt(session.metadata?.userId || '0');
  const planId = session.metadata?.planId;
  
  if (!userId || !planId) {
    console.error('[Stripe] Missing metadata in checkout session');
    return;
  }

  const subscriptionId = session.subscription as string;

  await storage.updateStripeSubscription(userId, subscriptionId, 'active');
  
  // Update subscription tier
  const user = await storage.getUser(userId);
  if (user) {
    await storage.updateUser(userId, {
      subscriptionTier: planId,
      subscriptionStatus: 'active'
    });
  }

  console.log(`[Stripe] Subscription activated for user ${userId}, plan: ${planId}`);
}

async function handleSubscriptionUpdated(subscription: Stripe.Subscription) {
  const userId = parseInt(subscription.metadata?.userId || '0');
  
  if (!userId) {
    // Try to find user by customer ID
    const customerId = subscription.customer as string;
    const user = await storage.getUserByStripeCustomerId(customerId);
    
    if (user) {
      await storage.updateStripeSubscription(user.id, subscription.id, subscription.status);
      console.log(`[Stripe] Subscription updated for user ${user.id}`);
    }
  } else {
    await storage.updateStripeSubscription(userId, subscription.id, subscription.status);
    console.log(`[Stripe] Subscription updated for user ${userId}`);
  }
}

async function handleSubscriptionDeleted(subscription: Stripe.Subscription) {
  const customerId = subscription.customer as string;
  const user = await storage.getUserByStripeCustomerId(customerId);
  
  if (user) {
    await storage.updateUser(user.id, {
      subscriptionTier: 'starter',
      subscriptionStatus: 'cancelled'
    });
    console.log(`[Stripe] Subscription cancelled for user ${user.id}`);
  }
}

async function handlePaymentSucceeded(invoice: Stripe.Invoice) {
  const customerId = invoice.customer as string;
  const user = await storage.getUserByStripeCustomerId(customerId);
  
  if (user) {
    console.log(`[Stripe] Payment succeeded for user ${user.id}, amount: ${invoice.amount_paid / 100}`);
  }
}

async function handlePaymentFailed(invoice: Stripe.Invoice) {
  const customerId = invoice.customer as string;
  const user = await storage.getUserByStripeCustomerId(customerId);
  
  if (user) {
    await storage.updateUser(user.id, {
      subscriptionStatus: 'past_due'
    });
    console.log(`[Stripe] Payment failed for user ${user.id}`);
  }
}

export default router;
