# NexaShare

> Current production architecture: Cloudflare Worker + D1 + Worker assets.
> Reposting uses LinkedIn's visible browser UI through the user-initiated
> Chrome extension. See [DEPLOYMENT.md](DEPLOYMENT.md).

## 🎯 Purpose
This is a safe testing environment where we can:
- Test all code fixes without breaking production
- Verify LinkedIn OAuth flow
- Test repost functionality
- Debug issues safely
- Learn how everything works

## 🏗️ What's Different from Production?

| Feature | Sandbox | Production |
|---------|---------|-----------|
| Domain | localhost:5000 | nexashare.com |
| Database | Local SQLite or test DB | Production PostgreSQL |
| LinkedIn OAuth | Test redirect URI | Production redirect URI |
| Auto-repost | Disabled | Enabled |
| Error logging | Verbose | Production level |
| Rate limits | None | LinkedIn limits apply |

## 📋 Prerequisites

1. **Node.js 18+** installed
2. **npm** installed
3. **Text editor** (VS Code recommended)
4. **Browser** (Chrome/Firefox)
5. **LinkedIn Developer Account** (for OAuth testing)

Check your versions:
```bash
node --version  # Should be v18 or higher
npm --version   # Should be v8 or higher
```

## 🚀 Quick Start

### Step 1: Copy Files
```bash
# You should have these files in this directory:
nexashare-sandbox/
├── package.json
├── .env.local
├── tsconfig.json
├── vite.config.ts
├── server/
│   ├── index.ts
│   ├── routes.ts
│   ├── db.ts
│   └── storage.ts
├── client/
│   └── src/
│       ├── App.tsx
│       └── pages/
└── shared/
    └── schema.ts
```

### Step 2: Install Dependencies
```bash
cd nexashare-sandbox
npm install
```

### Step 3: Configure Environment
```bash
# Copy the example env file
cp .env.example .env.local

# Edit with your values
nano .env.local  # or use any text editor
```

### Step 4: Set Up Database
```bash
# Create database schema
npm run db:push

# Verify it worked
npm run db:check
```

### Step 5: Start Development Server
```bash
npm run dev
```

You should see:
```
🚀 NexaShare sandbox running on http://localhost:5000
📊 Environment: development
🔗 API: http://localhost:5000/api
⏸️  Auto-repost service disabled in development
```

### Step 6: Open in Browser
Visit: http://localhost:5000

You should see the NexaShare login page.

## 🔧 Configuration

### Environment Variables (.env.local)

```bash
# Database (Use SQLite for sandbox)
DATABASE_URL=file:./sandbox.db

# LinkedIn OAuth (Sandbox credentials)
LINKEDIN_CLIENT_ID=78dsjq2rbcv26t
LINKEDIN_CLIENT_SECRET=your_test_secret_here
VITE_LINKEDIN_CLIENT_ID=78dsjq2rbcv26t

# Sandbox redirect (localhost)
VITE_REDIRECT_URI=http://localhost:5000/auth/callback

# Session (use any random string for testing)
SESSION_SECRET=sandbox-secret-change-for-production-12345678

# Development settings
NODE_ENV=development
PORT=5000
HOST=localhost

# Stripe (Use test keys)
STRIPE_SECRET_KEY=sk_test_your_test_key
VITE_STRIPE_PUBLIC_KEY=pk_test_your_test_key
```

### LinkedIn Developer Console (Sandbox Setup)

1. Go to [LinkedIn Developers](https://developer.linkedin.com)
2. Select your app (or create a test app)
3. Add **sandbox redirect URI**:
   ```
   http://localhost:5000/auth/callback
   ```
4. Enable required scopes:
   - openid
   - profile
   - email

**Production redirect:** `https://nexashare.com/api/auth/callback`

## 🧪 Testing Checklist

### Test 1: Server Health
```bash
curl http://localhost:5000/health
```

Expected response:
```json
{
  "status": "healthy",
  "timestamp": "2026-01-27T...",
  "environment": "development",
  "database": true
}
```

✅ Pass | ❌ Fail

### Test 2: API Endpoints
```bash
# Test login endpoint (should return 400 - missing credentials)
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{}'
```

Expected: `{"message":"Username and password are required"}`

✅ Pass | ❌ Fail

### Test 3: LinkedIn OAuth Flow
1. Open browser: http://localhost:5000
2. Click "Continue with LinkedIn"
3. Should redirect to LinkedIn
4. Log in with your LinkedIn account
5. Should redirect back to http://localhost:5000
6. Should be logged in

✅ Pass | ❌ Fail

### Test 4: Add Company Page
1. After logging in, go to Dashboard
2. Enter a LinkedIn company URL
3. Click "Save"
4. Should see success message

✅ Pass | ❌ Fail

### Test 5: Manual Repost
1. In Dashboard, find a LinkedIn post URL
2. Paste it in "Post URL" field
3. Add optional comment
4. Click "Share to My Feed"
5. Check your LinkedIn - post should appear

✅ Pass | ❌ Fail

### Test 6: View History
1. Go to Dashboard
2. Scroll to "Re-Post History" table
3. Should see your repost listed

✅ Pass | ❌ Fail

## 🐛 Troubleshooting

### Issue: npm install fails
**Solution:**
```bash
# Clear npm cache
npm cache clean --force

# Delete node_modules and try again
rm -rf node_modules package-lock.json
npm install
```

### Issue: Database connection fails
**Solution:**
```bash
# Check if DATABASE_URL is set
echo $DATABASE_URL

# Try SQLite instead
DATABASE_URL=file:./sandbox.db npm run db:push
```

### Issue: LinkedIn OAuth fails
**Check:**
1. Redirect URI in LinkedIn console matches exactly
2. Client ID and Secret are correct
3. Browser allows cookies
4. No ad blockers interfering

### Issue: Port 5000 already in use
**Solution:**
```bash
# Kill process on port 5000
lsof -ti:5000 | xargs kill -9

# Or use different port
PORT=5001 npm run dev
```

### Issue: CORS errors
**This should be fixed in our sandbox code!**

Check browser console - if you see CORS errors:
```bash
# Restart server with verbose logging
DEBUG=* npm run dev
```

## 📊 Sandbox Features

### Enabled in Sandbox:
✅ LinkedIn OAuth login
✅ Manual repost
✅ Company page management
✅ History tracking
✅ All UI features
✅ Verbose error logging
✅ Hot reload (code changes auto-refresh)

### Disabled in Sandbox:
❌ Auto-repost service (to save API calls)
❌ Production SSL
❌ Rate limiting
❌ Email notifications
❌ Analytics tracking

## 🔄 Development Workflow

### Making Changes

1. **Edit code** in your editor
2. **Save file** - Vite will auto-reload
3. **Refresh browser** - See changes immediately
4. **Check logs** in terminal for errors

### Testing Changes

```bash
# Run type checking
npm run check

# Run build test
npm run build

# Test production build locally
npm run start
```

### Database Changes

```bash
# After modifying schema.ts
npm run db:push

# Generate migrations
npm run db:generate

# View current schema
npm run db:studio  # Opens Drizzle Studio in browser
```

## 📝 Sandbox vs Production Differences

### Code Changes for Production:

1. **Environment:**
   ```typescript
   // Sandbox
   NODE_ENV=development
   
   // Production
   NODE_ENV=production
   ```

2. **Database:**
   ```typescript
   // Sandbox
   DATABASE_URL=file:./sandbox.db
   
   // Production
   DATABASE_URL=postgresql://...
   ```

3. **Domain:**
   ```typescript
   // Sandbox
   VITE_REDIRECT_URI=http://localhost:5000/auth/callback
   
   // Production
   VITE_REDIRECT_URI=https://nexashare.com/auth/callback
   ```

4. **Auto-repost:**
   ```typescript
   // Sandbox: disabled
   // Production: enabled automatically
   ```

## 🎓 Learning Resources

### Understanding the Code

- `server/index.ts` - Server setup and configuration
- `server/routes.ts` - API endpoints
- `server/storage.ts` - Database operations
- `client/src/App.tsx` - Frontend routing
- `client/src/pages/Dashboard.tsx` - Main UI
- `shared/schema.ts` - Database schema

### Key Concepts

1. **OAuth Flow:** User → LinkedIn → Callback → Session
2. **Repost Flow:** User pastes URL → API call → LinkedIn post
3. **Auto-repost:** Background service checks company pages
4. **Sessions:** Server-side session management
5. **Database:** PostgreSQL with Drizzle ORM

## 🚀 Next Steps

After testing in sandbox:

1. ✅ Verify all features work
2. ✅ Fix any bugs found
3. ✅ Test with real LinkedIn account
4. ✅ Document any issues
5. ✅ Prepare for production deployment

## 📞 Getting Help

If something doesn't work:

1. **Check the logs** in your terminal
2. **Check browser console** (F12)
3. **Review the error message**
4. **Search the troubleshooting section**
5. **Ask for help** with specific error messages

## ⚠️ Important Notes

- **Never commit .env.local** - It contains secrets
- **Use test LinkedIn account** - Don't spam your real network
- **Don't enable auto-repost** in sandbox - Wastes API quota
- **Keep sandbox and production separate** - Different databases
- **Test thoroughly** before deploying to production

---

## 🎉 You're Ready!

Your sandbox is set up and ready for testing. Start with Test 1 (Server Health) and work through the checklist.

Happy coding! 🚀
