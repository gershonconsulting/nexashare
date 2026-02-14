import { useState, useEffect } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { queryClient } from '@/lib/queryClient';
import { fetchReferrals, inviteByEmail } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { Sidebar } from '@/components/layout/Sidebar';
import { MobileHeader } from '@/components/layout/MobileHeader';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogClose,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Share2, Copy, CheckCircle, AlertCircle, Users, Send, Gift } from 'lucide-react';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Badge } from '@/components/ui/badge';

// Form schema
const emailFormSchema = z.object({
  email: z.string().email({
    message: "Please enter a valid email address.",
  }),
});

type EmailFormValues = z.infer<typeof emailFormSchema>;

// Component for referral stats
function ReferralStats({ stats }: { stats: any }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-lg">Total Referrals</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center">
            <Users className="h-5 w-5 mr-2 text-primary" />
            <span className="text-2xl font-bold">{stats.total || 0}</span>
          </div>
        </CardContent>
      </Card>
      
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-lg">Successful Referrals</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center">
            <CheckCircle className="h-5 w-5 mr-2 text-green-500" />
            <span className="text-2xl font-bold">{stats.successful || 0}</span>
          </div>
        </CardContent>
      </Card>
      
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-lg">Rewards Earned</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center">
            <Gift className="h-5 w-5 mr-2 text-amber-500" />
            <span className="text-2xl font-bold">{stats.rewards || 0}</span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// Component for referral link
function ReferralLink({ referralCode }: { referralCode: string }) {
  const [copied, setCopied] = useState(false);
  const referralLink = `${window.location.origin}/register?ref=${referralCode}`;
  
  const handleCopy = () => {
    navigator.clipboard.writeText(referralLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  
  return (
    <Card>
      <CardHeader>
        <CardTitle>Your Referral Link</CardTitle>
        <CardDescription>
          Share this link with friends to invite them to Hexashare
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex w-full items-center space-x-2">
          <Input
            value={referralLink}
            readOnly
            className="font-mono text-sm"
          />
          <Button 
            variant="outline" 
            size="icon" 
            onClick={handleCopy}
            className="flex-shrink-0"
          >
            {copied ? <CheckCircle className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
          </Button>
        </div>
      </CardContent>
      <CardFooter className="flex flex-col items-start space-y-2">
        <div className="text-sm text-muted-foreground">
          <span className="font-medium">Reward:</span> For each successful referral, both you and your friend get a 1-month free premium subscription extension.
        </div>
        <div className="flex space-x-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              const text = `Join me on Hexashare, the best B2B influencer amplification platform. Use my referral link: ${referralLink}`;
              window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`, '_blank');
            }}
          >
            Share on Twitter
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              const text = `Join me on Hexashare, the best B2B influencer amplification platform. Use my referral link: ${referralLink}`;
              window.open(`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(referralLink)}&title=${encodeURIComponent('Join me on Hexashare')}`, '_blank');
            }}
          >
            Share on LinkedIn
          </Button>
        </div>
      </CardFooter>
    </Card>
  );
}

export default function Referrals() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [emailInviteOpen, setEmailInviteOpen] = useState(false);
  
  // Fetch referrals from the server
  const { data: referralData = { referrals: [], referralCode: "", referralCount: 0 } } = useQuery({
    queryKey: ['/api/referrals'],
    queryFn: async () => {
      try {
        return await fetchReferrals();
      } catch (error) {
        console.error("Error fetching referrals:", error);
        return { referrals: [], referralCode: "", referralCount: 0 };
      }
    }
  });
  
  // Extract the referrals array and stats from the response
  const referrals = referralData.referrals || [];
  
  // Calculate stats from the referrals data
  const stats = {
    total: referrals.length,
    successful: referrals.filter((ref: any) => ref.status === 'completed').length,
    rewards: referrals.filter((ref: any) => ref.bonusApplied).length
  };
  
  // Form for email invitation
  const form = useForm<EmailFormValues>({
    resolver: zodResolver(emailFormSchema),
    defaultValues: {
      email: '',
    },
  });
  
  // Mutation for sending email invitation
  const sendInviteMutation = useMutation({
    mutationFn: (data: EmailFormValues) => {
      return inviteByEmail(data.email);
    },
    onSuccess: () => {
      toast({
        title: "Invitation sent",
        description: "Your friend has been invited to Hexashare!",
      });
      queryClient.invalidateQueries({ queryKey: ['/api/referrals'] });
      form.reset();
      setEmailInviteOpen(false);
    },
    onError: (error) => {
      console.error('Error sending invitation:', error);
      toast({
        title: "Failed to send invitation",
        description: "There was a problem sending your invitation.",
        variant: "destructive",
      });
    },
  });
  
  // Handle form submission
  const onSubmit = (values: EmailFormValues) => {
    sendInviteMutation.mutate(values);
  };
  
  // Get status badge for referrals
  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pending':
        return <Badge variant="outline" className="bg-yellow-50 text-yellow-700 border-yellow-300">Pending</Badge>;
      case 'completed':
        return <Badge variant="outline" className="bg-green-50 text-green-700 border-green-300">Completed</Badge>;
      case 'expired':
        return <Badge variant="outline" className="bg-neutral-100 text-neutral-700 border-neutral-300">Expired</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };
  
  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <MobileHeader />
      
      <main className="flex-1 overflow-y-auto pt-16 lg:pt-0 pb-6 px-4 sm:px-6 md:px-8 bg-neutral-50">
        <div className="pt-16 lg:pt-0">
          <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between mb-6">
            <div>
              <h1 className="text-2xl font-bold text-neutral-900">Refer a Friend</h1>
              <p className="text-neutral-600">Invite friends to Hexashare and earn rewards</p>
            </div>
            <div className="mt-4 lg:mt-0">
              <Button 
                className="bg-primary hover:bg-primary-600 text-white"
                onClick={() => setEmailInviteOpen(true)}
              >
                <Send className="h-4 w-4 mr-2" />
                Invite by Email
              </Button>
            </div>
          </div>
          
          <ReferralStats stats={stats} />
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="md:col-span-2">
              <Tabs defaultValue="active" className="w-full">
                <TabsList className="mb-4">
                  <TabsTrigger value="active">Active Referrals</TabsTrigger>
                  <TabsTrigger value="all">All Referrals</TabsTrigger>
                </TabsList>
                
                <TabsContent value="active">
                  <Card>
                    <CardHeader>
                      <CardTitle>Active Referrals</CardTitle>
                      <CardDescription>People you've invited who haven't joined yet</CardDescription>
                    </CardHeader>
                    <CardContent>
                      {referrals.filter((ref: any) => ref.status === 'pending').length > 0 ? (
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Email</TableHead>
                              <TableHead>Date Invited</TableHead>
                              <TableHead>Status</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {referrals
                              .filter((ref: any) => ref.status === 'pending')
                              .map((referral: any) => (
                                <TableRow key={referral.id}>
                                  <TableCell>{referral.referredEmail}</TableCell>
                                  <TableCell>{new Date(referral.createdAt).toLocaleDateString()}</TableCell>
                                  <TableCell>{getStatusBadge(referral.status)}</TableCell>
                                </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      ) : (
                        <div className="flex flex-col items-center justify-center py-8 text-center">
                          <Users className="h-12 w-12 text-neutral-300 mb-4" />
                          <h3 className="text-lg font-medium text-neutral-900 mb-1">No active referrals</h3>
                          <p className="text-neutral-600 max-w-sm mb-4">
                            You don't have any pending referrals. Invite friends to start earning rewards!
                          </p>
                          <Button 
                            onClick={() => setEmailInviteOpen(true)}
                            variant="outline"
                          >
                            Invite Friends
                          </Button>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </TabsContent>
                
                <TabsContent value="all">
                  <Card>
                    <CardHeader>
                      <CardTitle>All Referrals</CardTitle>
                      <CardDescription>Complete history of your referrals</CardDescription>
                    </CardHeader>
                    <CardContent>
                      {referrals.length > 0 ? (
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Email</TableHead>
                              <TableHead>Date Invited</TableHead>
                              <TableHead>Status</TableHead>
                              <TableHead>Reward Applied</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {referrals.map((referral: any) => (
                              <TableRow key={referral.id}>
                                <TableCell>{referral.referredEmail}</TableCell>
                                <TableCell>{new Date(referral.createdAt).toLocaleDateString()}</TableCell>
                                <TableCell>{getStatusBadge(referral.status)}</TableCell>
                                <TableCell>
                                  {referral.bonusApplied ? (
                                    <CheckCircle className="h-5 w-5 text-green-500" />
                                  ) : (
                                    <span className="text-neutral-400">—</span>
                                  )}
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      ) : (
                        <div className="flex flex-col items-center justify-center py-8 text-center">
                          <Share2 className="h-12 w-12 text-neutral-300 mb-4" />
                          <h3 className="text-lg font-medium text-neutral-900 mb-1">No referrals yet</h3>
                          <p className="text-neutral-600 max-w-sm mb-4">
                            Start inviting friends to Hexashare and track your referrals here.
                          </p>
                          <Button 
                            onClick={() => setEmailInviteOpen(true)}
                            variant="outline"
                          >
                            Invite Friends
                          </Button>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </TabsContent>
              </Tabs>
            </div>
            
            <div>
              <ReferralLink referralCode={referralData.referralCode || 'HEXASHARE'} />
            </div>
          </div>
        </div>
      </main>
      
      {/* Email Invite Dialog */}
      <Dialog open={emailInviteOpen} onOpenChange={setEmailInviteOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Invite a Friend</DialogTitle>
            <DialogDescription>
              Send an email invitation to your friend to join Hexashare
            </DialogDescription>
          </DialogHeader>
          
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email Address</FormLabel>
                    <FormControl>
                      <Input 
                        placeholder="friend@example.com" 
                        type="email"
                        {...field} 
                      />
                    </FormControl>
                    <FormDescription>
                      Your friend will receive an email with your referral link
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <DialogFooter className="mt-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setEmailInviteOpen(false)}
                  disabled={sendInviteMutation.isPending}
                >
                  Cancel
                </Button>
                <Button 
                  type="submit"
                  disabled={sendInviteMutation.isPending}
                >
                  {sendInviteMutation.isPending ? 
                    "Sending..." : 
                    "Send Invitation"
                  }
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  );
}