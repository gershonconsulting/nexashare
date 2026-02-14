import * as cheerio from 'cheerio';

export interface LinkedInPost {
  url: string;
  content: string;
  publishedAt: Date;
  authorName?: string;
}

export async function scrapeCompanyPosts(companyPageUrl: string): Promise<LinkedInPost[]> {
  console.log(`[LinkedInScraper] Fetching posts from: ${companyPageUrl}`);
  
  try {
    const postsUrl = getPostsFeedUrl(companyPageUrl);
    console.log(`[LinkedInScraper] Posts feed URL: ${postsUrl}`);
    
    const response = await fetch(postsUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Cache-Control': 'no-cache',
      }
    });

    if (!response.ok) {
      console.error(`[LinkedInScraper] Failed to fetch page: ${response.status}`);
      return [];
    }

    const html = await response.text();
    const posts = parseLinkedInPosts(html, companyPageUrl);
    
    console.log(`[LinkedInScraper] Found ${posts.length} posts`);
    return posts;
    
  } catch (error) {
    console.error('[LinkedInScraper] Error scraping company posts:', error);
    return [];
  }
}

function getPostsFeedUrl(companyPageUrl: string): string {
  const match = companyPageUrl.match(/linkedin\.com\/(?:company|showcase)\/([^\/\?]+)/);
  const slug = match ? match[1] : '';
  const isShowcase = companyPageUrl.includes('/showcase/');
  const type = isShowcase ? 'showcase' : 'company';
  return `https://www.linkedin.com/${type}/${slug}/posts/`;
}

function parseLinkedInPosts(html: string, companyPageUrl: string): LinkedInPost[] {
  const posts: LinkedInPost[] = [];
  const $ = cheerio.load(html);
  
  $('div[data-urn]').each((_, element) => {
    const urn = $(element).attr('data-urn');
    if (urn && urn.includes('activity')) {
      const activityId = urn.split(':').pop();
      const postUrl = `https://www.linkedin.com/feed/update/urn:li:activity:${activityId}`;
      
      const contentEl = $(element).find('.break-words');
      const content = contentEl.text().trim().slice(0, 500);
      
      if (content) {
        posts.push({
          url: postUrl,
          content: content,
          publishedAt: new Date()
        });
      }
    }
  });
  
  $('article').each((_, element) => {
    const linkEl = $(element).find('a[href*="/feed/update/"]');
    if (linkEl.length > 0) {
      const href = linkEl.attr('href');
      if (href) {
        const postUrl = href.startsWith('http') ? href : `https://www.linkedin.com${href}`;
        const contentEl = $(element).find('.break-words, .feed-shared-text');
        const content = contentEl.text().trim().slice(0, 500);
        
        if (content) {
          posts.push({
            url: postUrl,
            content: content,
            publishedAt: new Date()
          });
        }
      }
    }
  });
  
  $('[class*="feed-shared-update"]').each((_, element) => {
    const linkEl = $(element).find('a[href*="activity"]');
    if (linkEl.length > 0) {
      const href = linkEl.attr('href');
      if (href) {
        const postUrl = href.startsWith('http') ? href : `https://www.linkedin.com${href}`;
        const contentEl = $(element).find('[class*="break-words"]');
        const content = contentEl.text().trim().slice(0, 500);
        
        posts.push({
          url: postUrl,
          content: content || 'New post from company',
          publishedAt: new Date()
        });
      }
    }
  });
  
  const scriptTags = $('script[type="application/ld+json"]');
  scriptTags.each((_, element) => {
    try {
      const jsonText = $(element).html();
      if (jsonText) {
        const data = JSON.parse(jsonText);
        if (data['@type'] === 'Article' || data['@type'] === 'SocialMediaPosting') {
          posts.push({
            url: data.url || companyPageUrl,
            content: data.headline || data.description || 'New post',
            publishedAt: new Date(data.datePublished || Date.now()),
            authorName: data.author?.name
          });
        }
      }
    } catch {
    }
  });
  
  const uniquePosts = posts.filter((post, index, self) => 
    index === self.findIndex(p => p.url === post.url)
  );
  
  return uniquePosts.slice(0, 10);
}

export async function getLatestPost(companyPageUrl: string): Promise<LinkedInPost | null> {
  const posts = await scrapeCompanyPosts(companyPageUrl);
  return posts.length > 0 ? posts[0] : null;
}
