# NexaShare Chrome Extension - Historical Guide

> Do not use the cookie-extraction or Chrome Web Store instructions below.
> The current extension is private, locally installed, and does not transmit
> LinkedIn cookies. Follow `public/LOCAL_EXTENSION_TESTING.md`.

## 🎯 Why We Need This

### **The Problem with LinkedIn's Official API:**
- ❌ **Limited scraping** - Can't reliably get company posts
- ❌ **Strict rate limits** - Too restrictive for auto-repost
- ❌ **Posting restrictions** - Limited to their API endpoints
- ❌ **Requires approval** - Need LinkedIn to approve each feature
- ❌ **Missing features** - Many things you can do in browser, but not via API

### **The PhantomBuster Solution:**
- ✅ **Full access** - Everything you can do in browser
- ✅ **No API limits** - Uses normal user session
- ✅ **No approval needed** - Works with your existing LinkedIn account
- ✅ **More reliable** - Browser-based = more stable
- ✅ **Better scraping** - Get all post data

### **How It Works:**
```
1. User logs into LinkedIn (normal browser)
2. Chrome extension captures session cookies
3. NexaShare uses cookies to act as the user
4. Can scrape, post, interact - everything!
```

---

## 📁 Extension Files

```
nexashare-chrome-extension/
├── manifest.json              # Extension configuration
├── popup.html                 # Extension popup UI
├── js/
│   ├── background.js         # Cookie capture logic
│   ├── popup.js              # Popup functionality
│   └── content.js            # LinkedIn page interaction
└── icons/
    ├── icon16.png            # Small icon
    ├── icon48.png            # Medium icon
    └── icon128.png           # Large icon
```

---

## 🔧 How It Works

### **Step 1: User Installs Extension**
```
1. User goes to Chrome Web Store
2. Clicks "Add to Chrome"
3. Extension installed ✅
```

### **Step 2: User Logs into LinkedIn**
```
1. User visits linkedin.com
2. Logs in normally
3. Content script detects login ✅
```

### **Step 3: User Connects to NexaShare**
```
1. User clicks extension icon
2. Clicks "Connect to NexaShare"
3. Extension extracts cookies:
   - li_at (main session cookie)
   - JSESSIONID (session ID)
   - liap (auth token)
   - Other cookies
4. Validates cookies work
5. Sends to NexaShare backend (encrypted!)
6. Backend stores encrypted cookies
7. Done! ✅
```

### **Step 4: NexaShare Uses Cookies**
```
When scraping:
→ Use cookies to access LinkedIn as user
→ Get all company posts
→ No API limits!

When posting:
→ Use cookies to post as user
→ Same as if user posted manually
→ Full LinkedIn features!
```

---

## 🔐 Security

### **Critical Security Measures:**

#### **1. Cookie Encryption**
```typescript
// Cookies are NEVER stored in plain text
const encryptedCookies = encryptCookies(cookies);

// Uses AES-256-GCM encryption
// 32-character encryption key
// Random IV for each encryption
// Authentication tag for integrity
```

#### **2. Secure Transmission**
```
✅ HTTPS only
✅ No cookies in URLs
✅ No cookies in logs
✅ Credentials included for session
```

#### **3. Database Storage**
```sql
-- Cookies stored encrypted
linkedinCookies: text (encrypted)
linkedinCookiesUpdatedAt: timestamp

-- Can decrypt only with secret key
-- Key stored in environment variables
```

#### **4. User Consent**
```
✅ Clear explanation of what we're doing
✅ User must explicitly click "Connect"
✅ Can disconnect anytime
✅ Can see connection status
```

---

## 📊 Comparison: OAuth vs Cookies

| Feature | OAuth API | Session Cookies |
|---------|-----------|-----------------|
| **Scraping company posts** | ❌ Limited/Broken | ✅ Full access |
| **Posting content** | ⚠️ Restricted | ✅ Like browser |
| **Rate limits** | ❌ Very strict | ✅ Normal user limits |
| **LinkedIn approval** | ❌ Required | ✅ Not needed |
| **Features available** | ❌ Limited subset | ✅ Everything |
| **Reliability** | ⚠️ API changes break | ✅ More stable |
| **Setup complexity** | ❌ Complex OAuth flow | ✅ Simple click |

**Winner:** Session Cookies (PhantomBuster method) 🏆

---

## 🚀 Installation & Usage

### **For Users:**

#### **Step 1: Install Extension**
```
1. Go to Chrome Web Store
2. Search "NexaShare LinkedIn Connector"
3. Click "Add to Chrome"
4. Extension installed!
```

#### **Step 2: Log into LinkedIn**
```
1. Visit linkedin.com
2. Log in with your account
3. Make sure you're logged in
```

#### **Step 3: Connect to NexaShare**
```
1. Click extension icon (top right)
2. Click "Connect to NexaShare"
3. Extension captures cookies
4. Sends to NexaShare
5. Done! ✅
```

#### **Step 4: Verify Connection**
```
1. Go to NexaShare dashboard
2. See "Connected via Chrome Extension" ✅
3. Start using auto-repost features!
```

### **For Developers:**

#### **Local Testing:**

```bash
# 1. Load extension in Chrome
1. Open Chrome
2. Go to chrome://extensions/
3. Enable "Developer mode"
4. Click "Load unpacked"
5. Select nexashare-chrome-extension folder

# 2. Test it
1. Go to linkedin.com
2. Log in
3. Click extension icon
4. Click "Connect to NexaShare"
5. Check console for logs

# 3. Debug
1. Right-click extension icon
2. Click "Inspect popup" for popup debugging
3. Check Chrome DevTools console
4. Check background service worker logs
```

---

## 🔑 Key Cookies Explained

### **li_at** (Most Important)
```
Purpose: Main authentication cookie
Format: Long alphanumeric string
Example: AQEDARxxxxx...xxxxx
Usage: Required for ALL LinkedIn API calls
Expiry: ~60 days (depends on LinkedIn)
```

### **JSESSIONID**
```
Purpose: Session identifier
Format: ajax:1234567890
Usage: CSRF protection, session tracking
Expiry: Session-based
```

### **liap**
```
Purpose: Authentication token
Format: Numeric string
Usage: Additional auth verification
Expiry: Varies
```

### **Other Cookies**
```
bcookie: Browser cookie (tracking)
bscookie: Browser secure cookie
lidc: LinkedIn data center routing
lang: User language preference
```

---

## 🛠️ Backend Integration

### **API Endpoints:**

#### **POST /api/linkedin/cookies**
Receive cookies from extension

**Request:**
```json
{
  "cookies": {
    "li_at": "AQEDARxxxxx...",
    "JSESSIONID": "ajax:1234567890",
    "liap": "true",
    "bcookie": "...",
    "extractedAt": "2026-01-27T..."
  },
  "source": "chrome_extension",
  "version": "1.0.0"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Cookies saved successfully",
  "userInfo": {
    "email": "user@example.com",
    "fullName": "John Doe",
    "connectedAt": "2026-01-27T..."
  }
}
```

#### **POST /api/linkedin/cookies/disconnect**
Remove stored cookies

**Response:**
```json
{
  "success": true,
  "message": "Disconnected successfully"
}
```

#### **GET /api/linkedin/cookies/status**
Check cookie status

**Response:**
```json
{
  "connected": true,
  "lastUpdated": "2026-01-27T...",
  "method": "cookies"
}
```

---

## 📝 Using Cookies in Backend

### **Scraping with Cookies:**

```typescript
import { getUserLinkedInCookies, buildCookieString } from './linkedinCookieRoutes';

// Get user's cookies
const cookies = await getUserLinkedInCookies(userId);

if (!cookies) {
  throw new Error('No LinkedIn cookies found');
}

// Build cookie string
const cookieString = buildCookieString(cookies);

// Make request to LinkedIn
const response = await fetch('https://www.linkedin.com/voyager/api/...', {
  headers: {
    'Cookie': cookieString,
    'Csrf-Token': cookies.JSESSIONID || 'ajax:' + Math.random(),
    'User-Agent': 'Mozilla/5.0 ...',
    'X-Li-Lang': 'en_US'
  }
});

// Parse response
const data = await response.json();
```

### **Posting with Cookies:**

```typescript
// Post to LinkedIn using cookies
const response = await fetch('https://www.linkedin.com/voyager/api/contentcreation/normShares', {
  method: 'POST',
  headers: {
    'Cookie': cookieString,
    'Csrf-Token': cookies.JSESSIONID,
    'Content-Type': 'application/json',
    'X-Li-Lang': 'en_US'
  },
  body: JSON.stringify({
    distribution: {
      linkedInDistributionTarget: {}
    },
    text: {
      text: 'Your post content here'
    },
    content: {
      contentEntities: [],
      title: ''
    }
  })
});
```

---

## 🧪 Testing

### **Test 1: Cookie Extraction**
```javascript
// In extension console
chrome.runtime.sendMessage({ action: 'extractCookies' }, (response) => {
  console.log('Cookies:', response);
});

// Expected: { success: true, cookies: {...} }
```

### **Test 2: Cookie Validation**
```javascript
// Check if cookies work
const cookies = await extractLinkedInCookies();
const isValid = await validateCookies(cookies);

console.log('Valid:', isValid); // Should be true
```

### **Test 3: Backend Storage**
```bash
# Check if cookies stored
curl http://localhost:5000/api/linkedin/cookies/status \
  -H "Cookie: session_cookie"

# Expected: { "connected": true, ... }
```

---

## 🐛 Troubleshooting

### **Issue: No cookies found**
**Cause:** User not logged into LinkedIn
**Solution:**
```
1. Go to linkedin.com
2. Log in
3. Try again
```

### **Issue: Cookies invalid**
**Cause:** Cookies expired or LinkedIn logged out
**Solution:**
```
1. Log out of LinkedIn
2. Log back in
3. Click "Refresh Connection" in extension
```

### **Issue: Extension not working**
**Cause:** Extension not loaded or errors
**Solution:**
```
1. Go to chrome://extensions/
2. Find NexaShare extension
3. Click "Refresh" icon
4. Check for errors
```

### **Issue: Cannot connect to NexaShare**
**Cause:** Backend not running or wrong URL
**Solution:**
```
1. Make sure NexaShare is running
2. Check extension manifest.json
3. Verify host_permissions includes correct URL
```

---

## 🚀 Deployment

### **Chrome Web Store Submission:**

#### **1. Prepare Extension**
```bash
# Create production version
cd nexashare-chrome-extension

# Update manifest.json
# - Change version
# - Update description
# - Add production URL to host_permissions

# Create icons (required sizes)
# - 16x16
# - 48x48
# - 128x128

# Create screenshots for store listing

# Zip extension
zip -r nexashare-extension.zip * -x "*.git*" "*.DS_Store"
```

#### **2. Submit to Store**
```
1. Go to Chrome Web Store Developer Dashboard
2. Pay $5 one-time developer fee
3. Click "New Item"
4. Upload nexashare-extension.zip
5. Fill in details:
   - Name: NexaShare LinkedIn Connector
   - Description: Connect LinkedIn to NexaShare
   - Category: Productivity
   - Screenshots: Upload at least 1
6. Submit for review
7. Wait 1-3 days for approval
```

#### **3. Update Backend**
```typescript
// In manifest.json, add production URL
"host_permissions": [
  "https://*.linkedin.com/*",
  "https://nexashare.com/*"  // Production
]

// In background.js, update CONFIG
const CONFIG = {
  nexashareUrl: 'https://nexashare.com', // Production
  linkedinDomain: '.linkedin.com',
  requiredCookies: ['li_at', 'JSESSIONID']
};
```

---

## 📊 Analytics

Track extension usage:

```typescript
// In background.js
async function trackEvent(event: string, data?: any) {
  try {
    await fetch(`${CONFIG.nexashareUrl}/api/analytics/extension`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        event,
        data,
        timestamp: new Date().toISOString()
      })
    });
  } catch (error) {
    // Silently fail - don't block user
  }
}

// Track events
trackEvent('extension_installed');
trackEvent('cookies_extracted');
trackEvent('connected_to_nexashare');
```

---

## ✅ Checklist

### **Extension Development:**
- [x] manifest.json configured
- [x] Background service worker
- [x] Popup UI
- [x] Content script
- [x] Cookie extraction
- [x] Cookie validation
- [x] Backend communication

### **Backend Integration:**
- [x] Cookie storage endpoint
- [x] Cookie encryption
- [x] Cookie decryption
- [x] Status endpoint
- [x] Disconnect endpoint
- [x] Database schema updated

### **Testing:**
- [ ] Test cookie extraction
- [ ] Test backend storage
- [ ] Test scraping with cookies
- [ ] Test posting with cookies
- [ ] Test on different LinkedIn accounts

### **Deployment:**
- [ ] Create icons
- [ ] Create screenshots
- [ ] Write store description
- [ ] Submit to Chrome Web Store
- [ ] Update production URLs
- [ ] Deploy backend changes

---

## 🎉 Summary

**What You Have:**
- ✅ Complete Chrome extension
- ✅ Cookie extraction and validation
- ✅ Secure backend storage (encrypted)
- ✅ Helper functions for using cookies
- ✅ Complete documentation

**What It Does:**
- ✅ Captures LinkedIn session cookies
- ✅ Sends to NexaShare securely
- ✅ Stores encrypted in database
- ✅ Enables reliable scraping & posting
- ✅ No LinkedIn API limits!

**Just like PhantomBuster!** 🏆

Ready to test? Let me know if you need anything else!
