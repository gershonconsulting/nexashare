import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Users,
  Copy,
  Check,
  Gift,
  DollarSign,
  TrendingUp,
  Share2,
  Mail,
  MessageSquare,
  Linkedin
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useUser } from '@/hooks/use-user';

export function ReferPage() {
  const { user } = useUser();
  const [copied, setCopied] = useState(false);
  const [stats, setStats] = useState({
    totalReferrals: 0,
    activeReferrals: 0,
    earnings: 0,
    pendingEarnings: 0
  });
  const { toast } = useToast();

  const referralUrl = `https://nexashare.com/signup?ref=${user?.referralCode || 'DEMO123'}`;

  useEffect(() => {
    fetchReferralStats();
  }, []);

  const fetchReferralStats = async () => {
    try {
      const response = await fetch('/api/referrals/stats');
      if (response.ok) {
        const data = await response.json();
        setStats(data);
      }
    } catch (error) {
      console.error('Error fetching referral stats:', error);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    toast({
      title: 'Copied!',
      description: 'Referral link copied to clipboard',
    });
    setTimeout(() => setCopied(false), 2000);
  };

  const shareViaEmail = () => {
    const subject = encodeURIComponent('Check out NexaShare - LinkedIn Automation');
    const body = encodeURIComponent(
      `Hey! I've been using NexaShare to automate my LinkedIn content and it's been amazing. ` +
      `You should check it out: ${referralUrl}\n\n` +
      `It helps you automatically repost company content, generate AI comments, and save hours every week!`
    );
    window.location.href = `mailto:?subject=${subject}&body=${body}`;
  };

  const shareViaLinkedIn = () => {
    const text = encodeURIComponent(
      `I've been using NexaShare to automate my LinkedIn content strategy and it's been a game-changer! ` +
      `Check it out: ${referralUrl}`
    );
    window.open(
      `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(referralUrl)}`,
      '_blank'
    );
  };

  const shareViaTwitter = () => {
    const text = encodeURIComponent(
      `Just discovered @NexaShare - automating LinkedIn content has never been easier! ${referralUrl}`
    );
    window.open(
      `https://twitter.com/intent/tweet?text=${text}`,
      '_blank'
    );
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold flex items-center gap-3">
          <Users className="w-8 h-8 text-purple-600" />
          Refer Friends & Earn
        </h1>
        <p className="text-gray-600 mt-2">
          Share NexaShare with friends and earn 30% recurring commission on their subscriptions
        </p>
      </div>

      {/* Stats Cards */}
      <div className="grid md:grid-cols-4 gap-6">
        <Card>
          <CardHeader className="pb-3">
            <CardDescription>Total Referrals</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div className="text-3xl font-bold">{stats.totalReferrals}</div>
              <Users className="w-8 h-8 text-blue-500" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardDescription>Active Subscriptions</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div className="text-3xl font-bold">{stats.activeReferrals}</div>
              <TrendingUp className="w-8 h-8 text-green-500" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardDescription>Total Earnings</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div className="text-3xl font-bold">${stats.earnings}</div>
              <DollarSign className="w-8 h-8 text-purple-500" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardDescription>Pending Payout</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div className="text-3xl font-bold">${stats.pendingEarnings}</div>
              <Gift className="w-8 h-8 text-yellow-500" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* How It Works */}
      <Card>
        <CardHeader>
          <CardTitle>How It Works</CardTitle>
          <CardDescription>Earn 30% recurring commission for every referral</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid md:grid-cols-3 gap-6">
            <div className="text-center p-6 bg-purple-50 rounded-lg">
              <div className="w-12 h-12 bg-purple-600 text-white rounded-full flex items-center justify-center mx-auto mb-4 text-xl font-bold">
                1
              </div>
              <h3 className="font-semibold mb-2">Share Your Link</h3>
              <p className="text-sm text-gray-600">
                Share your unique referral link with friends via email, social media, or direct message
              </p>
            </div>

            <div className="text-center p-6 bg-blue-50 rounded-lg">
              <div className="w-12 h-12 bg-blue-600 text-white rounded-full flex items-center justify-center mx-auto mb-4 text-xl font-bold">
                2
              </div>
              <h3 className="font-semibold mb-2">They Sign Up</h3>
              <p className="text-sm text-gray-600">
                Your friend signs up using your link and subscribes to Pro or Elite plan
              </p>
            </div>

            <div className="text-center p-6 bg-green-50 rounded-lg">
              <div className="w-12 h-12 bg-green-600 text-white rounded-full flex items-center justify-center mx-auto mb-4 text-xl font-bold">
                3
              </div>
              <h3 className="font-semibold mb-2">Earn 30% Forever</h3>
              <p className="text-sm text-gray-600">
                Earn 30% recurring commission on their subscription, paid monthly forever!
              </p>
            </div>
          </div>

          <Alert className="mt-6 bg-gradient-to-r from-purple-50 to-blue-50 border-purple-200">
            <Gift className="h-4 w-4" />
            <AlertDescription>
              <strong>Example:</strong> If your friend subscribes to Pro ($19/month), you earn $5.70/month.
              Refer 10 friends = $57/month passive income!
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>

      {/* Your Referral Link */}
      <Card>
        <CardHeader>
          <CardTitle>Your Referral Link</CardTitle>
          <CardDescription>Share this link to earn commissions</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <Input
              value={referralUrl}
              readOnly
              className="font-mono text-sm"
            />
            <Button
              onClick={() => copyToClipboard(referralUrl)}
              variant="outline"
              className="flex-shrink-0"
            >
              {copied ? (
                <Check className="w-4 h-4 mr-2" />
              ) : (
                <Copy className="w-4 h-4 mr-2" />
              )}
              {copied ? 'Copied!' : 'Copy'}
            </Button>
          </div>

          <div className="pt-4 border-t">
            <p className="text-sm font-medium mb-3">Share via:</p>
            <div className="flex gap-3 flex-wrap">
              <Button onClick={shareViaEmail} variant="outline">
                <Mail className="w-4 h-4 mr-2" />
                Email
              </Button>
              <Button onClick={shareViaLinkedIn} variant="outline">
                <Linkedin className="w-4 h-4 mr-2" />
                LinkedIn
              </Button>
              <Button onClick={shareViaTwitter} variant="outline">
                <MessageSquare className="w-4 h-4 mr-2" />
                Twitter
              </Button>
              <Button
                onClick={() => {
                  if (navigator.share) {
                    navigator.share({
                      title: 'Check out NexaShare',
                      text: 'Automate your LinkedIn content with NexaShare',
                      url: referralUrl
                    });
                  }
                }}
                variant="outline"
              >
                <Share2 className="w-4 h-4 mr-2" />
                More
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Referral Code */}
      <Card>
        <CardHeader>
          <CardTitle>Your Referral Code</CardTitle>
          <CardDescription>Share this code for manual entry</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4">
            <div className="flex-1">
              <div className="text-3xl font-bold font-mono tracking-wider text-purple-600 bg-purple-50 px-6 py-4 rounded-lg text-center">
                {user?.referralCode || 'LOADING...'}
              </div>
            </div>
            <Button
              onClick={() => copyToClipboard(user?.referralCode || '')}
              variant="outline"
              size="lg"
            >
              {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Commission Calculator */}
      <Card>
        <CardHeader>
          <CardTitle>Commission Calculator</CardTitle>
          <CardDescription>See how much you can earn</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-3 px-4">Referrals</th>
                  <th className="text-left py-3 px-4">Plan</th>
                  <th className="text-left py-3 px-4">Monthly Income</th>
                  <th className="text-left py-3 px-4">Yearly Income</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b">
                  <td className="py-3 px-4">5</td>
                  <td className="py-3 px-4">Pro ($19/mo)</td>
                  <td className="py-3 px-4 font-semibold">$28.50</td>
                  <td className="py-3 px-4 font-semibold text-green-600">$342</td>
                </tr>
                <tr className="border-b">
                  <td className="py-3 px-4">10</td>
                  <td className="py-3 px-4">Pro ($19/mo)</td>
                  <td className="py-3 px-4 font-semibold">$57</td>
                  <td className="py-3 px-4 font-semibold text-green-600">$684</td>
                </tr>
                <tr className="border-b">
                  <td className="py-3 px-4">25</td>
                  <td className="py-3 px-4">Pro ($19/mo)</td>
                  <td className="py-3 px-4 font-semibold">$142.50</td>
                  <td className="py-3 px-4 font-semibold text-green-600">$1,710</td>
                </tr>
                <tr className="border-b bg-purple-50">
                  <td className="py-3 px-4">10</td>
                  <td className="py-3 px-4">Elite ($49/mo)</td>
                  <td className="py-3 px-4 font-semibold text-purple-600">$147</td>
                  <td className="py-3 px-4 font-semibold text-purple-600">$1,764</td>
                </tr>
                <tr className="bg-gradient-to-r from-purple-50 to-blue-50">
                  <td className="py-3 px-4 font-bold">50</td>
                  <td className="py-3 px-4">Mixed</td>
                  <td className="py-3 px-4 font-bold text-xl text-purple-600">$350+</td>
                  <td className="py-3 px-4 font-bold text-xl text-purple-600">$4,200+</td>
                </tr>
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Terms & Conditions */}
      <Card>
        <CardHeader>
          <CardTitle>Program Terms</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="space-y-2 text-sm text-gray-600">
            <li className="flex items-start gap-2">
              <Check className="w-4 h-4 text-green-500 flex-shrink-0 mt-0.5" />
              <span>Earn 30% recurring commission on all paid subscriptions</span>
            </li>
            <li className="flex items-start gap-2">
              <Check className="w-4 h-4 text-green-500 flex-shrink-0 mt-0.5" />
              <span>Commissions paid monthly via PayPal or bank transfer</span>
            </li>
            <li className="flex items-start gap-2">
              <Check className="w-4 h-4 text-green-500 flex-shrink-0 mt-0.5" />
              <span>Minimum payout threshold: $50</span>
            </li>
            <li className="flex items-start gap-2">
              <Check className="w-4 h-4 text-green-500 flex-shrink-0 mt-0.5" />
              <span>90-day cookie tracking for referred users</span>
            </li>
            <li className="flex items-start gap-2">
              <Check className="w-4 h-4 text-green-500 flex-shrink-0 mt-0.5" />
              <span>No limit on number of referrals</span>
            </li>
            <li className="flex items-start gap-2">
              <Check className="w-4 h-4 text-green-500 flex-shrink-0 mt-0.5" />
              <span>Commission continues as long as referral remains subscribed</span>
            </li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
