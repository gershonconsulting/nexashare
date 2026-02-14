import { Router, Request, Response } from 'express';
import * as aiService from './aiService.js';
import { storage } from './storage.js';

const router = Router();

/**
 * POST /api/ai/generate-comments
 * Generate AI comments for a post
 */
router.post('/generate-comments', async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId;
    if (!userId) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    if (!aiService.isAIEnabled()) {
      return res.status(503).json({ 
        message: 'AI service not configured. Please set ANTHROPIC_API_KEY.' 
      });
    }

    const { postContent, companyName, tone, count, includeHashtags, userContext } = req.body;

    if (!postContent) {
      return res.status(400).json({ message: 'postContent is required' });
    }

    console.log(`[AI API] Generating comments for user ${userId}`);

    const comments = await aiService.generateComments(postContent, companyName || 'Company', {
      tone,
      count: count || 3,
      includeHashtags,
      userContext
    });

    res.json({
      comments,
      count: comments.length
    });
  } catch (error) {
    console.error('[AI API] Error generating comments:', error);
    res.status(500).json({ 
      message: 'Failed to generate comments',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * POST /api/ai/analyze-post
 * Analyze a post and get insights
 */
router.post('/analyze-post', async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId;
    if (!userId) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    if (!aiService.isAIEnabled()) {
      return res.status(503).json({ 
        message: 'AI service not configured' 
      });
    }

    const { postContent } = req.body;

    if (!postContent) {
      return res.status(400).json({ message: 'postContent is required' });
    }

    console.log(`[AI API] Analyzing post for user ${userId}`);

    const analysis = await aiService.analyzePost(postContent);

    res.json(analysis);
  } catch (error) {
    console.error('[AI API] Error analyzing post:', error);
    res.status(500).json({ 
      message: 'Failed to analyze post',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * POST /api/ai/rank-posts
 * Rank multiple posts by predicted engagement
 */
router.post('/rank-posts', async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId;
    if (!userId) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    if (!aiService.isAIEnabled()) {
      return res.status(503).json({ 
        message: 'AI service not configured' 
      });
    }

    const { posts } = req.body;

    if (!Array.isArray(posts) || posts.length === 0) {
      return res.status(400).json({ message: 'posts array is required' });
    }

    console.log(`[AI API] Ranking ${posts.length} posts for user ${userId}`);

    const rankings = await aiService.rankPosts(posts);

    res.json({
      rankings,
      topPosts: rankings.filter(r => r.shouldRepost).slice(0, 5)
    });
  } catch (error) {
    console.error('[AI API] Error ranking posts:', error);
    res.status(500).json({ 
      message: 'Failed to rank posts',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * POST /api/ai/generate-hashtags
 * Generate hashtags for a post
 */
router.post('/generate-hashtags', async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId;
    if (!userId) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    if (!aiService.isAIEnabled()) {
      return res.status(503).json({ 
        message: 'AI service not configured' 
      });
    }

    const { postContent, count, industry } = req.body;

    if (!postContent) {
      return res.status(400).json({ message: 'postContent is required' });
    }

    console.log(`[AI API] Generating hashtags for user ${userId}`);

    const hashtags = await aiService.generateHashtags(postContent, count || 5, industry);

    res.json({
      hashtags,
      count: hashtags.length
    });
  } catch (error) {
    console.error('[AI API] Error generating hashtags:', error);
    res.status(500).json({ 
      message: 'Failed to generate hashtags',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * POST /api/ai/rewrite-post
 * Rewrite a post in different style
 */
router.post('/rewrite-post', async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId;
    if (!userId) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    if (!aiService.isAIEnabled()) {
      return res.status(503).json({ 
        message: 'AI service not configured' 
      });
    }

    const { postContent, style } = req.body;

    if (!postContent) {
      return res.status(400).json({ message: 'postContent is required' });
    }

    if (!['concise', 'detailed', 'storytelling', 'data-driven'].includes(style)) {
      return res.status(400).json({ 
        message: 'style must be one of: concise, detailed, storytelling, data-driven' 
      });
    }

    console.log(`[AI API] Rewriting post in ${style} style for user ${userId}`);

    const rewritten = await aiService.rewritePost(postContent, style);

    res.json({
      original: postContent,
      rewritten,
      style
    });
  } catch (error) {
    console.error('[AI API] Error rewriting post:', error);
    res.status(500).json({ 
      message: 'Failed to rewrite post',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * POST /api/ai/summarize-post
 * Summarize a post
 */
router.post('/summarize-post', async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId;
    if (!userId) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    if (!aiService.isAIEnabled()) {
      return res.status(503).json({ 
        message: 'AI service not configured' 
      });
    }

    const { postContent, maxLength } = req.body;

    if (!postContent) {
      return res.status(400).json({ message: 'postContent is required' });
    }

    console.log(`[AI API] Summarizing post for user ${userId}`);

    const summary = await aiService.summarizePost(postContent, maxLength);

    res.json({
      original: postContent,
      summary,
      originalLength: postContent.length,
      summaryLength: summary.length
    });
  } catch (error) {
    console.error('[AI API] Error summarizing post:', error);
    res.status(500).json({ 
      message: 'Failed to summarize post',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * POST /api/ai/suggest-time
 * Suggest best time to post
 */
router.post('/suggest-time', async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId;
    if (!userId) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    if (!aiService.isAIEnabled()) {
      return res.status(503).json({ 
        message: 'AI service not configured' 
      });
    }

    const { postContent } = req.body;

    if (!postContent) {
      return res.status(400).json({ message: 'postContent is required' });
    }

    console.log(`[AI API] Suggesting post time for user ${userId}`);

    const suggestion = await aiService.suggestPostTime(postContent);

    res.json(suggestion);
  } catch (error) {
    console.error('[AI API] Error suggesting post time:', error);
    res.status(500).json({ 
      message: 'Failed to suggest post time',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * POST /api/ai/save-comment-suggestion
 * Save an AI-generated comment to database for a post
 */
router.post('/save-comment-suggestion', async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId;
    if (!userId) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const { postId, commentText } = req.body;

    if (!postId || !commentText) {
      return res.status(400).json({ message: 'postId and commentText are required' });
    }

    console.log(`[AI API] Saving comment suggestion for post ${postId}`);

    const suggestion = await storage.createCommentSuggestion({
      postId,
      commentText
    });

    res.json(suggestion);
  } catch (error) {
    console.error('[AI API] Error saving comment suggestion:', error);
    res.status(500).json({ 
      message: 'Failed to save comment suggestion',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * GET /api/ai/comment-suggestions/:postId
 * Get saved comment suggestions for a post
 */
router.get('/comment-suggestions/:postId', async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId;
    if (!userId) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const postId = parseInt(req.params.postId);

    if (isNaN(postId)) {
      return res.status(400).json({ message: 'Invalid postId' });
    }

    console.log(`[AI API] Getting comment suggestions for post ${postId}`);

    const suggestions = await storage.getCommentSuggestions(postId);

    res.json({
      suggestions,
      count: suggestions.length
    });
  } catch (error) {
    console.error('[AI API] Error getting comment suggestions:', error);
    res.status(500).json({ 
      message: 'Failed to get comment suggestions',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * GET /api/ai/status
 * Get AI service status
 */
router.get('/status', async (req: Request, res: Response) => {
  try {
    const status = await aiService.getAIStatus();
    res.json(status);
  } catch (error) {
    console.error('[AI API] Error getting AI status:', error);
    res.status(500).json({ 
      message: 'Failed to get AI status',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

export default router;
