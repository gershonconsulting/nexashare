import { Router, Request, Response } from 'express';
import { getCompanySuggestions, autoAddUserCompanies, validateLinkedInUrl, isShowcasePage } from './companyDiscovery.js';
import { storage } from './storage.js';

const router = Router();

/**
 * GET /api/companies/suggestions
 * Get company suggestions based on user's LinkedIn profile
 */
router.get('/suggestions', async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId;
    
    if (!userId) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    console.log(`[API] Fetching company suggestions for user ${userId}`);
    const suggestions = await getCompanySuggestions(userId);

    res.json({
      suggestions,
      count: suggestions.length
    });
  } catch (error) {
    console.error('[API] Error fetching company suggestions:', error);
    res.status(500).json({ message: 'Failed to fetch company suggestions' });
  }
});

/**
 * POST /api/companies/auto-add
 * Automatically add companies from user's work history
 */
router.post('/auto-add', async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId;
    
    if (!userId) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    console.log(`[API] Auto-adding companies for user ${userId}`);
    const result = await autoAddUserCompanies(userId);

    res.json({
      message: `Successfully added ${result.added} companies`,
      added: result.added,
      skipped: result.skipped,
      errors: result.errors
    });
  } catch (error) {
    console.error('[API] Error auto-adding companies:', error);
    res.status(500).json({ message: 'Failed to auto-add companies' });
  }
});

/**
 * POST /api/companies/validate
 * Validate a LinkedIn company/showcase URL
 */
router.post('/validate', (req: Request, res: Response) => {
  try {
    const { url } = req.body;
    
    if (!url) {
      return res.status(400).json({ message: 'URL is required' });
    }

    const validation = validateLinkedInUrl(url);
    
    if (!validation.valid) {
      return res.status(400).json({ 
        valid: false, 
        error: validation.error 
      });
    }

    res.json({
      valid: true,
      type: validation.type,
      isShowcase: isShowcasePage(url),
      message: `Valid ${validation.type} page`
    });
  } catch (error) {
    console.error('[API] Error validating URL:', error);
    res.status(500).json({ message: 'Failed to validate URL' });
  }
});

/**
 * POST /api/companies/bulk-enable
 * Enable auto-repost for multiple companies at once
 */
router.post('/bulk-enable', async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId;
    const { companyIds, autoRepost, repostFrequency } = req.body;
    
    if (!userId) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    if (!Array.isArray(companyIds)) {
      return res.status(400).json({ message: 'companyIds must be an array' });
    }

    console.log(`[API] Bulk enabling auto-repost for ${companyIds.length} companies`);
    
    let updated = 0;
    const errors: string[] = [];

    for (const companyId of companyIds) {
      try {
        const company = await storage.getCompanyPage(companyId);
        
        if (!company) {
          errors.push(`Company ${companyId} not found`);
          continue;
        }

        if (company.userId !== userId) {
          errors.push(`Unauthorized access to company ${companyId}`);
          continue;
        }

        await storage.updateCompanyPage(companyId, {
          autoRepost: autoRepost !== undefined ? autoRepost : true,
          repostFrequency: repostFrequency || company.repostFrequency
        });

        updated++;
      } catch (error) {
        errors.push(`Failed to update company ${companyId}: ${error}`);
      }
    }

    res.json({
      message: `Updated ${updated} companies`,
      updated,
      errors
    });
  } catch (error) {
    console.error('[API] Error in bulk enable:', error);
    res.status(500).json({ message: 'Failed to bulk enable auto-repost' });
  }
});

/**
 * GET /api/companies/stats
 * Get statistics about user's companies
 */
router.get('/stats', async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId;
    
    if (!userId) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const companies = await storage.getCompanyPages(userId);
    
    const stats = {
      total: companies.length,
      active: companies.filter(c => c.active).length,
      autoRepostEnabled: companies.filter(c => c.autoRepost).length,
      showcase: companies.filter(c => isShowcasePage(c.linkedinPageUrl)).length,
      regular: companies.filter(c => !isShowcasePage(c.linkedinPageUrl)).length,
      byFrequency: {
        daily: companies.filter(c => c.repostFrequency === 'daily').length,
        weekly: companies.filter(c => c.repostFrequency === 'weekly').length,
        realtime: companies.filter(c => c.repostFrequency === 'realtime').length,
        all_time: companies.filter(c => c.repostFrequency === 'all_time').length
      }
    };

    res.json(stats);
  } catch (error) {
    console.error('[API] Error fetching company stats:', error);
    res.status(500).json({ message: 'Failed to fetch company statistics' });
  }
});

export default router;
