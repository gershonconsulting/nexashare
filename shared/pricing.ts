// NexaShare Pricing Plans Configuration

export const PRICING_PLANS = {
  starter: {
    id: 'starter',
    name: 'Starter',
    description: 'Perfect for individuals getting started',
    features: [
      '1 company page',
      'Manual repost',
      'Basic analytics',
      'Email support',
      'Repost history'
    ],
    limits: {
      companyPages: 1,
      repostsPerMonth: 50,
      aiGenerations: 0,
      teamMembers: 1
    },
    prices: {
      monthly: 0,
      yearly: 0
    },
    stripeIds: {
      monthly: null, // Free plan - no Stripe
      yearly: null
    },
    popular: false,
    cta: 'Get Started Free'
  },

  pro: {
    id: 'pro',
    name: 'Pro',
    description: 'For professionals and growing teams',
    features: [
      '10 company pages',
      'Auto-repost daily',
      'AI comment generation',
      'Advanced analytics',
      'Priority support',
      'Unlimited repost history',
      'Hashtag suggestions',
      'Best time recommendations'
    ],
    limits: {
      companyPages: 10,
      repostsPerMonth: 500,
      aiGenerations: 100,
      teamMembers: 3
    },
    prices: {
      monthly: 22.80,  // $19 yearly + 20%
      yearly: 19
    },
    stripeIds: {
      monthly: 'price_pro_monthly_id', // Replace with your Stripe Price ID
      yearly: 'price_pro_yearly_id'
    },
    popular: true,
    cta: 'Start Pro Trial'
  },

  elite: {
    id: 'elite',
    name: 'Elite',
    description: 'For agencies and enterprises',
    features: [
      'Unlimited company pages',
      'Auto-repost realtime',
      'Unlimited AI features',
      'White-label reports',
      'Dedicated support',
      'Custom integrations',
      'API access',
      'Team collaboration',
      'Priority features',
      'Account manager'
    ],
    limits: {
      companyPages: 999,
      repostsPerMonth: 9999,
      aiGenerations: 1000,
      teamMembers: 10
    },
    prices: {
      monthly: 58.80,  // $49 yearly + 20%
      yearly: 49
    },
    stripeIds: {
      monthly: 'price_elite_monthly_id', // Replace with your Stripe Price ID
      yearly: 'price_elite_yearly_id'
    },
    popular: false,
    cta: 'Start Elite Trial'
  }
};

// Calculate monthly price from yearly (20% higher)
export function calculateMonthlyPrice(yearlyPrice: number): number {
  return Math.round(yearlyPrice * 1.20 * 100) / 100;
}

// Get plan by ID
export function getPlan(planId: string) {
  return PRICING_PLANS[planId as keyof typeof PRICING_PLANS];
}

// Check if user can add more company pages
export function canAddCompanyPage(currentCount: number, planId: string): boolean {
  const plan = getPlan(planId);
  return currentCount < plan.limits.companyPages;
}

// Check if user can use AI features
export function canUseAI(usageThisMonth: number, planId: string): boolean {
  const plan = getPlan(planId);
  return plan.limits.aiGenerations > 0 && usageThisMonth < plan.limits.aiGenerations;
}

// Get all plans as array
export function getAllPlans() {
  return Object.values(PRICING_PLANS);
}

// Price formatting
export function formatPrice(price: number, period: 'monthly' | 'yearly'): string {
  if (price === 0) return 'Free';
  
  const formatted = `$${price}`;
  
  if (period === 'yearly') {
    return `${formatted}/month`;
  }
  
  return `${formatted}/month`;
}

// Calculate savings (yearly vs monthly)
export function calculateSavings(planId: string): number {
  const plan = getPlan(planId);
  if (!plan) return 0;
  
  const monthlyTotal = plan.prices.monthly * 12;
  const yearlyTotal = plan.prices.yearly * 12;
  const savings = monthlyTotal - yearlyTotal;
  
  return Math.round(savings * 100) / 100;
}

// Calculate savings percentage
export function calculateSavingsPercentage(planId: string): number {
  const plan = getPlan(planId);
  if (!plan) return 0;
  
  const monthlyTotal = plan.prices.monthly * 12;
  const yearlyTotal = plan.prices.yearly * 12;
  const savings = ((monthlyTotal - yearlyTotal) / monthlyTotal) * 100;
  
  return Math.round(savings);
}

export default PRICING_PLANS;
