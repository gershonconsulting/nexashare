import { useState } from 'react';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Check, Sparkles, Zap, Crown, ArrowRight } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { PRICING_PLANS, formatPrice, calculateSavings } from '@/shared/pricing';

export function PricingPage() {
  const [billingPeriod, setBillingPeriod] = useState<'monthly' | 'yearly'>('yearly');
  const [loading, setLoading] = useState<string | null>(null);
  const { toast } = useToast();

  const handleSubscribe = async (planId: string) => {
    if (planId === 'starter') {
      window.location.href = '/dashboard';
      return;
    }

    setLoading(planId);
    
    try {
      const response = await fetch('/api/stripe/create-checkout-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          planId,
          billingPeriod
        })
      });

      if (!response.ok) {
        throw new Error('Failed to create checkout session');
      }

      const data = await response.json();
      
      // Redirect to Stripe Checkout
      window.location.href = data.url;
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to start checkout. Please try again.',
        variant: 'destructive'
      });
      setLoading(null);
    }
  };

  const getPlanIcon = (planId: string) => {
    switch (planId) {
      case 'starter': return <Zap className="w-6 h-6" />;
      case 'pro': return <Sparkles className="w-6 h-6" />;
      case 'elite': return <Crown className="w-6 h-6" />;
      default: return null;
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-blue-50 to-pink-50 py-12 px-4">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-5xl font-bold mb-4 bg-gradient-to-r from-purple-600 to-blue-600 bg-clip-text text-transparent">
            Choose Your Plan
          </h1>
          <p className="text-xl text-gray-600 mb-8">
            Start free, upgrade as you grow
          </p>

          {/* Billing Toggle */}
          <div className="inline-flex items-center gap-4 bg-white rounded-full p-2 shadow-lg">
            <span className={`px-4 py-2 ${billingPeriod === 'monthly' ? 'font-semibold' : 'text-gray-500'}`}>
              Monthly
            </span>
            <Switch
              checked={billingPeriod === 'yearly'}
              onCheckedChange={(checked) => setBillingPeriod(checked ? 'yearly' : 'monthly')}
            />
            <span className={`px-4 py-2 ${billingPeriod === 'yearly' ? 'font-semibold' : 'text-gray-500'}`}>
              Yearly
              <Badge variant="secondary" className="ml-2 bg-green-100 text-green-700">
                Save 20%
              </Badge>
            </span>
          </div>
        </div>

        {/* Pricing Cards */}
        <div className="grid md:grid-cols-3 gap-8 mb-12">
          {Object.values(PRICING_PLANS).map((plan) => {
            const price = billingPeriod === 'yearly' ? plan.prices.yearly : plan.prices.monthly;
            const savings = calculateSavings(plan.id);

            return (
              <Card 
                key={plan.id}
                className={`relative ${
                  plan.popular 
                    ? 'border-2 border-purple-500 shadow-2xl scale-105' 
                    : 'border-gray-200 shadow-lg'
                } transition-all hover:shadow-2xl`}
              >
                {plan.popular && (
                  <div className="absolute -top-4 left-1/2 transform -translate-x-1/2">
                    <Badge className="bg-gradient-to-r from-purple-600 to-blue-600 text-white px-4 py-1">
                      ⭐ Most Popular
                    </Badge>
                  </div>
                )}

                <CardHeader className="text-center pb-8 pt-8">
                  <div className={`mx-auto mb-4 p-4 rounded-full ${
                    plan.id === 'starter' ? 'bg-blue-100 text-blue-600' :
                    plan.id === 'pro' ? 'bg-purple-100 text-purple-600' :
                    'bg-yellow-100 text-yellow-600'
                  }`}>
                    {getPlanIcon(plan.id)}
                  </div>
                  
                  <CardTitle className="text-2xl font-bold mb-2">
                    {plan.name}
                  </CardTitle>
                  
                  <CardDescription className="text-base mb-4">
                    {plan.description}
                  </CardDescription>

                  <div className="mb-4">
                    <div className="flex items-baseline justify-center gap-2">
                      <span className="text-5xl font-bold">
                        ${price}
                      </span>
                      <span className="text-gray-500">
                        /month
                      </span>
                    </div>
                    
                    {billingPeriod === 'yearly' && price > 0 && (
                      <div className="mt-2">
                        <p className="text-sm text-gray-500">
                          Billed ${price * 12}/year
                        </p>
                        {savings > 0 && (
                          <p className="text-sm text-green-600 font-semibold">
                            Save ${savings * 12}/year vs monthly
                          </p>
                        )}
                      </div>
                    )}

                    {billingPeriod === 'monthly' && price > 0 && (
                      <p className="text-sm text-gray-500 mt-2">
                        Billed monthly
                      </p>
                    )}
                  </div>
                </CardHeader>

                <CardContent className="space-y-4 px-6 pb-6">
                  <div className="space-y-3">
                    {plan.features.map((feature, index) => (
                      <div key={index} className="flex items-start gap-3">
                        <Check className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" />
                        <span className="text-sm text-gray-700">{feature}</span>
                      </div>
                    ))}
                  </div>
                </CardContent>

                <CardFooter className="px-6 pb-6">
                  <Button
                    onClick={() => handleSubscribe(plan.id)}
                    disabled={loading === plan.id}
                    className={`w-full ${
                      plan.popular
                        ? 'bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700'
                        : ''
                    }`}
                    size="lg"
                  >
                    {loading === plan.id ? (
                      'Loading...'
                    ) : (
                      <>
                        {plan.cta}
                        <ArrowRight className="ml-2 w-4 h-4" />
                      </>
                    )}
                  </Button>
                </CardFooter>
              </Card>
            );
          })}
        </div>

        {/* Feature Comparison Table */}
        <div className="bg-white rounded-2xl shadow-xl p-8">
          <h2 className="text-3xl font-bold text-center mb-8">
            Compare Plans
          </h2>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b-2">
                  <th className="text-left py-4 px-4 font-semibold">Feature</th>
                  <th className="text-center py-4 px-4 font-semibold">Starter</th>
                  <th className="text-center py-4 px-4 font-semibold">Pro</th>
                  <th className="text-center py-4 px-4 font-semibold">Elite</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b">
                  <td className="py-4 px-4">Company Pages</td>
                  <td className="text-center py-4 px-4">1</td>
                  <td className="text-center py-4 px-4">10</td>
                  <td className="text-center py-4 px-4">Unlimited</td>
                </tr>
                <tr className="border-b bg-gray-50">
                  <td className="py-4 px-4">Auto-Repost</td>
                  <td className="text-center py-4 px-4">❌</td>
                  <td className="text-center py-4 px-4">✅ Daily</td>
                  <td className="text-center py-4 px-4">✅ Realtime</td>
                </tr>
                <tr className="border-b">
                  <td className="py-4 px-4">AI Comment Generation</td>
                  <td className="text-center py-4 px-4">❌</td>
                  <td className="text-center py-4 px-4">100/month</td>
                  <td className="text-center py-4 px-4">1,000/month</td>
                </tr>
                <tr className="border-b bg-gray-50">
                  <td className="py-4 px-4">Analytics</td>
                  <td className="text-center py-4 px-4">Basic</td>
                  <td className="text-center py-4 px-4">Advanced</td>
                  <td className="text-center py-4 px-4">White-label</td>
                </tr>
                <tr className="border-b">
                  <td className="py-4 px-4">Team Members</td>
                  <td className="text-center py-4 px-4">1</td>
                  <td className="text-center py-4 px-4">3</td>
                  <td className="text-center py-4 px-4">10</td>
                </tr>
                <tr className="border-b bg-gray-50">
                  <td className="py-4 px-4">Support</td>
                  <td className="text-center py-4 px-4">Email</td>
                  <td className="text-center py-4 px-4">Priority</td>
                  <td className="text-center py-4 px-4">Dedicated</td>
                </tr>
                <tr className="border-b">
                  <td className="py-4 px-4">API Access</td>
                  <td className="text-center py-4 px-4">❌</td>
                  <td className="text-center py-4 px-4">❌</td>
                  <td className="text-center py-4 px-4">✅</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* FAQ Section */}
        <div className="mt-16 text-center">
          <h2 className="text-3xl font-bold mb-8">
            Frequently Asked Questions
          </h2>

          <div className="grid md:grid-cols-2 gap-8 max-w-4xl mx-auto text-left">
            <div className="bg-white p-6 rounded-xl shadow-lg">
              <h3 className="font-bold mb-2">Can I change plans later?</h3>
              <p className="text-gray-600">
                Yes! You can upgrade or downgrade at any time. Changes take effect immediately.
              </p>
            </div>

            <div className="bg-white p-6 rounded-xl shadow-lg">
              <h3 className="font-bold mb-2">What payment methods do you accept?</h3>
              <p className="text-gray-600">
                We accept all major credit cards through Stripe. Your payment is secure and encrypted.
              </p>
            </div>

            <div className="bg-white p-6 rounded-xl shadow-lg">
              <h3 className="font-bold mb-2">Can I cancel anytime?</h3>
              <p className="text-gray-600">
                Absolutely! Cancel anytime from your dashboard. No questions asked, no hidden fees.
              </p>
            </div>

            <div className="bg-white p-6 rounded-xl shadow-lg">
              <h3 className="font-bold mb-2">Do you offer refunds?</h3>
              <p className="text-gray-600">
                Yes! We offer a 30-day money-back guarantee. If you're not satisfied, we'll refund you.
              </p>
            </div>
          </div>
        </div>

        {/* CTA Section */}
        <div className="mt-16 text-center bg-gradient-to-r from-purple-600 to-blue-600 rounded-2xl p-12 text-white">
          <h2 className="text-4xl font-bold mb-4">
            Ready to grow your LinkedIn presence?
          </h2>
          <p className="text-xl mb-8 opacity-90">
            Join thousands of professionals using NexaShare
          </p>
          <Button 
            size="lg" 
            className="bg-white text-purple-600 hover:bg-gray-100"
            onClick={() => handleSubscribe('pro')}
          >
            Start Your Free Trial
            <ArrowRight className="ml-2" />
          </Button>
        </div>
      </div>
    </div>
  );
}
