import { storage } from "./storage.js";

export interface LinkedInExperience {
  company: string;
  companyUrl?: string;
  title: string;
  startDate: string;
  endDate?: string;
  current: boolean;
}

export interface LinkedInEducation {
  school: string;
  schoolUrl?: string;
  degree?: string;
  fieldOfStudy?: string;
}

export interface CompanySuggestion {
  name: string;
  linkedinUrl: string;
  type: 'worked' | 'education' | 'followed';
  reason: string;
}

/**
 * Fetch user's work experience from LinkedIn profile
 * Uses LinkedIn Profile API
 */
export async function getUserWorkExperience(accessToken: string, linkedinId: string): Promise<LinkedInExperience[]> {
  try {
    console.log(`[CompanyDiscovery] Fetching work experience for ${linkedinId}`);
    
    // LinkedIn Profile API endpoint for positions
    const response = await fetch(`https://api.linkedin.com/v2/positions?q=owner&projection=(elements*(company~(localizedName,vanityName),title,timePeriod))`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'X-Restli-Protocol-Version': '2.0.0'
      }
    });

    if (!response.ok) {
      console.error(`[CompanyDiscovery] Failed to fetch positions: ${response.status}`);
      return [];
    }

    const data = await response.json();
    const experiences: LinkedInExperience[] = [];

    if (data.elements) {
      for (const element of data.elements) {
        const company = element['company~'];
        if (company) {
          experiences.push({
            company: company.localizedName,
            companyUrl: company.vanityName ? `https://www.linkedin.com/company/${company.vanityName}` : undefined,
            title: element.title?.localized?.en_US || 'Position',
            startDate: formatLinkedInDate(element.timePeriod?.startDate),
            endDate: element.timePeriod?.endDate ? formatLinkedInDate(element.timePeriod.endDate) : undefined,
            current: !element.timePeriod?.endDate
          });
        }
      }
    }

    console.log(`[CompanyDiscovery] Found ${experiences.length} work experiences`);
    return experiences;
  } catch (error) {
    console.error('[CompanyDiscovery] Error fetching work experience:', error);
    return [];
  }
}

/**
 * Get company suggestions for a user based on their profile
 */
export async function getCompanySuggestions(userId: number): Promise<CompanySuggestion[]> {
  try {
    const user = await storage.getUser(userId);
    if (!user?.linkedinAccessToken || !user?.linkedinId) {
      console.log('[CompanyDiscovery] User has no LinkedIn access token');
      return [];
    }

    const suggestions: CompanySuggestion[] = [];

    // Get work experience
    const experiences = await getUserWorkExperience(user.linkedinAccessToken, user.linkedinId);
    
    for (const exp of experiences) {
      if (exp.companyUrl) {
        suggestions.push({
          name: exp.company,
          linkedinUrl: exp.companyUrl,
          type: 'worked',
          reason: exp.current ? `Currently working as ${exp.title}` : `Previously worked as ${exp.title}`
        });
      }
    }

    // Check for showcase pages (common pattern: /showcase/company-name)
    // We can suggest checking these for each company
    const uniqueCompanies = suggestions.filter((s, index, self) => 
      index === self.findIndex(t => t.linkedinUrl === s.linkedinUrl)
    );

    console.log(`[CompanyDiscovery] Found ${uniqueCompanies.length} company suggestions`);
    return uniqueCompanies;
  } catch (error) {
    console.error('[CompanyDiscovery] Error getting company suggestions:', error);
    return [];
  }
}

/**
 * Auto-add companies from user's work history
 */
export async function autoAddUserCompanies(userId: number): Promise<{ added: number; skipped: number; errors: string[] }> {
  try {
    console.log(`[CompanyDiscovery] Auto-adding companies for user ${userId}`);
    
    const suggestions = await getCompanySuggestions(userId);
    let added = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (const suggestion of suggestions) {
      try {
        // Check if company already exists
        const existing = await storage.getCompanyPageByUrl(suggestion.linkedinUrl, userId);
        
        if (existing) {
          console.log(`[CompanyDiscovery] Company already exists: ${suggestion.name}`);
          skipped++;
          continue;
        }

        // Add the company
        await storage.createCompanyPage({
          userId,
          linkedinPageUrl: suggestion.linkedinUrl,
          pageName: suggestion.name,
          active: true,
          autoRepost: false, // Don't enable auto-repost by default
          repostFrequency: 'daily'
        });

        console.log(`[CompanyDiscovery] Added company: ${suggestion.name}`);
        added++;
      } catch (error) {
        const errorMsg = `Failed to add ${suggestion.name}: ${error}`;
        console.error(`[CompanyDiscovery] ${errorMsg}`);
        errors.push(errorMsg);
      }
    }

    console.log(`[CompanyDiscovery] Auto-add complete: ${added} added, ${skipped} skipped, ${errors.length} errors`);
    return { added, skipped, errors };
  } catch (error) {
    console.error('[CompanyDiscovery] Error in auto-add:', error);
    return { added: 0, skipped: 0, errors: [String(error)] };
  }
}

/**
 * Detect if a URL is a showcase page
 */
export function isShowcasePage(url: string): boolean {
  return url.includes('/showcase/');
}

/**
 * Extract company/showcase slug from LinkedIn URL
 */
export function extractLinkedInSlug(url: string): { type: 'company' | 'showcase', slug: string } | null {
  const match = url.match(/linkedin\.com\/(company|showcase)\/([^\/\?]+)/);
  if (!match) return null;
  
  return {
    type: match[1] as 'company' | 'showcase',
    slug: match[2]
  };
}

/**
 * Format LinkedIn date object to readable string
 */
function formatLinkedInDate(dateObj: any): string {
  if (!dateObj) return '';
  const { year, month } = dateObj;
  return `${year}-${String(month).padStart(2, '0')}`;
}

/**
 * Validate LinkedIn company/showcase URL
 */
export function validateLinkedInUrl(url: string): { valid: boolean; type?: 'company' | 'showcase'; error?: string } {
  try {
    const urlObj = new URL(url);
    
    if (!urlObj.hostname.includes('linkedin.com')) {
      return { valid: false, error: 'URL must be from linkedin.com' };
    }

    const slug = extractLinkedInSlug(url);
    if (!slug) {
      return { valid: false, error: 'Invalid LinkedIn company or showcase URL format' };
    }

    return { valid: true, type: slug.type };
  } catch {
    return { valid: false, error: 'Invalid URL format' };
  }
}
