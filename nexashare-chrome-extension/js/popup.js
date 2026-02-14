// NexaShare Chrome Extension - Popup Script
console.log('[NexaShare Popup] Initializing...');

// DOM Elements
const loadingEl = document.getElementById('loading');
const errorMessageEl = document.getElementById('errorMessage');
const disconnectedState = document.getElementById('disconnectedState');
const connectedState = document.getElementById('connectedState');
const connectBtn = document.getElementById('connectBtn');
const disconnectBtn = document.getElementById('disconnectBtn');
const refreshBtn = document.getElementById('refreshBtn');
const openLinkedInBtn = document.getElementById('openLinkedInBtn');
const lastSyncEl = document.getElementById('lastSync');

/**
 * Show error message
 */
function showError(message) {
  errorMessageEl.textContent = message;
  errorMessageEl.classList.add('active');
  setTimeout(() => {
    errorMessageEl.classList.remove('active');
  }, 5000);
}

/**
 * Show loading state
 */
function showLoading(show = true) {
  if (show) {
    loadingEl.classList.add('active');
    disconnectedState.style.display = 'none';
    connectedState.style.display = 'none';
  } else {
    loadingEl.classList.remove('active');
  }
}

/**
 * Update UI based on connection status
 */
function updateUI(status) {
  showLoading(false);
  
  if (status.connected) {
    disconnectedState.style.display = 'none';
    connectedState.style.display = 'block';
    
    // Update last sync time
    if (status.lastSync) {
      const date = new Date(status.lastSync);
      lastSyncEl.textContent = formatDate(date);
    } else {
      lastSyncEl.textContent = 'Never';
    }
  } else {
    disconnectedState.style.display = 'block';
    connectedState.style.display = 'none';
    
    // Show error if present
    if (status.lastError) {
      showError(status.lastError);
    }
  }
}

/**
 * Format date for display
 */
function formatDate(date) {
  const now = new Date();
  const diff = now - date;
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes} minute${minutes > 1 ? 's' : ''} ago`;
  if (hours < 24) return `${hours} hour${hours > 1 ? 's' : ''} ago`;
  if (days < 7) return `${days} day${days > 1 ? 's' : ''} ago`;
  
  return date.toLocaleDateString();
}

/**
 * Check connection status
 */
async function checkStatus() {
  try {
    const response = await chrome.runtime.sendMessage({ action: 'checkStatus' });
    updateUI(response);
  } catch (error) {
    console.error('[NexaShare Popup] Error checking status:', error);
    updateUI({ connected: false, lastError: error.message });
  }
}

/**
 * Connect to NexaShare
 */
async function connect() {
  try {
    showLoading(true);
    connectBtn.disabled = true;
    
    // Check if user is on LinkedIn
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    const currentTab = tabs[0];
    
    if (!currentTab.url?.includes('linkedin.com')) {
      // Not on LinkedIn - show warning
      const userConfirm = confirm(
        'You are not currently on LinkedIn.\n\n' +
        'Please log in to LinkedIn first, then come back and click Connect.\n\n' +
        'Click OK to open LinkedIn now.'
      );
      
      if (userConfirm) {
        chrome.tabs.create({ url: 'https://www.linkedin.com/feed/' });
      }
      
      showLoading(false);
      connectBtn.disabled = false;
      return;
    }
    
    // Send connect message to background
    const response = await chrome.runtime.sendMessage({ action: 'connect' });
    
    if (response.success) {
      // Success!
      await checkStatus();
      
      // Show success message briefly
      const tempSuccess = document.createElement('div');
      tempSuccess.style.cssText = 'background:#d4edda;color:#155724;padding:10px;border-radius:6px;margin-bottom:15px;text-align:center;';
      tempSuccess.textContent = '✅ Successfully connected!';
      document.querySelector('.content').insertBefore(tempSuccess, document.querySelector('.content').firstChild);
      
      setTimeout(() => tempSuccess.remove(), 3000);
    } else {
      showError(response.message || 'Connection failed. Please try again.');
      showLoading(false);
      connectBtn.disabled = false;
    }
  } catch (error) {
    console.error('[NexaShare Popup] Error connecting:', error);
    showError(error.message || 'An error occurred. Please try again.');
    showLoading(false);
    connectBtn.disabled = false;
  }
}

/**
 * Disconnect from NexaShare
 */
async function disconnect() {
  try {
    const userConfirm = confirm(
      'Are you sure you want to disconnect?\n\n' +
      'This will stop auto-reposting until you reconnect.'
    );
    
    if (!userConfirm) return;
    
    showLoading(true);
    
    const response = await chrome.runtime.sendMessage({ action: 'disconnect' });
    
    if (response.success) {
      await checkStatus();
    } else {
      showError(response.message || 'Disconnect failed');
      showLoading(false);
    }
  } catch (error) {
    console.error('[NexaShare Popup] Error disconnecting:', error);
    showError('An error occurred while disconnecting');
    showLoading(false);
  }
}

/**
 * Refresh connection (re-extract cookies)
 */
async function refresh() {
  try {
    showLoading(true);
    refreshBtn.disabled = true;
    
    const response = await chrome.runtime.sendMessage({ action: 'connect' });
    
    if (response.success) {
      await checkStatus();
    } else {
      showError(response.message || 'Refresh failed');
      showLoading(false);
      refreshBtn.disabled = false;
    }
  } catch (error) {
    console.error('[NexaShare Popup] Error refreshing:', error);
    showError('An error occurred while refreshing');
    showLoading(false);
    refreshBtn.disabled = false;
  }
}

/**
 * Open LinkedIn in new tab
 */
function openLinkedIn() {
  chrome.tabs.create({ url: 'https://www.linkedin.com/feed/' });
}

// Event Listeners
connectBtn.addEventListener('click', connect);
disconnectBtn.addEventListener('click', disconnect);
refreshBtn.addEventListener('click', refresh);
openLinkedInBtn.addEventListener('click', openLinkedIn);

document.getElementById('helpLink').addEventListener('click', (e) => {
  e.preventDefault();
  chrome.tabs.create({ url: 'https://nexashare.com/help' });
});

// Check status on popup open
checkStatus();

// Refresh status every 30 seconds while popup is open
setInterval(checkStatus, 30000);

console.log('[NexaShare Popup] Ready');
