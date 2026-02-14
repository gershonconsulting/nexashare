import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, Briefcase, Building2, CheckCircle2, XCircle, Sparkles } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface CompanySuggestion {
  name: string;
  linkedinUrl: string;
  type: 'worked' | 'education' | 'followed';
  reason: string;
}

interface CompanyStats {
  total: number;
  active: number;
  autoRepostEnabled: number;
  showcase: number;
  regular: number;
}

export function CompanyDiscovery() {
  const [suggestions, setSuggestions] = useState<CompanySuggestion[]>([]);
  const [stats, setStats] = useState<CompanyStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [autoAdding, setAutoAdding] = useState(false);
  const { toast } = useToast();

  const fetchSuggestions = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/companies/suggestions');
      if (!response.ok) throw new Error('Failed to fetch suggestions');
      
      const data = await response.json();
      setSuggestions(data.suggestions);
      
      toast({
        title: 'Companies Found',
        description: `Found ${data.count} companies from your work history`,
      });
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to fetch company suggestions',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const fetchStats = async () => {
    try {
      const response = await fetch('/api/companies/stats');
      if (!response.ok) throw new Error('Failed to fetch stats');
      
      const data = await response.json();
      setStats(data);
    } catch (error) {
      console.error('Failed to fetch stats:', error);
    }
  };

  const handleAutoAdd = async () => {
    setAutoAdding(true);
    try {
      const response = await fetch('/api/companies/auto-add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      
      if (!response.ok) throw new Error('Failed to auto-add companies');
      
      const data = await response.json();
      
      toast({
        title: 'Companies Added',
        description: `Added ${data.added} companies. ${data.skipped} were already added.`,
      });
      
      // Refresh stats
      await fetchStats();
      
      // Clear suggestions since they're now added
      setSuggestions([]);
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to auto-add companies',
        variant: 'destructive',
      });
    } finally {
      setAutoAdding(false);
    }
  };

  const getBadgeVariant = (type: string) => {
    switch (type) {
      case 'worked': return 'default';
      case 'education': return 'secondary';
      case 'followed': return 'outline';
      default: return 'default';
    }
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'worked': return <Briefcase className="w-4 h-4" />;
      case 'education': return <Building2 className="w-4 h-4" />;
      default: return <Building2 className="w-4 h-4" />;
    }
  };

  return (
    <div className="space-y-6">
      {/* Stats Card */}
      {stats && (
        <Card>
          <CardHeader>
            <CardTitle>Your Companies</CardTitle>
            <CardDescription>Overview of companies you're tracking</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="text-center p-4 bg-blue-50 rounded-lg">
                <div className="text-2xl font-bold text-blue-600">{stats.total}</div>
                <div className="text-sm text-gray-600">Total Companies</div>
              </div>
              <div className="text-center p-4 bg-green-50 rounded-lg">
                <div className="text-2xl font-bold text-green-600">{stats.autoRepostEnabled}</div>
                <div className="text-sm text-gray-600">Auto-Repost On</div>
              </div>
              <div className="text-center p-4 bg-purple-50 rounded-lg">
                <div className="text-2xl font-bold text-purple-600">{stats.showcase}</div>
                <div className="text-sm text-gray-600">Showcase Pages</div>
              </div>
              <div className="text-center p-4 bg-orange-50 rounded-lg">
                <div className="text-2xl font-bold text-orange-600">{stats.regular}</div>
                <div className="text-sm text-gray-600">Company Pages</div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Discovery Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-yellow-500" />
            Discover Companies
          </CardTitle>
          <CardDescription>
            Automatically find companies from your LinkedIn work history
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Alert>
            <AlertDescription>
              We'll analyze your LinkedIn profile to find companies you've worked for.
              You can then choose which ones to track and repost from.
            </AlertDescription>
          </Alert>

          <div className="flex gap-3">
            <Button 
              onClick={fetchSuggestions} 
              disabled={loading}
              className="flex-1"
            >
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Find My Companies
            </Button>

            <Button 
              onClick={fetchStats}
              variant="outline"
            >
              Refresh Stats
            </Button>
          </div>

          {/* Suggestions List */}
          {suggestions.length > 0 && (
            <div className="space-y-3 mt-6">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold">Found {suggestions.length} Companies</h3>
                <Button 
                  onClick={handleAutoAdd} 
                  disabled={autoAdding}
                  size="sm"
                >
                  {autoAdding && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Add All to Dashboard
                </Button>
              </div>

              <div className="space-y-2">
                {suggestions.map((suggestion, index) => (
                  <div 
                    key={index}
                    className="p-4 border rounded-lg hover:bg-gray-50 transition-colors"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          {getTypeIcon(suggestion.type)}
                          <h4 className="font-medium">{suggestion.name}</h4>
                          <Badge variant={getBadgeVariant(suggestion.type)}>
                            {suggestion.type}
                          </Badge>
                        </div>
                        <p className="text-sm text-gray-600">{suggestion.reason}</p>
                        <a 
                          href={suggestion.linkedinUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-blue-600 hover:underline mt-1 inline-block"
                        >
                          View on LinkedIn →
                        </a>
                      </div>
                      <CheckCircle2 className="w-5 h-5 text-green-500 flex-shrink-0" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Empty State */}
          {!loading && suggestions.length === 0 && (
            <div className="text-center py-8 text-gray-500">
              <Building2 className="w-12 h-12 mx-auto mb-3 text-gray-300" />
              <p>Click "Find My Companies" to discover companies from your profile</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Example: SelectUSA Showcase */}
      <Card>
        <CardHeader>
          <CardTitle>Example: Tracking Showcase Pages</CardTitle>
          <CardDescription>
            Like SelectUSA - you can track showcase pages too!
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 bg-blue-600 rounded flex items-center justify-center flex-shrink-0">
                  <Building2 className="w-6 h-6 text-white" />
                </div>
                <div className="flex-1">
                  <h4 className="font-semibold mb-1">SelectUSA (Showcase)</h4>
                  <p className="text-sm text-gray-600 mb-2">
                    Tracks posts from: <code className="text-xs bg-white px-2 py-1 rounded">
                      https://www.linkedin.com/showcase/selectusa/posts/
                    </code>
                  </p>
                  <p className="text-sm text-gray-700">
                    This app will check daily for new content and automatically repost 
                    to your LinkedIn feed using your account.
                  </p>
                </div>
              </div>
            </div>

            <Alert>
              <AlertDescription>
                <strong>How it works:</strong>
                <ol className="list-decimal list-inside mt-2 space-y-1 text-sm">
                  <li>Add company or showcase page URL</li>
                  <li>Enable auto-repost (optional)</li>
                  <li>App checks daily for new posts</li>
                  <li>Automatically shares to your feed</li>
                </ol>
              </AlertDescription>
            </Alert>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
