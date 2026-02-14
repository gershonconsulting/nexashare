import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { Sidebar } from '@/components/layout/Sidebar';
import { MobileHeader } from '@/components/layout/MobileHeader';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Search, Loader2, Users, Filter, ExternalLink } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface Influencer {
  id: number;
  name: string;
  title: string;
  company: string;
  followers: number;
  expertise: string[];
  linkedinUrl: string;
  avatarUrl?: string;
  engagementRate: number;
}

export default function Influencers() {
  const [searchQuery, setSearchQuery] = useState('');
  const [industryFilter, setIndustryFilter] = useState('all');

  const { data: companyPages, isLoading: loadingPages } = useQuery({
    queryKey: ['/api/company-pages'],
    queryFn: async () => {
      const response = await apiRequest('GET', '/api/company-pages');
      return response.json();
    },
  });

  const extractKeywords = (pages: any[]) => {
    if (!pages || pages.length === 0) return [];
    const keywords: string[] = [];
    pages.forEach(page => {
      if (page.pageName) {
        const words = page.pageName.toLowerCase().split(/\s+/);
        keywords.push(...words);
      }
    });
    return Array.from(new Set(keywords));
  };

  const companyKeywords = extractKeywords(companyPages || []);

  const mockInfluencers: Influencer[] = [
    {
      id: 1,
      name: "Sarah Chen",
      title: "VP of Marketing",
      company: "TechCorp Inc.",
      followers: 45000,
      expertise: ["B2B Marketing", "SaaS", "Content Strategy"],
      linkedinUrl: "https://linkedin.com/in/sarahchen",
      engagementRate: 4.2
    },
    {
      id: 2,
      name: "Michael Rodriguez",
      title: "Chief Technology Officer",
      company: "Innovation Labs",
      followers: 32000,
      expertise: ["AI/ML", "Cloud Computing", "Digital Transformation"],
      linkedinUrl: "https://linkedin.com/in/mrodriguez",
      engagementRate: 3.8
    },
    {
      id: 3,
      name: "Emily Thompson",
      title: "Founder & CEO",
      company: "GrowthScale",
      followers: 89000,
      expertise: ["Startup Growth", "Venture Capital", "Leadership"],
      linkedinUrl: "https://linkedin.com/in/emilythompson",
      engagementRate: 5.1
    },
    {
      id: 4,
      name: "David Park",
      title: "Head of Sales",
      company: "Enterprise Solutions",
      followers: 28000,
      expertise: ["Enterprise Sales", "Revenue Operations", "B2B"],
      linkedinUrl: "https://linkedin.com/in/davidpark",
      engagementRate: 3.5
    },
    {
      id: 5,
      name: "Lisa Martinez",
      title: "Content Director",
      company: "MediaPro Agency",
      followers: 56000,
      expertise: ["Content Marketing", "Brand Strategy", "Social Media"],
      linkedinUrl: "https://linkedin.com/in/lisamartinez",
      engagementRate: 4.7
    },
    {
      id: 6,
      name: "James Wilson",
      title: "Product Lead",
      company: "ProductFirst",
      followers: 41000,
      expertise: ["Product Management", "UX Design", "Agile"],
      linkedinUrl: "https://linkedin.com/in/jameswilson",
      engagementRate: 4.0
    }
  ];

  const filteredInfluencers = mockInfluencers.filter(influencer => {
    const matchesSearch = searchQuery === '' || 
      influencer.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      influencer.expertise.some(e => e.toLowerCase().includes(searchQuery.toLowerCase())) ||
      influencer.company.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesIndustry = industryFilter === 'all' || 
      influencer.expertise.some(e => e.toLowerCase().includes(industryFilter.toLowerCase()));
    
    return matchesSearch && matchesIndustry;
  });

  const formatFollowers = (count: number) => {
    if (count >= 1000000) return `${(count / 1000000).toFixed(1)}M`;
    if (count >= 1000) return `${(count / 1000).toFixed(1)}K`;
    return count.toString();
  };

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <MobileHeader />

      <main className="flex-1 overflow-y-auto pt-16 lg:pt-0 pb-6 px-4 sm:px-6 md:px-8 bg-neutral-50">
        <div className="py-6">
          <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between mb-6">
            <div>
              <h1 className="text-2xl font-bold text-neutral-900">Influencers</h1>
              <p className="text-neutral-600">Find influencers related to your followed companies</p>
            </div>
          </div>

          {companyKeywords.length > 0 && (
            <div className="mb-6 p-4 bg-primary/5 rounded-lg border border-primary/20">
              <p className="text-sm font-medium text-neutral-700 mb-2">Suggested keywords from your campaigns:</p>
              <div className="flex flex-wrap gap-2">
                {companyKeywords.map((keyword, index) => (
                  <Badge 
                    key={index} 
                    variant="secondary" 
                    className="cursor-pointer hover:bg-primary hover:text-white transition-colors"
                    onClick={() => setSearchQuery(keyword)}
                  >
                    {keyword}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          <div className="flex flex-col sm:flex-row gap-4 mb-6">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-400" />
              <Input
                placeholder="Search by name, company, or expertise..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select value={industryFilter} onValueChange={setIndustryFilter}>
              <SelectTrigger className="w-full sm:w-48">
                <Filter className="h-4 w-4 mr-2" />
                <SelectValue placeholder="Filter by industry" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Industries</SelectItem>
                <SelectItem value="marketing">Marketing</SelectItem>
                <SelectItem value="technology">Technology</SelectItem>
                <SelectItem value="sales">Sales</SelectItem>
                <SelectItem value="product">Product</SelectItem>
                <SelectItem value="content">Content</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
            <p className="text-sm text-blue-800">
              <strong>Sample Data:</strong> The influencers shown below are examples. Connect your LinkedIn account with full API access to discover real influencers in your industry.
            </p>
          </div>

          {loadingPages ? (
            <div className="flex justify-center items-center h-64">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : filteredInfluencers.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredInfluencers.map((influencer) => (
                <Card key={influencer.id} className="hover:shadow-lg transition-shadow">
                  <CardHeader className="pb-3">
                    <div className="flex items-start gap-4">
                      <Avatar className="h-12 w-12">
                        <AvatarImage src={influencer.avatarUrl} />
                        <AvatarFallback className="bg-primary/10 text-primary">
                          {influencer.name.split(' ').map(n => n[0]).join('')}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <CardTitle className="text-base truncate">{influencer.name}</CardTitle>
                        <CardDescription className="truncate">{influencer.title}</CardDescription>
                        <p className="text-sm text-neutral-500 truncate">{influencer.company}</p>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center gap-4 mb-4 text-sm">
                      <div className="flex items-center gap-1">
                        <Users className="h-4 w-4 text-neutral-400" />
                        <span className="font-medium">{formatFollowers(influencer.followers)}</span>
                        <span className="text-neutral-500">followers</span>
                      </div>
                      <div>
                        <span className="font-medium text-green-600">{influencer.engagementRate}%</span>
                        <span className="text-neutral-500 ml-1">engagement</span>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-1 mb-4">
                      {influencer.expertise.slice(0, 3).map((tag, index) => (
                        <Badge key={index} variant="outline" className="text-xs">
                          {tag}
                        </Badge>
                      ))}
                    </div>
                    <Button 
                      variant="outline" 
                      size="sm" 
                      className="w-full"
                      onClick={() => window.open(influencer.linkedinUrl, '_blank')}
                    >
                      <ExternalLink className="h-4 w-4 mr-2" />
                      View Profile
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-64 bg-white rounded-lg border border-neutral-200 p-6">
              <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center mb-4">
                <Users className="h-6 w-6 text-primary" />
              </div>
              <h3 className="text-lg font-medium text-neutral-900 mb-2">No influencers found</h3>
              <p className="text-neutral-600 text-center max-w-md">
                Try adjusting your search terms or filters to find relevant influencers.
              </p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
