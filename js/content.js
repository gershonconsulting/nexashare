// NexaShare Chrome Extension - Content Script
// Runs on LinkedIn pages to detect login status and provide helper functions

console.log('[NexaShare] Content script loaded on LinkedIn');

/**
 * Check if user is logged into LinkedIn
 */
function isLoggedIn() {
  // Check for various indicators that user is logged in
  const indicators = [
    document.querySelector('.global-nav'),
    document.querySelector('[data-control-name="nav.settings"]'),
    document.querySelector('.feed-identity-module'),
    document.querySelector('.global-nav__me'),
    document.body.classList.contains('logged-in')
  ];
  
  const loggedIn = indicators.some(indicator => indicator !== null);
  console.log('[NexaShare] Login status:', loggedIn);
  
  return loggedIn;
}

/**
 * Get current user's profile info from page
 */
function getUserInfo() {
  try {
    // Try to get user info from various sources on the page
    const meButton = document.querySelector('.global-nav__me');
    const identityModule = document.querySelector('.feed-identity-module');
    
    let name = '';
    let headline = '';
    let profileUrl = '';
    
    if (meButton) {
      name = meButton.querySelector('.global-nav__me-photo')?.alt || '';
    }
    
    if (identityModule) {
      name = name || identityModule.querySelector('.feed-identity-module__actor-name')?.textContent?.trim() || '';
      headline = identityModule.querySelector('.feed-identity-module__description')?.textContent?.trim() || '';
    }
    
    // Get profile URL
    const profileLink = document.querySelector('a[href*="/in/"]');
    if (profileLink) {
      profileUrl = profileLink.href;
    }
    
    return {
      name,
      headline,
      profileUrl,
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    console.error('[NexaShare] Error getting user info:', error);
    return null;
  }
}

/**
 * Monitor for login/logout events
 */
let lastLoginStatus = isLoggedIn();

function checkLoginStatus() {
  const currentLoginStatus = isLoggedIn();
  
  if (currentLoginStatus !== lastLoginStatus) {
    console.log('[NexaShare] Login status changed:', currentLoginStatus);
    lastLoginStatus = currentLoginStatus;
    
    // Notify background script
    chrome.runtime.sendMessage({
      action: 'loginStatusChanged',
      loggedIn: currentLoginStatus,
      userInfo: currentLoginStatus ? getUserInfo() : null
    });
  }
}

// Check login status periodically
setInterval(checkLoginStatus, 5000);

// Listen for messages from popup or background
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('[NexaShare] Content script received message:', request.action);
  
  if (request.action === 'checkLogin') {
    const loggedIn = isLoggedIn();
    const userInfo = loggedIn ? getUserInfo() : null;
    sendResponse({ loggedIn, userInfo });
  }
  
  if (request.action === 'getUserInfo') {
    sendResponse(getUserInfo());
  }
});

// Notify background that we're ready
chrome.runtime.sendMessage({
  action: 'contentScriptReady',
  url: window.location.href,
  loggedIn: isLoggedIn()
});

console.log('[NexaShare] Content script ready');
