import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Sidebar } from "@/components/layout/Sidebar";
import { MobileHeader } from "@/components/layout/MobileHeader";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";

export default function Dashboard() {
  const { toast } = useToast();
  const [companyLink, setCompanyLink] = useState("");
  const [isEnabled, setIsEnabled] = useState(true);
  const [postUrl, setPostUrl] = useState("");
  const [repostComment, setRepostComment] = useState("");

  const { data: companyPagesData, isLoading: pagesLoading } = useQuery<any[]>({
    queryKey: ["/api/company-pages"],
  });

  const { data: postsData, isLoading: postsLoading } = useQuery<any[]>({
    queryKey: ["/api/posts"],
  });

  const { data: repostsData, isLoading: repostsLoading } = useQuery<any[]>({
    queryKey: ["/api/reposts"],
  });

  const activeCompanyPage = companyPagesData?.[0];

  useEffect(() => {
    if (activeCompanyPage) {
      setCompanyLink(activeCompanyPage.linkedinPageUrl || "");
      setIsEnabled(activeCompanyPage.autoRepost === true);
    }
  }, [activeCompanyPage]);

  const extractCompanyName = (url: string): string => {
    try {
      const match = url.match(/linkedin\.com\/company\/([^\/\?]+)/);
      if (match && match[1]) {
        return match[1]
          .replace(/-/g, ' ')
          .replace(/\b\w/g, c => c.toUpperCase());
      }
    } catch {}
    return "My Company";
  };

  const saveMutation = useMutation({
    mutationFn: async (data: { linkedinPageUrl: string; active: boolean }) => {
      if (activeCompanyPage) {
        return apiRequest("PUT", `/api/company-pages/${activeCompanyPage.id}`, {
          linkedinPageUrl: data.linkedinPageUrl,
          active: data.active,
          autoRepost: data.active
        });
      } else {
        const companyName = extractCompanyName(data.linkedinPageUrl);
        return apiRequest("POST", "/api/company-pages", {
          pageName: companyName,
          linkedinPageUrl: data.linkedinPageUrl,
          repostFrequency: "daily",
          active: data.active,
          autoRepost: data.active
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/company-pages"] });
      toast({
        title: "Saved",
        description: "Company link has been saved successfully.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to save company link.",
        variant: "destructive"
      });
    }
  });

  const handleSave = () => {
    saveMutation.mutate({ linkedinPageUrl: companyLink, active: isEnabled });
  };

  const repostMutation = useMutation({
    mutationFn: async (data: { postUrl: string; comment: string }) => {
      return apiRequest("POST", "/api/linkedin/share", {
        postUrl: data.postUrl,
        comment: data.comment,
        companyPageId: activeCompanyPage?.id
      });
    },
    onSuccess: async (response) => {
      const result = await response.json();
      queryClient.invalidateQueries({ queryKey: ["/api/reposts"] });
      queryClient.invalidateQueries({ queryKey: ["/api/posts"] });
      setPostUrl("");
      setRepostComment("");
      toast({
        title: "Reposted successfully!",
        description: "The content has been shared to your LinkedIn feed.",
      });
    },
    onError: (error: Error) => {
      let message = "Failed to share content to LinkedIn.";
      // apiRequest throws Error with format "status: body"
      const errorMsg = error.message || "";
      if (errorMsg.includes("401")) {
        message = "Your LinkedIn session has expired. Please log in again.";
      } else if (errorMsg.includes(":")) {
        // Try to parse the JSON body from the error message (format: "401: {...}")
        try {
          const jsonPart = errorMsg.substring(errorMsg.indexOf(":") + 1).trim();
          const parsed = JSON.parse(jsonPart);
          if (parsed.requiresReauth) {
            message = "Your LinkedIn session has expired. Please log in again.";
          } else if (parsed.message) {
            message = parsed.message;
          }
        } catch {
          // Use raw error message if JSON parsing fails
          if (errorMsg.length < 200) {
            message = errorMsg;
          }
        }
      }
      toast({
        title: "Repost failed",
        description: message,
        variant: "destructive"
      });
    }
  });

  const handleRepost = () => {
    if (!postUrl) {
      toast({
        title: "Post URL required",
        description: "Please enter the LinkedIn post URL you want to repost.",
        variant: "destructive"
      });
      return;
    }
    repostMutation.mutate({ postUrl, comment: repostComment });
  };

  const repostHistory = (postsData || []).map((post: any) => {
    const repost = repostsData?.find((r: any) => r.postId === post.id);
    return {
      id: post.id,
      date: new Date(post.publishedAt || post.createdAt).toLocaleDateString('en-CA'),
      companyPostLink: post.postUrl || "",
      userRepostLink: repost?.repostUrl || "",
      postText: post.content || post.title || ""
    };
  });

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <MobileHeader />
      
      <main className="flex-1 overflow-y-auto pt-16 lg:pt-0 pb-6 px-4 sm:px-6 md:px-8 bg-neutral-50">
        <div className="pt-8 lg:pt-6 max-w-6xl mx-auto">
          <h1 className="text-2xl font-bold text-neutral-900 mb-6">Re-Post Feature</h1>
          
          <div className="bg-white rounded-lg shadow-sm border border-neutral-200 p-6 mb-8">
            <div className="flex items-center gap-3 mb-4">
              <Switch 
                checked={isEnabled} 
                onCheckedChange={setIsEnabled}
                className="data-[state=checked]:bg-primary"
              />
              <span className={`px-3 py-1 rounded text-sm font-medium ${isEnabled ? 'bg-primary text-white' : 'bg-neutral-200 text-neutral-600'}`}>
                {isEnabled ? 'Enabled' : 'Disabled'}
              </span>
            </div>

            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
              <label className="text-sm font-medium text-neutral-700 whitespace-nowrap">
                Company Link :
              </label>
              <Input
                type="url"
                value={companyLink}
                onChange={(e) => setCompanyLink(e.target.value)}
                placeholder="https://linkedin.com/company/your-company"
                className="flex-1 max-w-lg"
              />
              <Button 
                onClick={handleSave}
                disabled={saveMutation.isPending}
                className="bg-primary hover:bg-primary-dark text-white"
              >
                {saveMutation.isPending ? 'Saving...' : 'Save'}
              </Button>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow-sm border border-neutral-200 p-6 mb-8">
            <h2 className="text-lg font-semibold text-neutral-900 mb-4">Quick Repost</h2>
            <p className="text-sm text-neutral-600 mb-4">
              Paste a LinkedIn post URL below to share it to your feed instantly.
            </p>
            
            <div className="space-y-3">
              <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
                <label className="text-sm font-medium text-neutral-700 whitespace-nowrap min-w-[100px]">
                  Post URL :
                </label>
                <Input
                  type="url"
                  value={postUrl}
                  onChange={(e) => setPostUrl(e.target.value)}
                  placeholder="https://linkedin.com/feed/update/urn:li:activity:..."
                  className="flex-1"
                />
              </div>
              
              <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
                <label className="text-sm font-medium text-neutral-700 whitespace-nowrap min-w-[100px]">
                  Comment :
                </label>
                <Input
                  type="text"
                  value={repostComment}
                  onChange={(e) => setRepostComment(e.target.value)}
                  placeholder="Optional comment to add when sharing..."
                  className="flex-1"
                />
              </div>
              
              <div className="flex justify-end">
                <Button 
                  onClick={handleRepost}
                  disabled={repostMutation.isPending || !postUrl}
                  className="bg-blue-600 hover:bg-blue-700 text-white"
                >
                  {repostMutation.isPending ? 'Sharing...' : 'Share to My Feed'}
                </Button>
              </div>
            </div>
          </div>

          <h2 className="text-xl font-bold text-neutral-900 mb-4">Re-Post History</h2>
          
          <div className="bg-white rounded-lg shadow-sm border border-neutral-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-[#1e40af] text-white text-sm">
                    <th className="py-3 px-4 text-left font-medium">Date</th>
                    <th className="py-3 px-4 text-left font-medium">Company Post Link</th>
                    <th className="py-3 px-4 text-left font-medium">User Feed Re-Post Link</th>
                    <th className="py-3 px-4 text-left font-medium">Post Text</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-200">
                  {postsLoading || repostsLoading ? (
                    <tr>
                      <td colSpan={4} className="py-8 text-center text-neutral-500">
                        Loading re-post history...
                      </td>
                    </tr>
                  ) : repostHistory.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="py-8 text-center text-neutral-500">
                        No re-posts yet. Add a company link above to start tracking posts.
                      </td>
                    </tr>
                  ) : (
                    repostHistory.map((item, index) => (
                      <tr key={item.id} className={index % 2 === 0 ? 'bg-white' : 'bg-neutral-50'}>
                        <td className="py-3 px-4 text-sm text-neutral-700 whitespace-nowrap">
                          {item.date}
                        </td>
                        <td className="py-3 px-4 text-sm">
                          {item.companyPostLink ? (
                            <a 
                              href={item.companyPostLink}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-blue-600 hover:text-blue-800 hover:underline break-all"
                            >
                              {item.companyPostLink}
                            </a>
                          ) : (
                            <span className="text-neutral-400">-</span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-sm">
                          {item.userRepostLink ? (
                            <a 
                              href={item.userRepostLink}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-blue-600 hover:text-blue-800 hover:underline break-all"
                            >
                              {item.userRepostLink}
                            </a>
                          ) : (
                            <span className="text-neutral-400">-</span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-sm text-neutral-700 max-w-xs">
                          <p className="line-clamp-3">{item.postText || '-'}</p>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
