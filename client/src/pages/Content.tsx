import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { Sidebar } from '@/components/layout/Sidebar';
import { MobileHeader } from '@/components/layout/MobileHeader';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Loader2, Search, FileText, ExternalLink, Calendar, Filter, Share2 } from 'lucide-react';

interface ContentItem {
  id: number;
  title: string;
  source: string;
  sourceUrl: string;
  repostUrl?: string;
  status: 'pending' | 'reposted' | 'scheduled';
  date: string;
  engagement?: number;
}

export default function Content() {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  const { data: companyPages, isLoading: loadingPages } = useQuery({
    queryKey: ['/api/company-pages'],
    queryFn: async () => {
      const response = await apiRequest('GET', '/api/company-pages');
      return response.json();
    },
  });

  const mockContent: ContentItem[] = [
    {
      id: 1,
      title: "5 Strategies for B2B Growth in 2026",
      source: "Tech Corp",
      sourceUrl: "https://linkedin.com/posts/techcorp-1234",
      repostUrl: "https://linkedin.com/posts/yourprofile-5678",
      status: 'reposted',
      date: '2026-01-26',
      engagement: 245
    },
    {
      id: 2,
      title: "The Future of AI in Enterprise Software",
      source: "Innovation Labs",
      sourceUrl: "https://linkedin.com/posts/innovationlabs-2345",
      status: 'scheduled',
      date: '2026-01-27',
    },
    {
      id: 3,
      title: "Building High-Performance Sales Teams",
      source: "GrowthScale",
      sourceUrl: "https://linkedin.com/posts/growthscale-3456",
      repostUrl: "https://linkedin.com/posts/yourprofile-7890",
      status: 'reposted',
      date: '2026-01-25',
      engagement: 189
    },
    {
      id: 4,
      title: "Product-Led Growth: A Complete Guide",
      source: "ProductFirst",
      sourceUrl: "https://linkedin.com/posts/productfirst-4567",
      status: 'pending',
      date: '2026-01-28',
    },
    {
      id: 5,
      title: "Marketing Trends to Watch This Year",
      source: "MediaPro Agency",
      sourceUrl: "https://linkedin.com/posts/mediapro-5678",
      repostUrl: "https://linkedin.com/posts/yourprofile-9012",
      status: 'reposted',
      date: '2026-01-24',
      engagement: 312
    },
  ];

  const filteredContent = mockContent.filter(item => {
    const matchesSearch = searchQuery === '' || 
      item.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.source.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesStatus = statusFilter === 'all' || item.status === statusFilter;
    
    return matchesSearch && matchesStatus;
  });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'reposted':
        return <Badge className="bg-green-100 text-green-800">Reposted</Badge>;
      case 'scheduled':
        return <Badge className="bg-blue-100 text-blue-800">Scheduled</Badge>;
      case 'pending':
        return <Badge className="bg-yellow-100 text-yellow-800">Pending</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const totalContent = mockContent.length;
  const repostedCount = mockContent.filter(c => c.status === 'reposted').length;
  const scheduledCount = mockContent.filter(c => c.status === 'scheduled').length;
  const pendingCount = mockContent.filter(c => c.status === 'pending').length;

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <MobileHeader />

      <main className="flex-1 overflow-y-auto pt-16 lg:pt-0 pb-6 px-4 sm:px-6 md:px-8 bg-neutral-50">
        <div className="py-6">
          <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between mb-6">
            <div>
              <h1 className="text-2xl font-bold text-neutral-900">Content</h1>
              <p className="text-neutral-600">Manage your reposted and scheduled content</p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 mb-6">
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-neutral-500">Total Content</p>
                    <p className="text-2xl font-bold">{totalContent}</p>
                  </div>
                  <FileText className="h-8 w-8 text-neutral-300" />
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-neutral-500">Reposted</p>
                    <p className="text-2xl font-bold text-green-600">{repostedCount}</p>
                  </div>
                  <Share2 className="h-8 w-8 text-green-200" />
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-neutral-500">Scheduled</p>
                    <p className="text-2xl font-bold text-blue-600">{scheduledCount}</p>
                  </div>
                  <Calendar className="h-8 w-8 text-blue-200" />
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-neutral-500">Pending</p>
                    <p className="text-2xl font-bold text-yellow-600">{pendingCount}</p>
                  </div>
                  <FileText className="h-8 w-8 text-yellow-200" />
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
            <p className="text-sm text-blue-800">
              <strong>Sample Data:</strong> The content shown below is example data. Use the Re-Post feature on your Dashboard to track real content.
            </p>
          </div>

          <Card>
            <CardHeader>
              <div className="flex flex-col sm:flex-row gap-4">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-400" />
                  <Input
                    placeholder="Search content..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10"
                  />
                </div>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-full sm:w-40">
                    <Filter className="h-4 w-4 mr-2" />
                    <SelectValue placeholder="Filter" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Status</SelectItem>
                    <SelectItem value="reposted">Reposted</SelectItem>
                    <SelectItem value="scheduled">Scheduled</SelectItem>
                    <SelectItem value="pending">Pending</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardHeader>
            <CardContent>
              {loadingPages ? (
                <div className="flex justify-center items-center h-64">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </div>
              ) : filteredContent.length > 0 ? (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Content</TableHead>
                        <TableHead>Source</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead>Engagement</TableHead>
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredContent.map((item) => (
                        <TableRow key={item.id}>
                          <TableCell className="font-medium max-w-xs truncate">
                            {item.title}
                          </TableCell>
                          <TableCell>{item.source}</TableCell>
                          <TableCell>{getStatusBadge(item.status)}</TableCell>
                          <TableCell>{item.date}</TableCell>
                          <TableCell>
                            {item.engagement ? `${item.engagement} interactions` : '-'}
                          </TableCell>
                          <TableCell>
                            <div className="flex gap-2">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => window.open(item.sourceUrl, '_blank')}
                              >
                                <ExternalLink className="h-4 w-4" />
                              </Button>
                              {item.repostUrl && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => window.open(item.repostUrl, '_blank')}
                                >
                                  <Share2 className="h-4 w-4 text-green-600" />
                                </Button>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center h-64">
                  <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center mb-4">
                    <FileText className="h-6 w-6 text-primary" />
                  </div>
                  <h3 className="text-lg font-medium text-neutral-900 mb-2">No content found</h3>
                  <p className="text-neutral-600 text-center max-w-md">
                    {searchQuery || statusFilter !== 'all' 
                      ? 'Try adjusting your search or filters.'
                      : 'Add campaigns and start reposting to see your content here.'}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
