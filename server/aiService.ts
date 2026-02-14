// NexaShare AI Service
// Powered by Claude API (Anthropic)

import Anthropic from '@anthropic-ai/sdk';

// Initialize Anthropic client
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY || '',
});

const MODEL = 'claude-sonnet-4-20250514';

/**
 * Generate engaging LinkedIn comments for a post
 */
export async function generateComments(
  postContent: string,
  companyName: string,
  options: {
    tone?: 'professional' | 'casual' | 'enthusiastic' | 'thoughtful';
    count?: number;
    includeHashtags?: boolean;
    userContext?: string;
  } = {}
): Promise<string[]> {
  const { tone = 'professional', count = 3, includeHashtags = false, userContext = '' } = options;

  try {
    console.log('[AI] Generating comments for post...');

    const prompt = `You are a LinkedIn engagement expert. Generate ${count} engaging, authentic comments for this LinkedIn post.

POST CONTENT:
"""
${postContent}
"""

COMPANY: ${companyName}

${userContext ? `USER CONTEXT: ${userContext}\n` : ''}
TONE: ${tone}
${includeHashtags ? 'Include relevant hashtags where appropriate.' : 'No hashtags needed.'}

REQUIREMENTS:
- Each comment should be 1-3 sentences
- Sound natural and human, not AI-generated
- Add value to the conversation
- Be positive and professional
- Vary the style (some ask questions, some share insights, some show appreciation)
- Don't be overly promotional
- Be specific to the post content

Return ONLY the comments, one per line, no numbering, no extra text.`;

    const message = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 1024,
      messages: [
        {
          role: 'user',
          content: prompt
        }
      ]
    });

    // Extract comments from response
    const responseText = message.content[0].type === 'text' ? message.content[0].text : '';
    const comments = responseText
      .split('\n')
      .map(c => c.trim())
      .filter(c => c.length > 0 && !c.match(/^\d+[\.)]/)); // Remove numbered lists

    console.log(`[AI] Generated ${comments.length} comments`);
    return comments.slice(0, count);
  } catch (error) {
    console.error('[AI] Error generating comments:', error);
    throw new Error('Failed to generate comments');
  }
}

/**
 * Analyze post content and extract insights
 */
export async function analyzePost(postContent: string): Promise<{
  sentiment: 'positive' | 'neutral' | 'negative';
  topics: string[];
  keyPoints: string[];
  suggestedHashtags: string[];
  engagementScore: number;
  targetAudience: string;
}> {
  try {
    console.log('[AI] Analyzing post content...');

    const prompt = `Analyze this LinkedIn post and provide structured insights.

POST CONTENT:
"""
${postContent}
"""

Provide analysis in this exact JSON format:
{
  "sentiment": "positive/neutral/negative",
  "topics": ["topic1", "topic2", "topic3"],
  "keyPoints": ["point1", "point2", "point3"],
  "suggestedHashtags": ["#hashtag1", "#hashtag2", "#hashtag3"],
  "engagementScore": 0-100,
  "targetAudience": "description of target audience"
}

REQUIREMENTS:
- sentiment: Overall emotional tone
- topics: 3-5 main topics discussed
- keyPoints: 3-5 key takeaways (short phrases)
- suggestedHashtags: 5-8 relevant hashtags with #
- engagementScore: 0-100 score predicting engagement potential
- targetAudience: Who this post is for

Return ONLY valid JSON, no markdown, no extra text.`;

    const message = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 1024,
      messages: [
        {
          role: 'user',
          content: prompt
        }
      ]
    });

    const responseText = message.content[0].type === 'text' ? message.content[0].text : '{}';
    
    // Clean up response (remove markdown if present)
    const jsonText = responseText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const analysis = JSON.parse(jsonText);

    console.log('[AI] Post analysis complete');
    return analysis;
  } catch (error) {
    console.error('[AI] Error analyzing post:', error);
    throw new Error('Failed to analyze post');
  }
}

/**
 * Score multiple posts and rank them by predicted engagement
 */
export async function rankPosts(posts: Array<{ url: string; content: string }>): Promise<Array<{
  url: string;
  score: number;
  reason: string;
  shouldRepost: boolean;
}>> {
  try {
    console.log(`[AI] Ranking ${posts.length} posts...`);

    const postsText = posts.map((p, i) => `POST ${i + 1}:\n${p.content}`).join('\n\n---\n\n');

    const prompt = `You are a LinkedIn engagement expert. Rank these posts by their potential to generate engagement (likes, comments, shares).

${postsText}

For each post, provide:
1. Engagement score (0-100)
2. Brief reason why it will/won't perform well
3. Whether to repost (true/false)

Consider:
- Relevance and timeliness
- Emotional appeal
- Value to audience
- Clarity and structure
- Call-to-action
- Visual appeal indicators

Return ONLY valid JSON array:
[
  {
    "postNumber": 1,
    "score": 85,
    "reason": "Strong value proposition with clear CTA",
    "shouldRepost": true
  },
  ...
]`;

    const message = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 2048,
      messages: [
        {
          role: 'user',
          content: prompt
        }
      ]
    });

    const responseText = message.content[0].type === 'text' ? message.content[0].text : '[]';
    const jsonText = responseText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const rankings = JSON.parse(jsonText);

    // Map back to original posts
    const rankedPosts = rankings.map((r: any) => ({
      url: posts[r.postNumber - 1].url,
      score: r.score,
      reason: r.reason,
      shouldRepost: r.shouldRepost
    }));

    console.log('[AI] Post ranking complete');
    return rankedPosts;
  } catch (error) {
    console.error('[AI] Error ranking posts:', error);
    throw new Error('Failed to rank posts');
  }
}

/**
 * Generate hashtags for a post
 */
export async function generateHashtags(
  postContent: string,
  count: number = 5,
  industry?: string
): Promise<string[]> {
  try {
    console.log('[AI] Generating hashtags...');

    const prompt = `Generate ${count} relevant, popular LinkedIn hashtags for this post.

POST CONTENT:
"""
${postContent}
"""

${industry ? `INDUSTRY: ${industry}\n` : ''}

REQUIREMENTS:
- Mix of broad and specific hashtags
- Use hashtags that are actually popular on LinkedIn
- Include #trending topics when relevant
- Mix of high-volume and niche hashtags
- All hashtags should start with #

Return ONLY the hashtags, one per line, no explanations.`;

    const message = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 512,
      messages: [
        {
          role: 'user',
          content: prompt
        }
      ]
    });

    const responseText = message.content[0].type === 'text' ? message.content[0].text : '';
    const hashtags = responseText
      .split('\n')
      .map(h => h.trim())
      .filter(h => h.startsWith('#'))
      .slice(0, count);

    console.log(`[AI] Generated ${hashtags.length} hashtags`);
    return hashtags;
  } catch (error) {
    console.error('[AI] Error generating hashtags:', error);
    throw new Error('Failed to generate hashtags');
  }
}

/**
 * Create a rewritten version of a post
 */
export async function rewritePost(
  originalContent: string,
  style: 'concise' | 'detailed' | 'storytelling' | 'data-driven'
): Promise<string> {
  try {
    console.log('[AI] Rewriting post...');

    const prompt = `Rewrite this LinkedIn post in a ${style} style while maintaining the core message.

ORIGINAL POST:
"""
${originalContent}
"""

STYLE: ${style}

REQUIREMENTS:
- Keep the main points and facts
- Match the ${style} style perfectly
- Optimize for LinkedIn engagement
- Keep it professional
- Maintain authenticity
- No hashtags (user will add those)

Return ONLY the rewritten post, no explanations.`;

    const message = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 1024,
      messages: [
        {
          role: 'user',
          content: prompt
        }
      ]
    });

    const rewritten = message.content[0].type === 'text' ? message.content[0].text.trim() : '';
    console.log('[AI] Post rewritten');
    return rewritten;
  } catch (error) {
    console.error('[AI] Error rewriting post:', error);
    throw new Error('Failed to rewrite post');
  }
}

/**
 * Generate a summary of a post
 */
export async function summarizePost(postContent: string, maxLength: number = 100): Promise<string> {
  try {
    console.log('[AI] Summarizing post...');

    const prompt = `Summarize this LinkedIn post in ${maxLength} characters or less.

POST CONTENT:
"""
${postContent}
"""

REQUIREMENTS:
- Maximum ${maxLength} characters
- Capture the main point
- Professional tone
- No hashtags

Return ONLY the summary, no extra text.`;

    const message = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 256,
      messages: [
        {
          role: 'user',
          content: prompt
        }
      ]
    });

    const summary = message.content[0].type === 'text' ? message.content[0].text.trim() : '';
    console.log('[AI] Post summarized');
    return summary.slice(0, maxLength);
  } catch (error) {
    console.error('[AI] Error summarizing post:', error);
    throw new Error('Failed to summarize post');
  }
}

/**
 * Suggest best time to post based on content
 */
export async function suggestPostTime(postContent: string): Promise<{
  bestDays: string[];
  bestTimes: string[];
  reasoning: string;
}> {
  try {
    console.log('[AI] Suggesting post timing...');

    const prompt = `Based on this LinkedIn post content, suggest the best days and times to post for maximum engagement.

POST CONTENT:
"""
${postContent}
"""

Consider:
- Content type and topic
- Target audience work schedules
- LinkedIn engagement patterns
- Industry norms

Return ONLY valid JSON:
{
  "bestDays": ["Monday", "Wednesday", "Friday"],
  "bestTimes": ["9:00 AM", "12:00 PM", "5:00 PM"],
  "reasoning": "Brief explanation why these times work"
}`;

    const message = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 512,
      messages: [
        {
          role: 'user',
          content: prompt
        }
      ]
    });

    const responseText = message.content[0].type === 'text' ? message.content[0].text : '{}';
    const jsonText = responseText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const suggestion = JSON.parse(jsonText);

    console.log('[AI] Post timing suggested');
    return suggestion;
  } catch (error) {
    console.error('[AI] Error suggesting post time:', error);
    throw new Error('Failed to suggest post time');
  }
}

/**
 * Check if Anthropic API key is configured
 */
export function isAIEnabled(): boolean {
  return !!process.env.ANTHROPIC_API_KEY;
}

/**
 * Get AI service status
 */
export async function getAIStatus(): Promise<{
  enabled: boolean;
  model: string;
  features: string[];
}> {
  return {
    enabled: isAIEnabled(),
    model: MODEL,
    features: [
      'Comment Generation',
      'Post Analysis',
      'Post Ranking',
      'Hashtag Generation',
      'Post Rewriting',
      'Post Summarization',
      'Timing Suggestions'
    ]
  };
}

export default {
  generateComments,
  analyzePost,
  rankPosts,
  generateHashtags,
  rewritePost,
  summarizePost,
  suggestPostTime,
  isAIEnabled,
  getAIStatus
};
