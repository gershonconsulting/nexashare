import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface Post {
  id: number;
  title: string;
  excerpt: string;
  type: "article" | "image" | "video" | string;
  page: string;
  date: string;
  engagement: number;
  reposts: number;
  linkedinUrl?: string;
}

interface RecentPostsProps {
  posts: Post[];
  companyPages: { id: string; name: string; linkedinUrl?: string }[];
  onAmplify: (postId: number) => void;
}

export function RecentPosts({ posts, companyPages, onAmplify }: RecentPostsProps) {
  const [selectedPage, setSelectedPage] = useState("all");
  
  // Filter posts by selected page
  const filteredPosts = selectedPage === "all" 
    ? posts 
    : posts.filter(post => post.page === selectedPage);
  
  // Get icon for post type
  const getPostIcon = (type: Post['type']) => {
    switch (type) {
      case "article":
        return "fas fa-file-lines";
      case "image":
        return "fas fa-image";
      case "video":
        return "fas fa-video";
      default:
        return "fas fa-file-lines";
    }
  };
  
  // Get color class for engagement percentage
  const getEngagementColor = (percentage: number) => {
    if (percentage >= 70) return "bg-success";
    if (percentage >= 40) return "bg-warning";
    return "bg-error";
  };
  
  return (
    <div className="bg-white rounded-lg shadow-sm border border-neutral-200 p-6 mb-8">
      <div className="flex justify-between items-center mb-6">
        <h3 className="font-semibold text-neutral-900">Recent LinkedIn Posts</h3>
        <div className="relative">
          <Select value={selectedPage} onValueChange={setSelectedPage}>
            <SelectTrigger className="w-[150px] bg-neutral-50 border border-neutral-200 text-neutral-700 py-1 text-sm">
              <SelectValue placeholder="All Pages" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Pages</SelectItem>
              {companyPages.map(page => (
                <SelectItem key={page.id} value={page.name}>{page.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="text-left text-sm text-neutral-500 border-b border-neutral-200">
              <th className="pb-3 font-medium">Post</th>
              <th className="pb-3 font-medium">Page</th>
              <th className="pb-3 font-medium">Date</th>
              <th className="pb-3 font-medium">Engagement</th>
              <th className="pb-3 font-medium">Reposts</th>
              <th className="pb-3 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-200">
            {filteredPosts.map(post => (
              <tr key={post.id} className="text-sm">
                <td className="py-4 pr-4">
                  <div className="flex items-center">
                    <div className="h-10 w-10 rounded bg-neutral-100 flex items-center justify-center mr-3">
                      <i className={`${getPostIcon(post.type)} text-neutral-400`}></i>
                    </div>
                    <div className="max-w-xs truncate">
                      <p className="font-medium text-neutral-900">{post.title}</p>
                      <p className="text-xs text-neutral-500 mt-1 truncate">{post.excerpt}</p>
                    </div>
                  </div>
                </td>
                <td className="py-4 px-4">
                  <span className="text-neutral-700">{post.page}</span>
                </td>
                <td className="py-4 px-4">
                  <span className="text-neutral-700">{post.date}</span>
                </td>
                <td className="py-4 px-4">
                  <div className="flex items-center">
                    <div className="h-2 w-32 bg-neutral-100 rounded overflow-hidden">
                      <div 
                        className={`h-full ${getEngagementColor(post.engagement)}`} 
                        style={{ width: `${post.engagement}%` }}
                      ></div>
                    </div>
                    <span className="ml-2 text-neutral-700">{post.engagement}%</span>
                  </div>
                </td>
                <td className="py-4 px-4">
                  <span className="text-neutral-700">{post.reposts}</span>
                </td>
                <td className="py-4 pl-4">
                  <div className="flex items-center gap-2">
                    {post.linkedinUrl && (
                      <a 
                        href={post.linkedinUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[#0A66C2] hover:text-[#084e94] font-medium text-sm"
                      >
                        <i className="fab fa-linkedin mr-1"></i>
                        View
                      </a>
                    )}
                    <Button 
                      variant="link" 
                      className="text-primary hover:text-primary-dark font-medium p-0"
                      onClick={() => onAmplify(post.id)}
                    >
                      Amplify
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
