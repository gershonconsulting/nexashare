// NexaShare Chrome Extension - Background Service Worker
// Handles cookie extraction and communication with NexaShare backend

console.log('[NexaShare] Background service worker started');

// Configuration
const CONFIG = {
  nexashareUrl: 'http://localhost:5000', // Change to https://nexashare.com in production
  linkedinDomain: '.linkedin.com',
  requiredCookies: ['li_at', 'JSESSIONID']
};

/**
 * Extract LinkedIn cookies
 */
async function extractLinkedInCookies() {
  try {
    console.log('[NexaShare] Extracting LinkedIn cookies...');
    
    const cookies = await chrome.cookies.getAll({
      domain: CONFIG.linkedinDomain
    });
    
    if (cookies.length === 0) {
      throw new Error('No LinkedIn cookies found. Please log in to LinkedIn first.');
    }
    
    // Extract important cookies
    const cookieMap = {};
    cookies.forEach(cookie => {
      cookieMap[cookie.name] = cookie.value;
    });
    
    // Check for required cookies
    const missingCookies = CONFIG.requiredCookies.filter(name => !cookieMap[name]);
    if (missingCookies.length > 0) {
      throw new Error(`Missing required cookies: ${missingCookies.join(', ')}. Please log in to LinkedIn.`);
    }
    
    console.log('[NexaShare] Cookies extracted successfully');
    console.log('[NexaShare] Found cookies:', Object.keys(cookieMap));
    
    return {
      li_at: cookieMap.li_at,
      JSESSIONID: cookieMap.JSESSIONID || '',
      liap: cookieMap.liap || '',
      bcookie: cookieMap.bcookie || '',
      bscookie: cookieMap.bscookie || '',
      lang: cookieMap.lang || 'v=2&lang=en-us',
      lidc: cookieMap.lidc || '',
      extractedAt: new Date().toISOString()
    };
  } catch (error) {
    console.error('[NexaShare] Error extracting cookies:', error);
    throw error;
  }
}

/**
 * Validate cookies by testing a LinkedIn API call
 */
async function validateCookies(cookies) {
  try {
    console.log('[NexaShare] Validating cookies...');
    
    // Build cookie string
    const cookieString = Object.entries(cookies)
      .filter(([key, value]) => key !== 'extractedAt' && value)
      .map(([key, value]) => `${key}=${value}`)
      .join('; ');
    
    // Test by accessing LinkedIn's API
    const response = await fetch('https://www.linkedin.com/voyager/api/me', {
      headers: {
        'Cookie': cookieString,
        'Csrf-Token': cookies.JSESSIONID || 'ajax:' + Math.random()
      }
    });
    
    if (response.ok) {
      console.log('[NexaShare] Cookies are valid ✅');
      return true;
    } else {
      console.warn('[NexaShare] Cookies may be invalid:', response.status);
      return false;
    }
  } catch (error) {
    console.error('[NexaShare] Error validating cookies:', error);
    return false;
  }
}

/**
 * Send cookies to NexaShare backend
 */
async function sendCookiesToNexaShare(cookies) {
  try {
    console.log('[NexaShare] Sending cookies to backend...');
    
    const response = await fetch(`${CONFIG.nexashareUrl}/api/linkedin/cookies`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      credentials: 'include',
      body: JSON.stringify({
        cookies: cookies,
        source: 'chrome_extension',
        version: '1.0.0'
      })
    });
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.message || `Server error: ${response.status}`);
    }
    
    const data = await response.json();
    console.log('[NexaShare] Cookies sent successfully:', data);
    
    return data;
  } catch (error) {
    console.error('[NexaShare] Error sending cookies:', error);
    throw error;
  }
}

/**
 * Main function to extract and send cookies
 */
async function connectToNexaShare() {
  try {
    // Step 1: Extract cookies
    const cookies = await extractLinkedInCookies();
    
    // Step 2: Validate cookies
    const isValid = await validateCookies(cookies);
    if (!isValid) {
      console.warn('[NexaShare] Cookies may not be valid, but continuing...');
    }
    
    // Step 3: Send to NexaShare
    const result = await sendCookiesToNexaShare(cookies);
    
    // Step 4: Save connection status
    await chrome.storage.local.set({
      connected: true,
      lastSync: new Date().toISOString(),
      userInfo: result.userInfo || {}
    });
    
    return {
      success: true,
      message: 'Successfully connected to NexaShare!',
      data: result
    };
  } catch (error) {
    console.error('[NexaShare] Connection failed:', error);
    
    await chrome.storage.local.set({
      connected: false,
      lastError: error.message
    });
    
    return {
      success: false,
      message: error.message,
      error: error
    };
  }
}

/**
 * Disconnect from NexaShare
 */
async function disconnect() {
  try {
    console.log('[NexaShare] Disconnecting...');
    
    // Clear local storage
    await chrome.storage.local.clear();
    
    // Notify backend
    await fetch(`${CONFIG.nexashareUrl}/api/linkedin/cookies/disconnect`, {
      method: 'POST',
      credentials: 'include'
    }).catch(() => {}); // Ignore errors
    
    return {
      success: true,
      message: 'Disconnected successfully'
    };
  } catch (error) {
    console.error('[NexaShare] Error disconnecting:', error);
    return {
      success: false,
      message: error.message
    };
  }
}

/**
 * Check connection status
 */
async function checkStatus() {
  const data = await chrome.storage.local.get(['connected', 'lastSync', 'userInfo', 'lastError']);
  return {
    connected: data.connected || false,
    lastSync: data.lastSync || null,
    userInfo: data.userInfo || {},
    lastError: data.lastError || null
  };
}

// Listen for messages from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('[NexaShare] Received message:', request.action);
  
  if (request.action === 'connect') {
    connectToNexaShare().then(sendResponse);
    return true; // Indicates we'll respond asynchronously
  }
  
  if (request.action === 'disconnect') {
    disconnect().then(sendResponse);
    return true;
  }
  
  if (request.action === 'checkStatus') {
    checkStatus().then(sendResponse);
    return true;
  }
  
  if (request.action === 'extractCookies') {
    extractLinkedInCookies().then(cookies => {
      sendResponse({ success: true, cookies });
    }).catch(error => {
      sendResponse({ success: false, error: error.message });
    });
    return true;
  }
});

// Check if user navigates to LinkedIn
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url?.includes('linkedin.com')) {
    console.log('[NexaShare] User is on LinkedIn');
    // Could auto-detect and notify user
  }
});

console.log('[NexaShare] Background service worker ready');
