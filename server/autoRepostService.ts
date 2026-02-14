import { db } from "./db";
import { storage } from "./storage";
import { companyPages, posts, users } from "@shared/schema";
import { eq, and, isNotNull, lt, or } from "drizzle-orm";
import { getLatestPost, type LinkedInPost } from "./linkedinScraper";

const CHECK_INTERVAL_MS = 5 * 60 * 1000; // Check every 5 minutes
const DAILY_MS = 24 * 60 * 60 * 1000;
const WEEKLY_MS = 7 * 24 * 60 * 60 * 1000;

async function getCompanyLatestPost(linkedinPageUrl: string): Promise<LinkedInPost | null> {
  console.log(`[AutoRepost] Checking company page: ${linkedinPageUrl}`);
  try {
    const post = await getLatestPost(linkedinPageUrl);
    if (post) {
      console.log(`[AutoRepost] Found post: ${post.url}`);
    }
    return post;
  } catch (error) {
    console.error(`[AutoRepost] Error fetching posts:`, error);
    return null;
  }
}

async function shareToLinkedIn(
  accessToken: string, 
  linkedinId: string, 
  postUrl: string, 
  comment: string
): Promise<{ success: boolean; linkedinPostId?: string; error?: string }> {
  try {
    // Use the LinkedIn Posts API (v2)
    const sharePayload = {
      author: `urn:li:person:${linkedinId}`,
      lifecycleState: "PUBLISHED",
      visibility: "PUBLIC",
      commentary: comment,
      distribution: {
        feedDistribution: "MAIN_FEED",
        targetEntities: [],
        thirdPartyDistributionChannels: []
      },
      content: {
        article: {
          source: postUrl,
          title: "Shared post"
        }
      }
    };

    console.log(`[AutoRepost] Posting to LinkedIn for person:${linkedinId}`);

    const shareResponse = await fetch("https://api.linkedin.com/rest/posts", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        "LinkedIn-Version": "202401",
        "X-Restli-Protocol-Version": "2.0.0"
      },
      body: JSON.stringify(sharePayload)
    });

    if (!shareResponse.ok) {
      const errorText = await shareResponse.text();
      console.error(`[AutoRepost] LinkedIn share error: ${shareResponse.status}`, errorText);
      return { success: false, error: errorText };
    }

    const linkedinPostId = shareResponse.headers.get("x-restli-id") || "unknown";
    console.log(`[AutoRepost] LinkedIn share success: ${linkedinPostId}`);
    return { success: true, linkedinPostId };
  } catch (error) {
    console.error("[AutoRepost] Error sharing to LinkedIn:", error);
    return { success: false, error: String(error) };
  }
}

function shouldRepost(
  repostFrequency: string, 
  lastAutoRepost: Date | null
): boolean {
  if (!lastAutoRepost) return true;
  
  const now = new Date();
  const timeSinceLastRepost = now.getTime() - lastAutoRepost.getTime();
  
  switch (repostFrequency) {
    case 'daily':
      return timeSinceLastRepost >= DAILY_MS;
    case 'weekly':
      return timeSinceLastRepost >= WEEKLY_MS;
    case 'realtime':
    case 'all_time':
      return true;
    default:
      return timeSinceLastRepost >= WEEKLY_MS;
  }
}

async function processAutoReposts(): Promise<void> {
  console.log("[AutoRepost] Starting auto-repost check...");
  
  try {
    const activePages = await db.select()
      .from(companyPages)
      .where(
        and(
          eq(companyPages.active, true),
          eq(companyPages.autoRepost, true)
        )
      );

    console.log(`[AutoRepost] Found ${activePages.length} pages with auto-repost enabled`);

    for (const page of activePages) {
      try {
        if (!shouldRepost(page.repostFrequency, page.lastAutoRepost)) {
          console.log(`[AutoRepost] Skipping ${page.pageName} - not due for repost yet`);
          continue;
        }

        const user = await storage.getUser(page.userId);
        if (!user) {
          console.log(`[AutoRepost] User ${page.userId} not found, skipping`);
          continue;
        }

        if (!user.linkedinAccessToken || !user.linkedinId) {
          console.log(`[AutoRepost] User ${user.id} has no LinkedIn access token, skipping`);
          continue;
        }

        if (user.linkedinTokenExpiry && new Date(user.linkedinTokenExpiry) < new Date()) {
          console.log(`[AutoRepost] User ${user.id} LinkedIn token expired, skipping`);
          continue;
        }

        const latestPost = await getCompanyLatestPost(page.linkedinPageUrl);
        
        if (!latestPost) {
          console.log(`[AutoRepost] No new posts found for ${page.pageName}`);
          continue;
        }

        const existingPost = await storage.getPostByUrl(latestPost.url);
        if (existingPost) {
          console.log(`[AutoRepost] Post already exists for ${page.pageName}, checking if already reposted`);
          const userReposts = await storage.getUserReposts(user.id);
          const alreadyReposted = userReposts.some(r => r.postId === existingPost.id);
          if (alreadyReposted) {
            console.log(`[AutoRepost] Already reposted this post, skipping`);
            continue;
          }
        }

        const comment = `Sharing this great content from ${page.pageName}! #NexaShare`;
        
        const shareResult = await shareToLinkedIn(
          user.linkedinAccessToken,
          user.linkedinId,
          latestPost.url,
          comment
        );

        if (shareResult.success) {
          let post = existingPost;
          if (!post) {
            post = await storage.createPost({
              companyPageId: page.id,
              postUrl: latestPost.url,
              content: latestPost.content,
              postType: "article",
              publishedAt: latestPost.publishedAt
            });
          }

          await storage.createRepost({
            postId: post.id,
            userId: user.id,
            comment: comment
          });

          await storage.updateCompanyPage(page.id, { 
            lastAutoRepost: new Date(),
            lastChecked: new Date()
          });

          console.log(`[AutoRepost] Successfully auto-reposted for ${page.pageName}`);
        } else {
          console.error(`[AutoRepost] Failed to share for ${page.pageName}:`, shareResult.error);
        }

      } catch (pageError) {
        console.error(`[AutoRepost] Error processing page ${page.id}:`, pageError);
      }
    }

    console.log("[AutoRepost] Auto-repost check completed");
  } catch (error) {
    console.error("[AutoRepost] Error in auto-repost service:", error);
  }
}

let intervalId: NodeJS.Timeout | null = null;

export function startAutoRepostService(): void {
  console.log("[AutoRepost] Starting auto-repost service...");
  
  processAutoReposts();
  
  intervalId = setInterval(processAutoReposts, CHECK_INTERVAL_MS);
  console.log(`[AutoRepost] Service started, checking every ${CHECK_INTERVAL_MS / 1000} seconds`);
}

export function stopAutoRepostService(): void {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
    console.log("[AutoRepost] Service stopped");
  }
}

export { processAutoReposts };
