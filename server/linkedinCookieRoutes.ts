import { Router, Request, Response } from 'express';
import { storage } from './storage.js';
import crypto from 'crypto';

const router = Router();

// Encryption configuration
const ENCRYPTION_KEY = process.env.COOKIE_ENCRYPTION_KEY || process.env.SESSION_SECRET || 'change-this-in-production-32chars';
const ALGORITHM = 'aes-256-gcm';

/**
 * Encrypt sensitive cookie data
 */
function encryptCookies(cookies: any): string {
  try {
    // Generate a random IV
    const iv = crypto.randomBytes(16);
    
    // Create cipher
    const cipher = crypto.createCipheriv(ALGORITHM, Buffer.from(ENCRYPTION_KEY.slice(0, 32)), iv);
    
    // Encrypt
    const cookieString = JSON.stringify(cookies);
    let encrypted = cipher.update(cookieString, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    // Get auth tag
    const authTag = cipher.getAuthTag();
    
    // Combine IV + authTag + encrypted data
    return iv.toString('hex') + ':' + authTag.toString('hex') + ':' + encrypted;
  } catch (error) {
    console.error('[Encryption] Error encrypting cookies:', error);
    throw new Error('Failed to encrypt cookies');
  }
}

/**
 * Decrypt cookie data
 */
function decryptCookies(encryptedData: string): any {
  try {
    // Split the encrypted data
    const parts = encryptedData.split(':');
    if (parts.length !== 3) {
      throw new Error('Invalid encrypted data format');
    }
    
    const iv = Buffer.from(parts[0], 'hex');
    const authTag = Buffer.from(parts[1], 'hex');
    const encrypted = parts[2];
    
    // Create decipher
    const decipher = crypto.createDecipheriv(ALGORITHM, Buffer.from(ENCRYPTION_KEY.slice(0, 32)), iv);
    decipher.setAuthTag(authTag);
    
    // Decrypt
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return JSON.parse(decrypted);
  } catch (error) {
    console.error('[Decryption] Error decrypting cookies:', error);
    throw new Error('Failed to decrypt cookies');
  }
}

/**
 * POST /api/linkedin/cookies
 * Receive and store LinkedIn cookies from Chrome extension
 */
router.post('/cookies', async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId;
    
    if (!userId) {
      return res.status(401).json({ 
        message: 'Please log in to NexaShare first',
        action: 'login_required'
      });
    }

    const { cookies, source, version } = req.body;
    
    if (!cookies || !cookies.li_at) {
      return res.status(400).json({ 
        message: 'Invalid cookies. Please make sure you are logged into LinkedIn.',
        action: 'invalid_cookies'
      });
    }

    console.log(`[CookieAPI] Receiving cookies from ${source} v${version} for user ${userId}`);
    
    // Validate required cookies
    if (!cookies.li_at) {
      return res.status(400).json({ 
        message: 'Missing required LinkedIn cookie (li_at). Please log in to LinkedIn.',
        action: 'missing_required_cookie'
      });
    }

    // Encrypt cookies before storing
    const encryptedCookies = encryptCookies(cookies);
    
    // Store encrypted cookies in database
    await storage.updateUser(userId, {
      linkedinCookies: encryptedCookies,
      linkedinCookiesUpdatedAt: new Date()
    });

    console.log(`[CookieAPI] Cookies stored successfully for user ${userId}`);

    // Get user info to return
    const user = await storage.getUser(userId);
    
    res.json({
      success: true,
      message: 'LinkedIn cookies saved successfully',
      userInfo: {
        email: user?.email,
        fullName: user?.fullName,
        connectedAt: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('[CookieAPI] Error storing cookies:', error);
    res.status(500).json({ 
      message: 'Failed to store cookies. Please try again.',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * POST /api/linkedin/cookies/disconnect
 * Remove stored LinkedIn cookies
 */
router.post('/cookies/disconnect', async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId;
    
    if (!userId) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    console.log(`[CookieAPI] Disconnecting cookies for user ${userId}`);
    
    // Clear cookies from database
    await storage.updateUser(userId, {
      linkedinCookies: null,
      linkedinCookiesUpdatedAt: null
    });

    res.json({
      success: true,
      message: 'Disconnected successfully'
    });
  } catch (error) {
    console.error('[CookieAPI] Error disconnecting:', error);
    res.status(500).json({ message: 'Failed to disconnect' });
  }
});

/**
 * GET /api/linkedin/cookies/status
 * Check if user has cookies stored
 */
router.get('/cookies/status', async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId;
    
    if (!userId) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const user = await storage.getUser(userId);
    
    const hasCookies = !!user?.linkedinCookies;
    const updatedAt = user?.linkedinCookiesUpdatedAt;

    res.json({
      connected: hasCookies,
      lastUpdated: updatedAt,
      method: hasCookies ? 'cookies' : (user?.linkedinAccessToken ? 'oauth' : 'none')
    });
  } catch (error) {
    console.error('[CookieAPI] Error checking status:', error);
    res.status(500).json({ message: 'Failed to check status' });
  }
});

/**
 * Helper function to get decrypted cookies for a user
 * Used internally by other services
 */
export async function getUserLinkedInCookies(userId: number): Promise<any | null> {
  try {
    const user = await storage.getUser(userId);
    
    if (!user?.linkedinCookies) {
      return null;
    }

    // Decrypt and return cookies
    return decryptCookies(user.linkedinCookies);
  } catch (error) {
    console.error('[CookieAPI] Error getting user cookies:', error);
    return null;
  }
}

/**
 * Helper function to build cookie string for requests
 */
export function buildCookieString(cookies: any): string {
  return Object.entries(cookies)
    .filter(([key, value]) => key !== 'extractedAt' && value)
    .map(([key, value]) => `${key}=${value}`)
    .join('; ');
}

export { encryptCookies, decryptCookies };
export default router;
