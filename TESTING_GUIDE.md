# Sandbox Testing Guide

## 🎯 Goal
Test all NexaShare features safely before deploying to production.

---

## 📋 Pre-Testing Setup

### Step 1: LinkedIn Developer Console Setup

1. **Go to:** https://www.linkedin.com/developers/apps
2. **Select your app** (or create one if needed)
3. **Go to "Auth" tab**
4. **Add sandbox redirect URI:**
   ```
   http://localhost:5000/auth/callback
   ```
5. **Make sure these scopes are enabled:**
   - ✅ openid
   - ✅ profile
   - ✅ email
   - ✅ w_member_social

6. **Copy your Client Secret:**
   - You'll need this for the .env.local file
   - Keep it secret!

### Step 2: Environment Configuration

1. **Copy the example file:**
   ```bash
   cp .env.example .env.local
   ```

2. **Edit .env.local and fill in:**
   ```bash
   # Required
   LINKEDIN_CLIENT_SECRET=your_secret_here
   DATABASE_URL=file:./sandbox.db
   SESSION_SECRET=any-random-string-here
   
   # Optional (for payment testing)
   STRIPE_SECRET_KEY=sk_test_...
   VITE_STRIPE_PUBLIC_KEY=pk_test_...
   ```

3. **Generate a session secret (optional but recommended):**
   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```

### Step 3: Install Dependencies

```bash
npm install
```

Expected output: No errors, all packages installed

---

## 🚀 Starting the Sandbox

### Start the Server

```bash
npm run dev
```

**Expected Output:**
```
🧪 ========================================
🧪 NexaShare SANDBOX Environment
🧪 ========================================
📊 Mode: DEVELOPMENT
🌍 Host: localhost
🔌 Port: 5000

✅ All required environment variables are set
🔌 Registering API routes...
🔨 Setting up Vite dev server...

🎉 ========================================
🎉 NEXASHARE SANDBOX IS RUNNING!
🎉 ========================================

🌐 Frontend:  http://localhost:5000
🔌 API:       http://localhost:5000/api
❤️  Health:    http://localhost:5000/health
📊 Info:      http://localhost:5000/sandbox-info

⏸️  Auto-repost service: DISABLED (sandbox mode)

✨ Ready for testing! Open your browser and start coding.
```

### Common Startup Issues

**Issue: "Port 5000 already in use"**
```bash
# Kill existing process
lsof -ti:5000 | xargs kill -9

# Or use different port
PORT=5001 npm run dev
```

**Issue: "LINKEDIN_CLIENT_SECRET not set"**
```
Solution: Add it to .env.local file
```

**Issue: "Database connection failed"**
```
Solution: Make sure DATABASE_URL is set to file:./sandbox.db
```

---

## 🧪 Test Suite

### Test 1: Server Health Check ✅

**Purpose:** Verify server is running correctly

**Command:**
```bash
curl http://localhost:5000/health
```

**Expected Response:**
```json
{
  "status": "healthy",
  "timestamp": "2026-01-27T...",
  "environment": "development",
  "sandbox": true,
  "database": true,
  "linkedinConfigured": true
}
```

**✅ Pass Criteria:** All fields return `true` or valid values

---

### Test 2: Sandbox Info Endpoint ✅

**Purpose:** Verify sandbox configuration

**Command:**
```bash
curl http://localhost:5000/sandbox-info
```

**Expected Response:**
```json
{
  "message": "NexaShare Sandbox Environment",
  "features": {
    "linkedinOAuth": true,
    "database": true,
    "stripe": true,
    "autoRepost": "disabled-in-sandbox",
    "cors": "enabled-for-localhost",
    "verboseLogging": true
  },
  "endpoints": {
    "health": "/health",
    "api": "/api/*",
    ...
  }
}
```

**✅ Pass Criteria:** linkedinOAuth and database are `true`

---

### Test 3: CORS Configuration ✅

**Purpose:** Verify frontend can communicate with API

**Command:**
```bash
curl -H "Origin: http://localhost:5000" \
     -H "Access-Control-Request-Method: POST" \
     -H "Access-Control-Request-Headers: Content-Type" \
     -X OPTIONS \
     http://localhost:5000/api/auth/login \
     --verbose
```

**Expected in Response:**
```
< Access-Control-Allow-Origin: http://localhost:5000
< Access-Control-Allow-Credentials: true
< Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS
```

**✅ Pass Criteria:** CORS headers are present

---

### Test 4: Frontend Loads ✅

**Purpose:** Verify React app builds and serves

**Steps:**
1. Open browser
2. Go to http://localhost:5000
3. Check browser console (F12) for errors

**Expected:**
- Login page loads
- No errors in console
- "Continue with LinkedIn" button visible

**✅ Pass Criteria:** Page loads without errors

---

### Test 5: LinkedIn OAuth Flow ✅

**Purpose:** Test complete authentication

**Steps:**
1. Click "Continue with LinkedIn"
2. Should redirect to LinkedIn
3. Log in with your LinkedIn account
4. Should redirect back to http://localhost:5000
5. Should see Dashboard

**Expected in Terminal:**
```
✅ POST /api/auth/linkedin-callback 200 in XXXms
```

**Expected in Browser:**
- User is logged in
- Dashboard shows
- User profile visible

**✅ Pass Criteria:** Can log in successfully

**Common Issues:**
- "Redirect URI mismatch" → Check LinkedIn console has localhost URI
- "Invalid client secret" → Check .env.local has correct secret
- "State mismatch" → Clear browser cache and try again

---

### Test 6: Session Persistence ✅

**Purpose:** Verify user stays logged in

**Steps:**
1. After logging in (Test 5)
2. Refresh the page (F5)
3. Should still be logged in

**✅ Pass Criteria:** User doesn't get logged out on refresh

---

### Test 7: Add Company Page ✅

**Purpose:** Test company page management

**Steps:**
1. In Dashboard, find "Company Link" field
2. Enter a LinkedIn company URL:
   ```
   https://www.linkedin.com/company/microsoft
   ```
3. Click "Save"

**Expected:**
```
✅ Success message appears
✅ Company link is saved
```

**Check Database:**
```bash
# If using SQLite
sqlite3 sandbox.db "SELECT * FROM company_pages;"
```

**✅ Pass Criteria:** Company page saved to database

---

### Test 8: Manual Repost ✅

**Purpose:** Test core repost functionality

**Setup:**
1. Find any LinkedIn post URL from the company you added
2. Example: `https://www.linkedin.com/feed/update/urn:li:activity:7158...`

**Steps:**
1. In Dashboard, scroll to "Quick Repost" section
2. Paste the post URL in "Post URL" field
3. (Optional) Add a comment
4. Click "Share to My Feed"

**Expected in Terminal:**
```
✅ POST /api/linkedin/share 201 in XXXms
```

**Expected in Browser:**
```
✅ Success: "Reposted successfully!"
✅ Post URL and comment clear
```

**Verify on LinkedIn:**
1. Go to your LinkedIn profile
2. Check your feed
3. The post should appear as a share

**✅ Pass Criteria:** Post appears on your LinkedIn feed

**Common Issues:**
- "Access token expired" → Log out and log in again
- "Invalid post URL" → Make sure it's a full LinkedIn URL
- "Failed to share" → Check LinkedIn API limits

---

### Test 9: View Repost History ✅

**Purpose:** Test history tracking

**Steps:**
1. After doing a repost (Test 8)
2. Scroll to "Re-Post History" table
3. Should see your repost listed

**Expected:**
```
✅ Table shows:
   - Date
   - Company Post Link
   - User Repost Link
   - Post Text
```

**✅ Pass Criteria:** Repost appears in history table

---

### Test 10: Multiple Sessions ✅

**Purpose:** Test concurrent users

**Steps:**
1. Open http://localhost:5000 in Chrome
2. Log in with Account A
3. Open http://localhost:5000 in Firefox (or Incognito)
4. Log in with Account B
5. Both should work independently

**✅ Pass Criteria:** Multiple users can use app simultaneously

---

### Test 11: Error Handling ✅

**Purpose:** Verify app handles errors gracefully

**Test A: Invalid Login**
```bash
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"fake","password":"fake"}'
```

**Expected:**
```json
{"message":"Invalid credentials"}
```

**Test B: Missing Fields**
```bash
curl -X POST http://localhost:5000/api/linkedin/share \
  -H "Content-Type: application/json" \
  -d '{}'
```

**Expected:**
```json
{"message":"Post URL is required"}
```

**✅ Pass Criteria:** Errors return proper messages, not crashes

---

### Test 12: Database Operations ✅

**Purpose:** Verify data persistence

**Steps:**
1. Add a company page
2. Create a repost
3. Stop the server (Ctrl+C)
4. Restart: `npm run dev`
5. Log in again
6. Check if data is still there

**✅ Pass Criteria:** Data persists across server restarts

---

## 🔍 Debugging Tools

### View Server Logs
Terminal where you ran `npm run dev` shows all logs in real-time

### Check Browser Console
1. Open Developer Tools (F12)
2. Go to "Console" tab
3. Look for errors (red text)

### Check Network Requests
1. In Developer Tools, go to "Network" tab
2. Refresh page
3. See all API calls
4. Click on any request to see details

### Database Inspection
```bash
# If using SQLite
sqlite3 sandbox.db

# Then run SQL commands:
.tables                    # List all tables
SELECT * FROM users;       # View users
SELECT * FROM company_pages; # View company pages
SELECT * FROM posts;       # View posts
SELECT * FROM reposts;     # View reposts
.exit                      # Exit
```

---

## 📊 Test Results Checklist

Track your progress:

- [ ] Test 1: Server Health Check
- [ ] Test 2: Sandbox Info Endpoint
- [ ] Test 3: CORS Configuration
- [ ] Test 4: Frontend Loads
- [ ] Test 5: LinkedIn OAuth Flow
- [ ] Test 6: Session Persistence
- [ ] Test 7: Add Company Page
- [ ] Test 8: Manual Repost
- [ ] Test 9: View Repost History
- [ ] Test 10: Multiple Sessions
- [ ] Test 11: Error Handling
- [ ] Test 12: Database Operations

**All tests passed?** ✅ Ready for production deployment!

**Some tests failed?** ❌ Debug using the troubleshooting section below

---

## 🐛 Troubleshooting Guide

### Frontend doesn't load
**Check:**
1. Is server running? Look for "NEXASHARE SANDBOX IS RUNNING" message
2. Is port 5000 accessible? Try `curl http://localhost:5000`
3. Any errors in terminal?

**Solution:**
```bash
# Restart server
Ctrl+C
npm run dev
```

### LinkedIn OAuth fails
**Check:**
1. Is `http://localhost:5000/auth/callback` in LinkedIn console?
2. Is LINKEDIN_CLIENT_SECRET correct in .env.local?
3. Clear browser cookies and try again

**Solution:**
```bash
# Verify secret is set
grep LINKEDIN_CLIENT_SECRET .env.local

# Should show: LINKEDIN_CLIENT_SECRET=your_actual_secret
```

### Session expires immediately
**Check:**
1. Is SESSION_SECRET set in .env.local?
2. Are cookies enabled in browser?

**Solution:**
Add to .env.local:
```
SESSION_SECRET=some-random-long-string-here
```

### Repost fails
**Check:**
1. Is LinkedIn access token still valid?
2. Is post URL correctly formatted?
3. Check terminal for API errors

**Solution:**
1. Log out and log in again (refreshes token)
2. Use a recent post (< 1 week old)
3. Check LinkedIn API status: https://www.linkedin-status.com/

### Database errors
**Check:**
1. Is DATABASE_URL set?
2. Does sandbox.db file exist?
3. Was `npm run db:push` executed?

**Solution:**
```bash
# Recreate database
rm sandbox.db
npm run db:push
```

---

## 🎓 Understanding Test Results

### What Each Test Validates

| Test | What It Checks | Why It Matters |
|------|----------------|----------------|
| 1 | Server responds | App is running |
| 2 | Config loaded | Environment is correct |
| 3 | CORS works | Frontend can talk to API |
| 4 | React app builds | Frontend code is valid |
| 5 | OAuth works | Users can log in |
| 6 | Sessions persist | Users stay logged in |
| 7 | Database writes | Data can be saved |
| 8 | LinkedIn API | Core feature works |
| 9 | Data retrieval | Can read from database |
| 10 | Concurrency | Multiple users supported |
| 11 | Error handling | App doesn't crash |
| 12 | Data persistence | Data survives restarts |

---

## ✅ Ready for Production?

### Checklist Before Deploying

- [ ] All 12 tests pass
- [ ] No errors in browser console
- [ ] No errors in server logs
- [ ] LinkedIn OAuth works smoothly
- [ ] Manual repost works consistently
- [ ] Data persists correctly
- [ ] Sessions work properly
- [ ] Multiple users tested

### If All Tests Pass:

🎉 **Congratulations!** Your app is working correctly in sandbox.

**Next Steps:**
1. Review the "Deployment Guide" document
2. Choose hosting platform (Railway recommended)
3. Set up production environment
4. Deploy!

### If Some Tests Fail:

📋 **Document the failures:**
1. Which test(s) failed?
2. What was the error message?
3. What did you try?

Then ask for help with specific error details.

---

## 💾 Saving Your Test Results

Create a test results file:

```bash
# Copy this template
cat > test-results.md << 'EOF'
# NexaShare Sandbox Test Results

Date: [Today's date]
Tester: [Your name]

## Environment
- Node version: [run: node --version]
- npm version: [run: npm --version]
- OS: [Windows/Mac/Linux]

## Test Results

### Test 1: Server Health ✅/❌
[Notes]

### Test 2: Sandbox Info ✅/❌
[Notes]

[Continue for all tests...]

## Issues Found
1. [Description]
2. [Description]

## Next Steps
[What to do next]
EOF

# Then edit with your results
nano test-results.md
```

---

## 📞 Getting Help

If you're stuck:

1. **Check the error message** carefully
2. **Search this document** for the error
3. **Review troubleshooting section**
4. **Check terminal logs** for clues
5. **Share specific error details** when asking for help

Include:
- Which test failed
- Error message (exact text)
- What you tried
- Screenshots if helpful

Happy testing! 🚀
