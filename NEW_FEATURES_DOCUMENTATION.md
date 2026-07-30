# NexaShare - Enhanced Features Documentation

> Historical proposal only. The current secure MVP is manual, browser-based,
> and does not request LinkedIn posting permission or call a posting API. See
> `DEPLOYMENT.md` for the release architecture.

## 🎯 New Features Added

### 1. **Auto-Discover Companies from LinkedIn Profile**

**What it does:**
- Automatically finds companies you've worked for by analyzing your LinkedIn profile
- Uses LinkedIn Profile API to fetch your work experience
- Suggests companies you can track and repost from

**How to use:**
1. Log in with LinkedIn (required for profile access)
2. Go to Dashboard
3. Click "Discover Companies" section
4. Click "Find My Companies"
5. See list of companies from your work history
6. Click "Add All to Dashboard" to import them

**API Endpoint:**
```typescript
GET /api/companies/suggestions
Response: {
  suggestions: Array<{
    name: string,
    linkedinUrl: string,
    type: 'worked' | 'education' | 'followed',
    reason: string
  }>,
  count: number
}
```

**Example Response:**
```json
{
  "suggestions": [
    {
      "name": "SelectUSA",
      "linkedinUrl": "https://www.linkedin.com/company/selectusa/",
      "type": "worked",
      "reason": "Currently working as Digital Marketing Specialist"
    }
  ],
  "count": 1
}
```

---

### 2. **Showcase Page Support**

**What it does:**
- Full support for LinkedIn showcase pages (like `/showcase/selectusa/`)
- Automatically detects if URL is a showcase or regular company page
- Scrapes posts from showcase feeds correctly

**Supported URL Formats:**
```
✅ https://www.linkedin.com/company/selectusa/
✅ https://www.linkedin.com/showcase/selectusa/
✅ https://www.linkedin.com/showcase/selectusa/posts/
✅ https://www.linkedin.com/company/microsoft/posts/?feedView=all
```

**How it works:**
- Detects showcase vs company from URL pattern
- Uses correct LinkedIn API endpoint for each type
- Handles both in the same way - no special configuration needed

**Example (SelectUSA):**
```typescript
// User adds this URL
const url = "https://www.linkedin.com/showcase/selectusa/posts/?feedView=all";

// App automatically:
// 1. Detects it's a showcase page
// 2. Extracts slug: "selectusa"
// 3. Monitors: https://www.linkedin.com/showcase/selectusa/posts/
// 4. Checks daily for new content
// 5. Reposts to user's feed
```

---

### 3. **Bulk Auto-Add Companies**

**What it does:**
- Add ALL your companies at once with one click
- No need to manually enter each company URL
- Automatically imports from your LinkedIn work history

**How to use:**
1. Click "Find My Companies"
2. Review the list of suggested companies
3. Click "Add All to Dashboard"
4. All companies are added in one go

**API Endpoint:**
```typescript
POST /api/companies/auto-add
Response: {
  message: string,
  added: number,
  skipped: number,
  errors: string[]
}
```

**Example:**
```json
{
  "message": "Successfully added 5 companies",
  "added": 5,
  "skipped": 2,
  "errors": []
}
```

---

### 4. **Bulk Enable Auto-Repost**

**What it does:**
- Enable auto-repost for multiple companies at once
- Set repost frequency for multiple companies
- Save time compared to enabling one-by-one

**How to use:**
1. Select multiple companies in dashboard
2. Click "Bulk Actions" → "Enable Auto-Repost"
3. Choose frequency (daily/weekly/realtime)
4. All selected companies updated at once

**API Endpoint:**
```typescript
POST /api/companies/bulk-enable
Body: {
  companyIds: number[],
  autoRepost: boolean,
  repostFrequency: 'daily' | 'weekly' | 'realtime'
}
Response: {
  message: string,
  updated: number,
  errors: string[]
}
```

---

### 5. **Company Statistics Dashboard**

**What it does:**
- Shows overview of all your companies
- Track how many have auto-repost enabled
- See breakdown of showcase vs regular pages

**Metrics shown:**
- Total companies tracked
- Active companies
- Auto-repost enabled count
- Showcase pages count
- Regular company pages count
- Breakdown by repost frequency

**API Endpoint:**
```typescript
GET /api/companies/stats
Response: {
  total: number,
  active: number,
  autoRepostEnabled: number,
  showcase: number,
  regular: number,
  byFrequency: {
    daily: number,
    weekly: number,
    realtime: number,
    all_time: number
  }
}
```

---

### 6. **URL Validation**

**What it does:**
- Validates LinkedIn URLs before adding
- Detects if it's a company or showcase page
- Prevents invalid URLs from being added

**API Endpoint:**
```typescript
POST /api/companies/validate
Body: { url: string }
Response: {
  valid: boolean,
  type?: 'company' | 'showcase',
  isShowcase: boolean,
  message?: string,
  error?: string
}
```

**Examples:**
```typescript
// Valid company page
{ url: "https://www.linkedin.com/company/microsoft/" }
→ { valid: true, type: "company", isShowcase: false }

// Valid showcase page
{ url: "https://www.linkedin.com/showcase/selectusa/" }
→ { valid: true, type: "showcase", isShowcase: true }

// Invalid URL
{ url: "https://google.com" }
→ { valid: false, error: "URL must be from linkedin.com" }
```

---

## 🎨 UI Components Added

### **CompanyDiscovery Component**

**Location:** `client/src/components/CompanyDiscovery.tsx`

**Features:**
- Auto-discover companies button
- List of suggested companies
- One-click add all
- Statistics overview
- SelectUSA example/tutorial

**Usage in Dashboard:**
```tsx
import { CompanyDiscovery } from '@/components/CompanyDiscovery';

function Dashboard() {
  return (
    <div>
      {/* Existing dashboard content */}
      <CompanyDiscovery />
    </div>
  );
}
```

---

## 📊 Database Changes

### **Company Pages Table**

**Existing fields still work:**
- `linkedinPageUrl` - Now handles both company and showcase URLs
- `pageName` - Company or showcase name
- `autoRepost` - Enable/disable auto-repost
- `repostFrequency` - How often to check/repost

**New detection:**
- App now automatically detects showcase vs company from URL
- No schema changes needed - fully backward compatible

---

## 🔧 Backend Services Added

### **1. Company Discovery Service**

**File:** `server/companyDiscovery.ts`

**Functions:**
```typescript
// Get user's work experience from LinkedIn
getUserWorkExperience(accessToken, linkedinId): Promise<LinkedInExperience[]>

// Get company suggestions for user
getCompanySuggestions(userId): Promise<CompanySuggestion[]>

// Auto-add all suggested companies
autoAddUserCompanies(userId): Promise<{added, skipped, errors}>

// Validate LinkedIn URL
validateLinkedInUrl(url): {valid, type, error}

// Check if URL is showcase page
isShowcasePage(url): boolean
```

### **2. Company Routes**

**File:** `server/companyRoutes.ts`

**Endpoints:**
- `GET /api/companies/suggestions` - Get company suggestions
- `POST /api/companies/auto-add` - Auto-add companies
- `POST /api/companies/validate` - Validate URL
- `POST /api/companies/bulk-enable` - Bulk enable auto-repost
- `GET /api/companies/stats` - Get statistics

---

## 🚀 Complete Workflow Example

### **Scenario: User wants to repost SelectUSA content**

**Step 1: Log in**
```
User logs in with LinkedIn → Gets access token
```

**Step 2: Discover companies**
```
User clicks "Find My Companies"
→ API fetches work history from LinkedIn
→ Finds SelectUSA (if user worked there)
→ Shows in suggestions list
```

**Step 3: Add companies**
```
User clicks "Add All to Dashboard"
→ SelectUSA added to company_pages table
→ URL: https://www.linkedin.com/showcase/selectusa/
→ autoRepost: false (by default)
```

**Step 4: Enable auto-repost**
```
User toggles auto-repost ON
→ Sets frequency to "daily"
→ App will check every 24 hours
```

**Step 5: Automatic reposting**
```
Every day at check time:
→ App scrapes https://www.linkedin.com/showcase/selectusa/posts/
→ Finds new posts
→ Automatically shares to user's LinkedIn feed
→ Saves to repost history
```

---

## 🎯 SelectUSA Specific Implementation

### **Adding SelectUSA**

**Option 1: Manual Add**
```typescript
// User enters URL in dashboard
const url = "https://www.linkedin.com/showcase/selectusa/";

// App validates
validateLinkedInUrl(url)
→ { valid: true, type: "showcase", isShowcase: true }

// App adds to database
await storage.createCompanyPage({
  userId: currentUserId,
  linkedinPageUrl: url,
  pageName: "SelectUSA",
  active: true,
  autoRepost: true,
  repostFrequency: 'daily'
});
```

**Option 2: Auto-discover** (if user worked at SelectUSA)
```typescript
// App fetches user's work history
const suggestions = await getCompanySuggestions(userId);

// Finds SelectUSA
[{
  name: "SelectUSA",
  linkedinUrl: "https://www.linkedin.com/company/selectusa/",
  type: "worked",
  reason: "Previously worked as Marketing Manager"
}]

// User clicks "Add All"
await autoAddUserCompanies(userId);
// SelectUSA added automatically
```

### **Daily Checking**

**Auto-repost service runs every 24 hours:**

```typescript
// Check SelectUSA for new posts
const posts = await scrapeCompanyPosts(
  "https://www.linkedin.com/showcase/selectusa/"
);

// Found new post
if (posts.length > 0 && !alreadyReposted(posts[0])) {
  // Share to user's LinkedIn
  await shareToLinkedIn(
    userAccessToken,
    userLinkedInId,
    posts[0].url,
    "Great content from SelectUSA! #SelectUSA"
  );
  
  // Save to history
  await storage.createRepost({
    postId: posts[0].id,
    userId: userId,
    comment: "Great content from SelectUSA!"
  });
}
```

---

## 🔐 Required Permissions

### **LinkedIn OAuth Scopes**

To use auto-discovery feature:
```
openid
profile
email
w_member_social (for posting)
r_liteprofile (for work history) - NEW
```

**Note:** You may need to request additional permissions from LinkedIn for accessing work history via API.

---

## 📝 Configuration

### **Environment Variables**

No new environment variables needed! Uses existing:
```
LINKEDIN_CLIENT_ID
LINKEDIN_CLIENT_SECRET
DATABASE_URL
SESSION_SECRET
```

### **LinkedIn Developer Console**

Add these products (if not already added):
1. ✅ Sign In with LinkedIn using OpenID Connect
2. ✅ Share on LinkedIn
3. ⚠️ Profile API (for work history) - Request access

---

## 🧪 Testing

### **Test Company Discovery**

```bash
# 1. Start sandbox
npm run dev

# 2. Log in with LinkedIn

# 3. Test company suggestions
curl http://localhost:5000/api/companies/suggestions \
  -H "Cookie: nexashare.sid=YOUR_SESSION_COOKIE"

# Expected: List of companies from your work history
```

### **Test Showcase Page**

```bash
# 1. Add SelectUSA showcase
curl -X POST http://localhost:5000/api/company-pages \
  -H "Content-Type: application/json" \
  -H "Cookie: nexashare.sid=YOUR_SESSION_COOKIE" \
  -d '{
    "linkedinPageUrl": "https://www.linkedin.com/showcase/selectusa/",
    "pageName": "SelectUSA",
    "autoRepost": true,
    "repostFrequency": "daily"
  }'

# 2. Check it was added
curl http://localhost:5000/api/company-pages \
  -H "Cookie: nexashare.sid=YOUR_SESSION_COOKIE"

# Expected: SelectUSA in the list
```

### **Test Auto-Add**

```bash
# Auto-add all companies from work history
curl -X POST http://localhost:5000/api/companies/auto-add \
  -H "Cookie: nexashare.sid=YOUR_SESSION_COOKIE"

# Expected: { "added": X, "skipped": Y, "errors": [] }
```

---

## 📚 API Reference

### **Complete API Endpoints**

```typescript
// Company Discovery
GET    /api/companies/suggestions       // Get suggested companies
POST   /api/companies/auto-add          // Auto-add all companies
POST   /api/companies/validate          // Validate LinkedIn URL
POST   /api/companies/bulk-enable       // Bulk enable auto-repost
GET    /api/companies/stats             // Get statistics

// Existing endpoints (still work)
GET    /api/company-pages               // List user's companies
POST   /api/company-pages               // Add a company
PUT    /api/company-pages/:id           // Update company
DELETE /api/company-pages/:id           // Delete company

// Reposting
POST   /api/linkedin/share              // Manual repost
GET    /api/reposts                     // Get repost history
```

---

## 🎉 Summary

### **What's New:**
1. ✅ Auto-discover companies from LinkedIn profile
2. ✅ Full showcase page support (like SelectUSA)
3. ✅ Bulk add companies (one-click import)
4. ✅ Bulk enable auto-repost
5. ✅ Company statistics dashboard
6. ✅ URL validation
7. ✅ Enhanced UI components

### **SelectUSA Use Case:**
- ✅ Add showcase URL: `https://www.linkedin.com/showcase/selectusa/`
- ✅ Enable daily checking
- ✅ Auto-reposts new content to your LinkedIn
- ✅ Tracks everything in history

### **Backward Compatible:**
- ✅ All existing features still work
- ✅ No breaking changes
- ✅ Database schema unchanged
- ✅ Existing company pages work as before

---

## 🚀 Next Steps

1. **Test in Sandbox:**
   - Try company discovery
   - Add SelectUSA showcase
   - Test auto-repost

2. **Configure LinkedIn:**
   - Request Profile API access
   - Add required scopes
   - Test OAuth flow

3. **Deploy to Production:**
   - All features ready
   - Follow deployment guide
   - Monitor auto-repost service

**Ready to use!** 🎉
