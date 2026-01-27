# 🧪 NexaShare Sandbox - Quick Start Guide

## 📦 What You Have

I've created a complete **sandbox testing environment** for NexaShare with:

✅ **All critical bugs fixed**
✅ **Proper CORS configuration**
✅ **Environment validation**
✅ **Better error handling**
✅ **Comprehensive testing guide**
✅ **Step-by-step instructions**

## 🎯 What is the Sandbox?

The sandbox is a **safe local testing environment** where you can:
- Test all features without affecting production
- Debug issues easily with verbose logging
- Learn how the application works
- Verify LinkedIn OAuth integration
- Test reposts without limits
- Make changes safely

**Think of it as a playground where you can't break anything!**

---

## 🚀 Quick Start (5 Minutes)

### Step 1: Extract Files
```bash
# Download and extract the sandbox archive
tar -xzf nexashare-sandbox.tar.gz
cd nexashare-sandbox
```

### Step 2: Configure Environment
```bash
# Copy environment template
cp .env.example .env.local

# Edit with your values (use any text editor)
nano .env.local
```

**Minimum required:**
```bash
LINKEDIN_CLIENT_SECRET=your_secret_from_linkedin
DATABASE_URL=file:./sandbox.db
SESSION_SECRET=any-random-string
```

### Step 3: LinkedIn Setup
1. Go to https://www.linkedin.com/developers/apps
2. Select your app
3. Go to "Auth" tab
4. Add redirect URL: `http://localhost:5000/auth/callback`
5. Copy your Client Secret

### Step 4: Install & Run
```bash
# Install dependencies (takes 2-3 minutes)
npm install

# Start sandbox server
npm run dev
```

### Step 5: Test
Open browser: http://localhost:5000

**You should see:**
```
🎉 ========================================
🎉 NEXASHARE SANDBOX IS RUNNING!
🎉 ========================================

🌐 Frontend:  http://localhost:5000
🔌 API:       http://localhost:5000/api
❤️  Health:    http://localhost:5000/health
📊 Info:      http://localhost:5000/sandbox-info
```

---

## 📚 Documentation Included

### 1. **README.md** - Main documentation
- What's different from production
- Prerequisites and setup
- Configuration guide
- Troubleshooting

### 2. **TESTING_GUIDE.md** - Complete test suite
- 12 comprehensive tests
- Step-by-step instructions
- Expected results
- Debugging tools

### 3. **.env.example** - Environment template
- All required variables
- Helpful comments
- Instructions for each value

---

## 🔧 What's Fixed

### Critical Fixes Applied:

1. ✅ **CORS Configuration**
   - Frontend can now communicate with API
   - No more "blocked by CORS policy" errors

2. ✅ **Session Management**
   - Users stay logged in
   - 7-day session duration
   - Proper cookie configuration

3. ✅ **Environment Validation**
   - Server checks for required config on startup
   - Clear error messages if something is missing

4. ✅ **LinkedIn OAuth**
   - Works in both localhost and production
   - Better error messages
   - State validation improved

5. ✅ **Auto-Repost Service**
   - Disabled in sandbox (saves API quota)
   - Can be manually enabled if needed

6. ✅ **Error Handling**
   - Verbose logging in sandbox
   - Stack traces for debugging
   - Helpful error messages

7. ✅ **Health Check Endpoint**
   - Easy way to verify server is running
   - Shows configuration status

8. ✅ **Graceful Shutdown**
   - Server closes cleanly
   - No hanging processes

---

## 🧪 Testing Workflow

### Quick Tests (5 minutes)

```bash
# Test 1: Check server health
curl http://localhost:5000/health

# Test 2: Check sandbox info
curl http://localhost:5000/sandbox-info

# Test 3: Check CORS
curl -H "Origin: http://localhost:5000" \
     -X OPTIONS http://localhost:5000/api/auth/login \
     --verbose | grep Access-Control
```

### Full Test Suite (30 minutes)

Follow the **TESTING_GUIDE.md** for:
- LinkedIn OAuth flow
- Company page management
- Manual repost functionality
- History tracking
- Session persistence
- Error handling
- Database operations

---

## 💡 Key Features

### Sandbox-Specific Features:

1. **Verbose Logging**
   - Every API call logged
   - Request/response details shown
   - Colored output for status codes

2. **Development Mode**
   - Hot reload (changes auto-refresh)
   - Detailed error messages
   - Stack traces included

3. **Safety Features**
   - Auto-repost disabled
   - Uses local database
   - Won't affect production

4. **Testing Tools**
   - Health check endpoint
   - Sandbox info endpoint
   - Debug logging

---

## 📋 Testing Checklist

Use this to track your progress:

- [ ] Environment configured (.env.local)
- [ ] Dependencies installed (npm install)
- [ ] Server starts without errors
- [ ] Health check passes
- [ ] Frontend loads in browser
- [ ] LinkedIn OAuth works
- [ ] Can add company page
- [ ] Can create manual repost
- [ ] Repost appears on LinkedIn
- [ ] History shows repost
- [ ] Session persists on refresh
- [ ] No errors in console

**All checked?** ✅ Ready to proceed!

---

## 🐛 Common Issues & Solutions

### Issue: "npm install" fails
**Solution:**
```bash
# Clear cache and retry
npm cache clean --force
rm -rf node_modules package-lock.json
npm install
```

### Issue: Port 5000 in use
**Solution:**
```bash
# Kill existing process
lsof -ti:5000 | xargs kill -9

# Or use different port
PORT=5001 npm run dev
```

### Issue: LinkedIn OAuth fails
**Solution:**
1. Check redirect URI in LinkedIn console
2. Verify Client Secret in .env.local
3. Clear browser cookies
4. Try again

### Issue: Database errors
**Solution:**
```bash
# Reset database
rm sandbox.db
npm run db:push
```

---

## 🎓 Next Steps

### After Testing in Sandbox:

1. **All tests pass?**
   - Review production deployment guide
   - Choose hosting platform
   - Set up production environment

2. **Found issues?**
   - Document the problems
   - Check troubleshooting guide
   - Ask for help with specifics

3. **Want to make changes?**
   - Edit code in sandbox
   - Test immediately
   - Deploy when satisfied

---

## 📁 Sandbox Structure

```
nexashare-sandbox/
├── README.md              # Main documentation
├── TESTING_GUIDE.md       # Test procedures
├── package.json           # Dependencies
├── .env.example           # Environment template
├── server/
│   ├── index.ts          # Fixed server (with CORS, etc.)
│   ├── routes.ts         # API endpoints
│   ├── storage.ts        # Database operations
│   └── ...
├── client/
│   └── src/
│       ├── pages/        # React pages
│       └── ...
└── shared/
    └── schema.ts         # Database schema
```

---

## 🔄 Sandbox vs Production

| Feature | Sandbox | Production |
|---------|---------|-----------|
| Domain | localhost:5000 | nexashare.com |
| Database | Local SQLite | PostgreSQL |
| Auto-repost | Disabled | Enabled |
| Logging | Verbose | Standard |
| CORS | Localhost only | Production domains |
| SSL | Not required | Required |

---

## ⚡ Quick Commands

```bash
# Start development server
npm run dev

# Check TypeScript
npm run check

# Build for production
npm run build

# Reset database
rm sandbox.db && npm run db:push

# View logs (if logging to file)
npm run logs

# Clean and reinstall
npm run reset
```

---

## 📞 Getting Help

If you're stuck:

1. **Check logs** in terminal where you ran `npm run dev`
2. **Check browser console** (F12 → Console tab)
3. **Review TESTING_GUIDE.md** for specific test failures
4. **Check README.md** for configuration issues

**When asking for help, provide:**
- Which step you're on
- Exact error message
- What you've tried
- Screenshots if helpful

---

## ✨ What Makes This Better?

Compared to the original Replit version:

✅ **Fixed CORS** - Frontend works properly
✅ **Fixed Sessions** - Users stay logged in
✅ **Better Errors** - Easy to debug
✅ **Environment Checks** - Catches config issues early
✅ **Sandbox Mode** - Safe testing environment
✅ **Complete Docs** - Step-by-step guides
✅ **Testing Suite** - Verify everything works

---

## 🎉 You're All Set!

Your sandbox environment is ready to use. Follow these steps:

1. Extract the archive
2. Configure .env.local
3. Run npm install
4. Start with npm run dev
5. Follow TESTING_GUIDE.md

**Have fun testing! 🚀**

---

## 📝 Notes

- **Don't commit .env.local** - Contains secrets
- **Use test LinkedIn account** - For testing reposts
- **Keep sandbox separate** - Different from production
- **Test thoroughly** - Before deploying to production

---

## 🔗 Related Documents

You also have these guides:
- **Deployment Guide** - How to deploy to production
- **Quick Fixes** - List of all code improvements
- **DNS Configuration** - Domain setup guide
- **Application Overview** - How NexaShare works

All available in the outputs folder!
