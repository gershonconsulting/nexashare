import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { 
  CreditCard, 
  Calendar, 
  CheckCircle2, 
  XCircle, 
  AlertCircle,
  ExternalLink,
  Crown,
  Sparkles,
  Zap
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { PRICING_PLANS, getPlan } from '@/shared/pricing';

export function BillingPage() {
  const [subscription, setSubscription] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    fetchSubscriptionStatus();
  }, []);

  const fetchSubscriptionStatus = async () => {
    try {
      const response = await fetch('/api/stripe/subscription-status');
      if (response.ok) {
        const data = await response.json();
        setSubscription(data);
      }
    } catch (error) {
      console.error('Error fetching subscription:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleManageBilling = async () => {
    setActionLoading(true);
    try {
      const response = await fetch('/api/stripe/create-portal-session', {
        method: 'POST',
      });

      if (!response.ok) throw new Error('Failed to create portal session');

      const data = await response.json();
      window.location.href = data.url;
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to open billing portal',
        variant: 'destructive',
      });
      setActionLoading(false);
    }
  };

  const handleCancelSubscription = async () => {
    if (!confirm('Are you sure you want to cancel your subscription? You will retain access until the end of your billing period.')) {
      return;
    }

    setActionLoading(true);
    try {
      const response = await fetch('/api/stripe/cancel-subscription', {
        method: 'POST',
      });

      if (!response.ok) throw new Error('Failed to cancel subscription');

      toast({
        title: 'Subscription Cancelled',
        description: 'Your subscription will end at the end of the billing period',
      });

      fetchSubscriptionStatus();
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to cancel subscription',
        variant: 'destructive',
      });
    } finally {
      setActionLoading(false);
    }
  };

  const handleReactivateSubscription = async () => {
    setActionLoading(true);
    try {
      const response = await fetch('/api/stripe/reactivate-subscription', {
        method: 'POST',
      });

      if (!response.ok) throw new Error('Failed to reactivate subscription');

      toast({
        title: 'Subscription Reactivated',
        description: 'Your subscription has been reactivated',
      });

      fetchSubscriptionStatus();
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to reactivate subscription',
        variant: 'destructive',
      });
    } finally {
      setActionLoading(false);
    }
  };

  const getPlanIcon = (tier: string) => {
    switch (tier) {
      case 'starter': return <Zap className="w-6 h-6" />;
      case 'pro': return <Sparkles className="w-6 h-6" />;
      case 'elite': return <Crown className="w-6 h-6" />;
      default: return null;
    }
  };

  const getStatusBadge = (status: string) => {
    const configs: Record<string, { label: string; variant: any; icon: any }> = {
      active: { label: 'Active', variant: 'default', icon: CheckCircle2 },
      trialing: { label: 'Trial', variant: 'secondary', icon: AlertCircle },
      past_due: { label: 'Past Due', variant: 'destructive', icon: XCircle },
      canceled: { label: 'Canceled', variant: 'secondary', icon: XCircle },
      free: { label: 'Free', variant: 'secondary', icon: Zap }
    };

    const config = configs[status] || configs.free;
    const Icon = config.icon;

    return (
      <Badge variant={config.variant} className="flex items-center gap-1">
        <Icon className="w-3 h-3" />
        {config.label}
      </Badge>
    );
  };

  const formatDate = (timestamp: number) => {
    return new Date(timestamp * 1000).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  const currentPlan = getPlan(subscription?.subscriptionTier || 'starter');

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading billing information...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold">Billing & Subscription</h1>
        <p className="text-gray-600 mt-2">Manage your subscription and billing information</p>
      </div>

      {/* Current Plan Card */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={`p-3 rounded-lg ${
                subscription?.subscriptionTier === 'starter' ? 'bg-blue-100 text-blue-600' :
                subscription?.subscriptionTier === 'pro' ? 'bg-purple-100 text-purple-600' :
                'bg-yellow-100 text-yellow-600'
              }`}>
                {getPlanIcon(subscription?.subscriptionTier)}
              </div>
              <div>
                <CardTitle>Current Plan: {currentPlan?.name}</CardTitle>
                <CardDescription>{currentPlan?.description}</CardDescription>
              </div>
            </div>
            {getStatusBadge(subscription?.subscriptionStatus)}
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Plan Features */}
          <div>
            <h3 className="font-semibold mb-3">Your Plan Includes:</h3>
            <div className="grid md:grid-cols-2 gap-3">
              {currentPlan?.features.map((feature, index) => (
                <div key={index} className="flex items-start gap-2">
                  <CheckCircle2 className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" />
                  <span className="text-sm">{feature}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Subscription Details */}
          {subscription?.subscription && (
            <div className="bg-gray-50 rounded-lg p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-gray-500" />
                  <span className="text-sm font-medium">Next Billing Date</span>
                </div>
                <span className="text-sm">
                  {formatDate(subscription.subscription.currentPeriodEnd)}
                </span>
              </div>

              {subscription.subscription.cancelAtPeriodEnd && (
                <Alert>
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    Your subscription will end on {formatDate(subscription.subscription.currentPeriodEnd)}.
                    You can reactivate it anytime before then.
                  </AlertDescription>
                </Alert>
              )}
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex gap-3 flex-wrap">
            {subscription?.subscriptionTier === 'starter' ? (
              <Button
                onClick={() => window.location.href = '/pricing'}
                className="bg-gradient-to-r from-purple-600 to-blue-600"
              >
                <Sparkles className="mr-2 w-4 h-4" />
                Upgrade Plan
              </Button>
            ) : (
              <>
                <Button
                  onClick={handleManageBilling}
                  disabled={actionLoading}
                  variant="outline"
                >
                  <CreditCard className="mr-2 w-4 h-4" />
                  Manage Billing
                  <ExternalLink className="ml-2 w-3 h-3" />
                </Button>

                {subscription?.subscription?.cancelAtPeriodEnd ? (
                  <Button
                    onClick={handleReactivateSubscription}
                    disabled={actionLoading}
                    variant="default"
                  >
                    Reactivate Subscription
                  </Button>
                ) : (
                  <Button
                    onClick={handleCancelSubscription}
                    disabled={actionLoading}
                    variant="destructive"
                  >
                    Cancel Subscription
                  </Button>
                )}

                <Button
                  onClick={() => window.location.href = '/pricing'}
                  variant="outline"
                >
                  Change Plan
                </Button>
              </>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Usage & Limits */}
      <Card>
        <CardHeader>
          <CardTitle>Usage & Limits</CardTitle>
          <CardDescription>Your current usage this billing period</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-4">
            <div>
              <div className="flex justify-between text-sm mb-2">
                <span>Company Pages</span>
                <span className="font-medium">
                  {/* TODO: Get actual count */}
                  0 / {currentPlan?.limits.companyPages}
                </span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div 
                  className="bg-purple-600 h-2 rounded-full" 
                  style={{ width: `${(0 / (currentPlan?.limits.companyPages || 1)) * 100}%` }}
                ></div>
              </div>
            </div>

            <div>
              <div className="flex justify-between text-sm mb-2">
                <span>AI Generations</span>
                <span className="font-medium">
                  {/* TODO: Get actual count */}
                  0 / {currentPlan?.limits.aiGenerations || 'Unlimited'}
                </span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div 
                  className="bg-blue-600 h-2 rounded-full" 
                  style={{ width: '0%' }}
                ></div>
              </div>
            </div>

            <div>
              <div className="flex justify-between text-sm mb-2">
                <span>Reposts This Month</span>
                <span className="font-medium">
                  {/* TODO: Get actual count */}
                  0 / {currentPlan?.limits.repostsPerMonth}
                </span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div 
                  className="bg-green-600 h-2 rounded-full" 
                  style={{ width: '0%' }}
                ></div>
              </div>
            </div>
          </div>

          {subscription?.subscriptionTier === 'starter' && (
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                Upgrade to Pro or Elite to unlock more capacity and features.
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      {/* Compare Plans */}
      <Card>
        <CardHeader>
          <CardTitle>Compare Plans</CardTitle>
          <CardDescription>See what each plan offers</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-3 px-4">Feature</th>
                  <th className="text-center py-3 px-4">Starter</th>
                  <th className="text-center py-3 px-4">Pro</th>
                  <th className="text-center py-3 px-4">Elite</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(PRICING_PLANS).map(([key, plan]) => (
                  <tr key={key} className="border-b">
                    <td className="py-3 px-4 font-medium">{plan.name}</td>
                    <td className="text-center py-3 px-4">
                      ${plan.prices.yearly}/mo
                    </td>
                    <td className="text-center py-3 px-4" colSpan={3}>
                      {plan.limits.companyPages === 999 ? 'Unlimited' : plan.limits.companyPages} pages
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-6 text-center">
            <Button onClick={() => window.location.href = '/pricing'} variant="outline">
              View Full Comparison
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
