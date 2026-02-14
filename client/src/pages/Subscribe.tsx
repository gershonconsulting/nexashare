import { useState, useEffect } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuth } from '@/context/AuthContext';
import { Loader2, CheckCircle, XCircle, CreditCard } from 'lucide-react';
import { loadStripe, Stripe as StripeType } from '@stripe/stripe-js';
import { Elements, PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js';
import { useLocation } from 'wouter';

// Initialize Stripe promise outside of component
let stripePromise: Promise<StripeType | null>;
if (import.meta.env.VITE_STRIPE_PUBLIC_KEY) {
  stripePromise = loadStripe(import.meta.env.VITE_STRIPE_PUBLIC_KEY);
} else {
  console.error('Missing Stripe public key. Please make sure VITE_STRIPE_PUBLIC_KEY is set.');
}

type SubscriptionStatus = 'free' | 'active' | 'trialing' | 'past_due' | 'canceled' | 'unpaid';

interface Subscription {
  id?: string;
  status: SubscriptionStatus;
  tier: 'free' | 'premium';
  currentPeriodEnd?: Date;
  cancelAtPeriodEnd?: boolean;
}

function CheckoutForm() {
  const stripe = useStripe();
  const elements = useElements();
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const { toast } = useToast();
  const [, setLocation] = useLocation();

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!stripe || !elements) {
      // Stripe.js hasn't loaded yet
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);

    const { error } = await stripe.confirmPayment({
      elements,
      confirmParams: {
        return_url: `${window.location.origin}/subscribe?success=true`,
      },
    });

    if (error) {
      setErrorMessage(error.message || 'An unexpected error occurred.');
      toast({
        title: 'Payment failed',
        description: error.message || 'Something went wrong with your payment',
        variant: 'destructive',
      });
    } else {
      // The payment has been processed!
      toast({
        title: 'Payment successful',
        description: 'Your subscription is now active!',
      });
      setLocation('/');
    }

    setIsLoading(false);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <PaymentElement />
      
      {errorMessage && (
        <div className="bg-destructive/20 p-3 rounded-md text-destructive text-sm">
          {errorMessage}
        </div>
      )}
      
      <Button 
        disabled={!stripe || isLoading} 
        className="w-full" 
        type="submit"
      >
        {isLoading ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Processing...
          </>
        ) : (
          <>
            <CreditCard className="mr-2 h-4 w-4" />
            Subscribe for $19.90/month
          </>
        )}
      </Button>
    </form>
  );
}

function SubscriptionStatus({ subscription }: { subscription: Subscription }) {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  
  const cancelMutation = useMutation({
    mutationFn: () => apiRequest('POST', '/api/subscription/cancel'),
    onSuccess: () => {
      toast({
        title: 'Subscription canceled',
        description: 'Your subscription will end at the current billing period',
      });
      
      // Refetch subscription data
      window.location.reload();
    },
    onError: () => {
      toast({
        title: 'Error',
        description: 'Failed to cancel subscription',
        variant: 'destructive',
      });
    },
  });
  
  const reactivateMutation = useMutation({
    mutationFn: () => apiRequest('POST', '/api/subscription/reactivate'),
    onSuccess: () => {
      toast({
        title: 'Subscription reactivated',
        description: 'Your subscription has been reactivated',
      });
      
      // Refetch subscription data
      window.location.reload();
    },
    onError: () => {
      toast({
        title: 'Error',
        description: 'Failed to reactivate subscription',
        variant: 'destructive',
      });
    },
  });
  
  if (subscription.tier === 'free') {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Free Plan</CardTitle>
          <CardDescription>
            You are currently on the free plan
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col space-y-4">
            <div className="flex items-center">
              <CheckCircle className="text-primary h-5 w-5 mr-2" />
              <span>1 company LinkedIn page</span>
            </div>
            <div className="flex items-center">
              <XCircle className="text-muted-foreground h-5 w-5 mr-2" />
              <span className="text-muted-foreground">Multiple company pages</span>
            </div>
            <div className="flex items-center">
              <XCircle className="text-muted-foreground h-5 w-5 mr-2" />
              <span className="text-muted-foreground">Advanced analytics</span>
            </div>
            <div className="flex items-center">
              <XCircle className="text-muted-foreground h-5 w-5 mr-2" />
              <span className="text-muted-foreground">AI-powered comment suggestions</span>
            </div>
          </div>
        </CardContent>
        <CardFooter>
          <Button className="w-full" onClick={() => setLocation('/subscribe?upgrade=true')}>
            Upgrade to Premium
          </Button>
        </CardFooter>
      </Card>
    );
  }
  
  return (
    <Card>
      <CardHeader>
        <CardTitle>Premium Plan</CardTitle>
        <CardDescription>
          {subscription.status === 'active' ? (
            subscription.cancelAtPeriodEnd ? 
              'Your subscription will be canceled at the end of the billing period' :
              'Your subscription is active'
          ) : (
            `Subscription status: ${subscription.status}`
          )}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col space-y-4">
          <div className="flex items-center">
            <CheckCircle className="text-primary h-5 w-5 mr-2" />
            <span>Multiple company LinkedIn pages</span>
          </div>
          <div className="flex items-center">
            <CheckCircle className="text-primary h-5 w-5 mr-2" />
            <span>Advanced analytics dashboard</span>
          </div>
          <div className="flex items-center">
            <CheckCircle className="text-primary h-5 w-5 mr-2" />
            <span>AI-powered comment suggestions</span>
          </div>
          <div className="flex items-center">
            <CheckCircle className="text-primary h-5 w-5 mr-2" />
            <span>Unlimited reposts</span>
          </div>
          
          {subscription.currentPeriodEnd && (
            <div className="pt-2 text-sm text-muted-foreground">
              {subscription.cancelAtPeriodEnd ? 
                `Access until: ${new Date(subscription.currentPeriodEnd).toLocaleDateString()}` :
                `Next billing date: ${new Date(subscription.currentPeriodEnd).toLocaleDateString()}`
              }
            </div>
          )}
        </div>
      </CardContent>
      <CardFooter>
        {subscription.status === 'active' && (
          subscription.cancelAtPeriodEnd ? (
            <Button
              className="w-full"
              onClick={() => reactivateMutation.mutate()}
              disabled={reactivateMutation.isPending}
            >
              {reactivateMutation.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : null}
              Resume Subscription
            </Button>
          ) : (
            <Button
              className="w-full" 
              variant="outline"
              onClick={() => cancelMutation.mutate()}
              disabled={cancelMutation.isPending}
            >
              {cancelMutation.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : null}
              Cancel Subscription
            </Button>
          )
        )}
      </CardFooter>
    </Card>
  );
}

export default function Subscribe() {
  const { user } = useAuth();
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [searchParams] = [new URLSearchParams(window.location.search)];
  const shouldUpgrade = searchParams.get('upgrade') === 'true';

  const { data: subscription, isLoading } = useQuery({
    queryKey: ['/api/subscription'],
    queryFn: async () => {
      const response = await apiRequest('GET', '/api/subscription');
      return response.json();
    },
    enabled: !!user,
  });

  useEffect(() => {
    if (user && shouldUpgrade && subscription?.tier === 'free') {
      // Create a subscription intent when upgrading
      apiRequest('POST', '/api/create-subscription')
        .then((response) => response.json())
        .then((data) => {
          setClientSecret(data.clientSecret);
        })
        .catch((error) => {
          console.error('Error creating subscription:', error);
          toast({
            title: 'Error',
            description: 'Failed to initialize subscription',
            variant: 'destructive',
          });
        });
    }
  }, [user, shouldUpgrade, subscription, toast]);

  // Check if payment was successful from query parameter
  useEffect(() => {
    if (searchParams.get('success') === 'true') {
      toast({
        title: 'Payment successful!',
        description: 'Your subscription is now active',
      });
      // Remove query parameters
      window.history.replaceState({}, '', '/subscribe');
    }
  }, [searchParams, toast]);

  if (!user) {
    return (
      <div className="flex justify-center items-center h-screen">
        <Button onClick={() => setLocation('/login')}>
          Please login to subscribe
        </Button>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="container max-w-4xl py-10">
      <h1 className="text-3xl font-bold mb-6">Subscription</h1>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {/* Left column - Current plan details */}
        <div>
          <SubscriptionStatus subscription={subscription} />
        </div>
        
        {/* Right column - Checkout form or plan details */}
        <div>
          {shouldUpgrade && clientSecret ? (
            <Card>
              <CardHeader>
                <CardTitle>Upgrade to Premium</CardTitle>
                <CardDescription>
                  $19.90/month - Cancel anytime
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Elements stripe={stripePromise} options={{ clientSecret }}>
                  <CheckoutForm />
                </Elements>
              </CardContent>
            </Card>
          ) : (
            subscription?.tier === 'free' && (
              <Card>
                <CardHeader>
                  <CardTitle>Premium Plan</CardTitle>
                  <CardDescription>Unlock the full potential of your LinkedIn content</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-col space-y-4">
                    <div className="flex items-center">
                      <CheckCircle className="text-primary h-5 w-5 mr-2" />
                      <span>Multiple company LinkedIn pages</span>
                    </div>
                    <div className="flex items-center">
                      <CheckCircle className="text-primary h-5 w-5 mr-2" />
                      <span>Advanced analytics dashboard</span>
                    </div>
                    <div className="flex items-center">
                      <CheckCircle className="text-primary h-5 w-5 mr-2" />
                      <span>AI-powered comment suggestions</span>
                    </div>
                    <div className="flex items-center">
                      <CheckCircle className="text-primary h-5 w-5 mr-2" />
                      <span>Unlimited reposts</span>
                    </div>
                    
                    <div className="py-3">
                      <div className="text-3xl font-bold">$19.90<span className="text-sm font-normal">/month</span></div>
                    </div>
                  </div>
                </CardContent>
                <CardFooter>
                  <Button className="w-full" onClick={() => setLocation('/subscribe?upgrade=true')}>
                    Upgrade Now
                  </Button>
                </CardFooter>
              </Card>
            )
          )}
        </div>
      </div>
    </div>
  );
}