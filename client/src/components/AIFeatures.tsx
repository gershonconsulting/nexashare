import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { 
  Sparkles, MessageSquare, BarChart3, Hash, RefreshCw, 
  Clock, Lightbulb, Copy, Check, Loader2 
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

export function AIFeatures() {
  const [postContent, setPostContent] = useState('');
  const [loading, setLoading] = useState(false);
  const [comments, setComments] = useState<string[]>([]);
  const [analysis, setAnalysis] = useState<any>(null);
  const [hashtags, setHashtags] = useState<string[]>([]);
  const [rewritten, setRewritten] = useState('');
  const [timing, setTiming] = useState<any>(null);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const { toast } = useToast();

  // Generate AI comments
  const generateComments = async (tone: string = 'professional') => {
    if (!postContent.trim()) {
      toast({
        title: 'Error',
        description: 'Please enter post content first',
        variant: 'destructive',
      });
      return;
    }

    setLoading(true);
    try {
      const response = await fetch('/api/ai/generate-comments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          postContent,
          companyName: 'SelectUSA',
          tone,
          count: 5,
          includeHashtags: false
        }),
      });

      if (!response.ok) throw new Error('Failed to generate comments');

      const data = await response.json();
      setComments(data.comments);
      
      toast({
        title: 'Comments Generated! 🎉',
        description: `Generated ${data.count} AI comments`,
      });
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to generate comments',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  // Analyze post
  const analyzePost = async () => {
    if (!postContent.trim()) {
      toast({
        title: 'Error',
        description: 'Please enter post content first',
        variant: 'destructive',
      });
      return;
    }

    setLoading(true);
    try {
      const response = await fetch('/api/ai/analyze-post', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ postContent }),
      });

      if (!response.ok) throw new Error('Failed to analyze post');

      const data = await response.json();
      setAnalysis(data);
      
      toast({
        title: 'Analysis Complete! 📊',
        description: `Engagement score: ${data.engagementScore}/100`,
      });
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to analyze post',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  // Generate hashtags
  const generateHashtags = async () => {
    if (!postContent.trim()) {
      toast({
        title: 'Error',
        description: 'Please enter post content first',
        variant: 'destructive',
      });
      return;
    }

    setLoading(true);
    try {
      const response = await fetch('/api/ai/generate-hashtags', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          postContent,
          count: 8,
          industry: 'Business'
        }),
      });

      if (!response.ok) throw new Error('Failed to generate hashtags');

      const data = await response.json();
      setHashtags(data.hashtags);
      
      toast({
        title: 'Hashtags Generated! #️⃣',
        description: `Generated ${data.count} hashtags`,
      });
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to generate hashtags',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  // Rewrite post
  const rewritePost = async (style: string) => {
    if (!postContent.trim()) {
      toast({
        title: 'Error',
        description: 'Please enter post content first',
        variant: 'destructive',
      });
      return;
    }

    setLoading(true);
    try {
      const response = await fetch('/api/ai/rewrite-post', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ postContent, style }),
      });

      if (!response.ok) throw new Error('Failed to rewrite post');

      const data = await response.json();
      setRewritten(data.rewritten);
      
      toast({
        title: 'Post Rewritten! ✨',
        description: `Rewritten in ${style} style`,
      });
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to rewrite post',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  // Suggest timing
  const suggestTiming = async () => {
    if (!postContent.trim()) {
      toast({
        title: 'Error',
        description: 'Please enter post content first',
        variant: 'destructive',
      });
      return;
    }

    setLoading(true);
    try {
      const response = await fetch('/api/ai/suggest-time', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ postContent }),
      });

      if (!response.ok) throw new Error('Failed to suggest timing');

      const data = await response.json();
      setTiming(data);
      
      toast({
        title: 'Best Times Suggested! ⏰',
        description: 'Check the timing recommendations',
      });
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to suggest timing',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  // Copy to clipboard
  const copyToClipboard = (text: string, index?: number) => {
    navigator.clipboard.writeText(text);
    if (index !== undefined) {
      setCopiedIndex(index);
      setTimeout(() => setCopiedIndex(null), 2000);
    }
    toast({
      title: 'Copied! ✅',
      description: 'Copied to clipboard',
    });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="w-6 h-6 text-purple-500" />
            AI-Powered Features
          </CardTitle>
          <CardDescription>
            Supercharge your LinkedIn reposting with AI
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Alert>
            <Sparkles className="h-4 w-4" />
            <AlertDescription>
              Powered by Claude (Anthropic) - Advanced AI for professional content creation
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>

      {/* Input Section */}
      <Card>
        <CardHeader>
          <CardTitle>Post Content</CardTitle>
          <CardDescription>Enter a LinkedIn post to analyze</CardDescription>
        </CardHeader>
        <CardContent>
          <Textarea
            value={postContent}
            onChange={(e) => setPostContent(e.target.value)}
            placeholder="Paste a LinkedIn post here, or write your own..."
            className="min-h-[150px] font-mono text-sm"
          />
          <div className="mt-2 text-sm text-gray-500">
            {postContent.length} characters
          </div>
        </CardContent>
      </Card>

      {/* AI Features Tabs */}
      <Tabs defaultValue="comments" className="w-full">
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="comments">
            <MessageSquare className="w-4 h-4 mr-2" />
            Comments
          </TabsTrigger>
          <TabsTrigger value="analysis">
            <BarChart3 className="w-4 h-4 mr-2" />
            Analysis
          </TabsTrigger>
          <TabsTrigger value="hashtags">
            <Hash className="w-4 h-4 mr-2" />
            Hashtags
          </TabsTrigger>
          <TabsTrigger value="rewrite">
            <RefreshCw className="w-4 h-4 mr-2" />
            Rewrite
          </TabsTrigger>
          <TabsTrigger value="timing">
            <Clock className="w-4 h-4 mr-2" />
            Timing
          </TabsTrigger>
        </TabsList>

        {/* Comments Tab */}
        <TabsContent value="comments">
          <Card>
            <CardHeader>
              <CardTitle>AI Comment Generation</CardTitle>
              <CardDescription>
                Generate engaging comments in different tones
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-2 flex-wrap">
                <Button 
                  onClick={() => generateComments('professional')}
                  disabled={loading}
                  variant="outline"
                >
                  {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Professional
                </Button>
                <Button 
                  onClick={() => generateComments('enthusiastic')}
                  disabled={loading}
                  variant="outline"
                >
                  Enthusiastic
                </Button>
                <Button 
                  onClick={() => generateComments('thoughtful')}
                  disabled={loading}
                  variant="outline"
                >
                  Thoughtful
                </Button>
                <Button 
                  onClick={() => generateComments('casual')}
                  disabled={loading}
                  variant="outline"
                >
                  Casual
                </Button>
              </div>

              {comments.length > 0 && (
                <div className="space-y-3 mt-4">
                  <h4 className="font-semibold">Generated Comments:</h4>
                  {comments.map((comment, index) => (
                    <div 
                      key={index}
                      className="p-4 bg-gray-50 rounded-lg border relative group"
                    >
                      <p className="text-sm">{comment}</p>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="absolute top-2 right-2 opacity-0 group-hover:opacity-100"
                        onClick={() => copyToClipboard(comment, index)}
                      >
                        {copiedIndex === index ? (
                          <Check className="h-4 w-4" />
                        ) : (
                          <Copy className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Analysis Tab */}
        <TabsContent value="analysis">
          <Card>
            <CardHeader>
              <CardTitle>Post Analysis</CardTitle>
              <CardDescription>
                Deep insights about your post's potential
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Button 
                onClick={analyzePost}
                disabled={loading}
              >
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Analyze Post
              </Button>

              {analysis && (
                <div className="space-y-4 mt-4">
                  {/* Engagement Score */}
                  <div className="p-4 bg-gradient-to-r from-purple-50 to-blue-50 rounded-lg">
                    <div className="text-sm text-gray-600 mb-1">Engagement Score</div>
                    <div className="flex items-center gap-3">
                      <div className="text-4xl font-bold text-purple-600">
                        {analysis.engagementScore}
                      </div>
                      <div className="text-sm text-gray-600">/ 100</div>
                    </div>
                  </div>

                  {/* Sentiment */}
                  <div>
                    <div className="text-sm font-semibold mb-2">Sentiment:</div>
                    <Badge variant={
                      analysis.sentiment === 'positive' ? 'default' :
                      analysis.sentiment === 'neutral' ? 'secondary' : 'destructive'
                    }>
                      {analysis.sentiment.toUpperCase()}
                    </Badge>
                  </div>

                  {/* Topics */}
                  <div>
                    <div className="text-sm font-semibold mb-2">Topics:</div>
                    <div className="flex gap-2 flex-wrap">
                      {analysis.topics.map((topic: string, i: number) => (
                        <Badge key={i} variant="outline">{topic}</Badge>
                      ))}
                    </div>
                  </div>

                  {/* Key Points */}
                  <div>
                    <div className="text-sm font-semibold mb-2">Key Points:</div>
                    <ul className="list-disc list-inside space-y-1">
                      {analysis.keyPoints.map((point: string, i: number) => (
                        <li key={i} className="text-sm text-gray-700">{point}</li>
                      ))}
                    </ul>
                  </div>

                  {/* Target Audience */}
                  <div>
                    <div className="text-sm font-semibold mb-2">Target Audience:</div>
                    <p className="text-sm text-gray-700">{analysis.targetAudience}</p>
                  </div>

                  {/* Suggested Hashtags */}
                  <div>
                    <div className="text-sm font-semibold mb-2">Suggested Hashtags:</div>
                    <div className="flex gap-2 flex-wrap">
                      {analysis.suggestedHashtags.map((tag: string, i: number) => (
                        <Badge key={i} variant="secondary">{tag}</Badge>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Hashtags Tab */}
        <TabsContent value="hashtags">
          <Card>
            <CardHeader>
              <CardTitle>Hashtag Generation</CardTitle>
              <CardDescription>
                AI-powered hashtag suggestions
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Button 
                onClick={generateHashtags}
                disabled={loading}
              >
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Generate Hashtags
              </Button>

              {hashtags.length > 0 && (
                <div className="space-y-3 mt-4">
                  <div className="flex items-center justify-between">
                    <h4 className="font-semibold">Generated Hashtags:</h4>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => copyToClipboard(hashtags.join(' '))}
                    >
                      <Copy className="h-4 w-4 mr-2" />
                      Copy All
                    </Button>
                  </div>
                  <div className="flex gap-2 flex-wrap p-4 bg-gray-50 rounded-lg">
                    {hashtags.map((tag, i) => (
                      <Badge key={i} variant="secondary" className="text-base">
                        {tag}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Rewrite Tab */}
        <TabsContent value="rewrite">
          <Card>
            <CardHeader>
              <CardTitle>Post Rewriting</CardTitle>
              <CardDescription>
                Rewrite your post in different styles
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-2 flex-wrap">
                <Button 
                  onClick={() => rewritePost('concise')}
                  disabled={loading}
                  variant="outline"
                >
                  {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Concise
                </Button>
                <Button 
                  onClick={() => rewritePost('detailed')}
                  disabled={loading}
                  variant="outline"
                >
                  Detailed
                </Button>
                <Button 
                  onClick={() => rewritePost('storytelling')}
                  disabled={loading}
                  variant="outline"
                >
                  Storytelling
                </Button>
                <Button 
                  onClick={() => rewritePost('data-driven')}
                  disabled={loading}
                  variant="outline"
                >
                  Data-Driven
                </Button>
              </div>

              {rewritten && (
                <div className="mt-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="font-semibold">Rewritten Post:</h4>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => copyToClipboard(rewritten)}
                    >
                      <Copy className="h-4 w-4 mr-2" />
                      Copy
                    </Button>
                  </div>
                  <div className="p-4 bg-gray-50 rounded-lg border">
                    <p className="text-sm whitespace-pre-wrap">{rewritten}</p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Timing Tab */}
        <TabsContent value="timing">
          <Card>
            <CardHeader>
              <CardTitle>Best Time to Post</CardTitle>
              <CardDescription>
                AI suggests optimal posting times
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Button 
                onClick={suggestTiming}
                disabled={loading}
              >
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Get Suggestions
              </Button>

              {timing && (
                <div className="mt-4 space-y-4">
                  <div>
                    <div className="text-sm font-semibold mb-2">Best Days:</div>
                    <div className="flex gap-2 flex-wrap">
                      {timing.bestDays.map((day: string, i: number) => (
                        <Badge key={i} variant="default">{day}</Badge>
                      ))}
                    </div>
                  </div>

                  <div>
                    <div className="text-sm font-semibold mb-2">Best Times:</div>
                    <div className="flex gap-2 flex-wrap">
                      {timing.bestTimes.map((time: string, i: number) => (
                        <Badge key={i} variant="secondary">{time}</Badge>
                      ))}
                    </div>
                  </div>

                  <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
                    <div className="flex items-start gap-2">
                      <Lightbulb className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
                      <div>
                        <div className="text-sm font-semibold text-blue-900 mb-1">
                          Why these times?
                        </div>
                        <p className="text-sm text-blue-800">{timing.reasoning}</p>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
