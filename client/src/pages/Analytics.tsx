import { useQuery } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { Sidebar } from '@/components/layout/Sidebar';
import { MobileHeader } from '@/components/layout/MobileHeader';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, TrendingUp, Users, Share2, Eye, ThumbsUp, MessageSquare, BarChart3 } from 'lucide-react';

export default function Analytics() {
  const { data: companyPages, isLoading: loadingPages } = useQuery({
    queryKey: ['/api/company-pages'],
    queryFn: async () => {
      const response = await apiRequest('GET', '/api/company-pages');
      return response.json();
    },
  });

  const { data: reposts, isLoading: loadingReposts } = useQuery({
    queryKey: ['/api/reposts'],
    queryFn: async () => {
      try {
        const response = await apiRequest('GET', '/api/reposts');
        return response.json();
      } catch {
        return [];
      }
    },
  });

  const isLoading = loadingPages || loadingReposts;

  const totalCampaigns = companyPages?.length || 0;
  const activeCampaigns = companyPages?.filter((p: any) => p.active)?.length || 0;
  const totalReposts = reposts?.length || 0;

  const mockMetrics = {
    totalImpressions: 24500,
    totalEngagements: 1850,
    totalClicks: 320,
    engagementRate: 7.6,
    clickThroughRate: 1.3,
    followerGrowth: 12.4
  };

  const recentActivity = [
    { date: '2026-01-26', action: 'Repost', campaign: 'Tech Corp', impressions: 1200, engagements: 89 },
    { date: '2026-01-25', action: 'Repost', campaign: 'Innovation Labs', impressions: 980, engagements: 72 },
    { date: '2026-01-24', action: 'Repost', campaign: 'Tech Corp', impressions: 1450, engagements: 115 },
    { date: '2026-01-23', action: 'Repost', campaign: 'GrowthScale', impressions: 2100, engagements: 180 },
    { date: '2026-01-22', action: 'Repost', campaign: 'Innovation Labs', impressions: 850, engagements: 62 },
  ];

  const formatNumber = (num: number) => {
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
    if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
    return num.toString();
  };

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <MobileHeader />

      <main className="flex-1 overflow-y-auto pt-16 lg:pt-0 pb-6 px-4 sm:px-6 md:px-8 bg-neutral-50">
        <div className="py-6">
          <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between mb-6">
            <div>
              <h1 className="text-2xl font-bold text-neutral-900">Analytics</h1>
              <p className="text-neutral-600">Track your content amplification performance</p>
            </div>
          </div>

          {isLoading ? (
            <div className="flex justify-center items-center h-64">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between pb-2">
                    <CardTitle className="text-sm font-medium text-neutral-600">Total Campaigns</CardTitle>
                    <BarChart3 className="h-4 w-4 text-neutral-400" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{totalCampaigns}</div>
                    <p className="text-xs text-neutral-500">{activeCampaigns} active</p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="flex flex-row items-center justify-between pb-2">
                    <CardTitle className="text-sm font-medium text-neutral-600">Total Reposts</CardTitle>
                    <Share2 className="h-4 w-4 text-neutral-400" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{totalReposts}</div>
                    <p className="text-xs text-neutral-500">content shared</p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="flex flex-row items-center justify-between pb-2">
                    <CardTitle className="text-sm font-medium text-neutral-600">Impressions</CardTitle>
                    <Eye className="h-4 w-4 text-neutral-400" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{formatNumber(mockMetrics.totalImpressions)}</div>
                    <p className="text-xs text-green-600 flex items-center">
                      <TrendingUp className="h-3 w-3 mr-1" />
                      +{mockMetrics.followerGrowth}% this month
                    </p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="flex flex-row items-center justify-between pb-2">
                    <CardTitle className="text-sm font-medium text-neutral-600">Engagement Rate</CardTitle>
                    <ThumbsUp className="h-4 w-4 text-neutral-400" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{mockMetrics.engagementRate}%</div>
                    <p className="text-xs text-neutral-500">{formatNumber(mockMetrics.totalEngagements)} total</p>
                  </CardContent>
                </Card>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
                <Card>
                  <CardHeader>
                    <CardTitle>Performance Overview</CardTitle>
                    <CardDescription>Key metrics from your campaigns</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      <div className="flex justify-between items-center">
                        <div className="flex items-center gap-2">
                          <Eye className="h-4 w-4 text-blue-500" />
                          <span className="text-sm">Impressions</span>
                        </div>
                        <span className="font-medium">{formatNumber(mockMetrics.totalImpressions)}</span>
                      </div>
                      <div className="w-full bg-neutral-100 rounded-full h-2">
                        <div className="bg-blue-500 h-2 rounded-full" style={{ width: '75%' }}></div>
                      </div>

                      <div className="flex justify-between items-center">
                        <div className="flex items-center gap-2">
                          <ThumbsUp className="h-4 w-4 text-green-500" />
                          <span className="text-sm">Engagements</span>
                        </div>
                        <span className="font-medium">{formatNumber(mockMetrics.totalEngagements)}</span>
                      </div>
                      <div className="w-full bg-neutral-100 rounded-full h-2">
                        <div className="bg-green-500 h-2 rounded-full" style={{ width: '45%' }}></div>
                      </div>

                      <div className="flex justify-between items-center">
                        <div className="flex items-center gap-2">
                          <MessageSquare className="h-4 w-4 text-purple-500" />
                          <span className="text-sm">Link Clicks</span>
                        </div>
                        <span className="font-medium">{formatNumber(mockMetrics.totalClicks)}</span>
                      </div>
                      <div className="w-full bg-neutral-100 rounded-full h-2">
                        <div className="bg-purple-500 h-2 rounded-full" style={{ width: '20%' }}></div>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Recent Activity</CardTitle>
                    <CardDescription>Your latest reposts and their performance</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      {recentActivity.map((activity, index) => (
                        <div key={index} className="flex items-center justify-between py-2 border-b last:border-0">
                          <div>
                            <p className="font-medium text-sm">{activity.campaign}</p>
                            <p className="text-xs text-neutral-500">{activity.date}</p>
                          </div>
                          <div className="text-right">
                            <p className="text-sm font-medium">{formatNumber(activity.impressions)} views</p>
                            <p className="text-xs text-green-600">{activity.engagements} engagements</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </div>

              <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
                <p className="text-sm text-blue-800">
                  <strong>Note:</strong> Impression and engagement metrics shown above are sample data. Your campaign and repost counts are real. Full analytics will be available with LinkedIn API integration.
                </p>
              </div>

              {totalCampaigns === 0 && (
                <Card className="text-center py-12 mt-4">
                  <CardContent>
                    <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
                      <BarChart3 className="h-6 w-6 text-primary" />
                    </div>
                    <h3 className="text-lg font-medium text-neutral-900 mb-2">No data yet</h3>
                    <p className="text-neutral-600 max-w-md mx-auto">
                      Add some campaigns and start reposting content to see your analytics here.
                    </p>
                  </CardContent>
                </Card>
              )}
            </>
          )}
        </div>
      </main>
    </div>
  );
}
