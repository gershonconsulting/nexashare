# NexaShare Quick Fixes Checklist

## 🔥 Critical Issues to Fix Immediately

### 1. CORS Configuration (CRITICAL)
**Problem:** Frontend can't communicate with backend in production
**Location:** `server/index.ts`

**Add this BEFORE routes:**
```typescript
import cors from 'cors';

const corsOptions = {
  origin: process.env.NODE_ENV === 'production' 
    ? ['https://nexashare.com', 'https://www.nexashare.com']
    : 'http://localhost:5173',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
};

app.use(cors(corsOptions));
```

**Install dependency:**
```bash
npm install cors
npm install --save-dev @types/cors
```

---

### 2. Environment Variables Validation
**Problem:** Server starts even with missing critical config
**Location:** `server/index.ts`

**Add this function:**
```typescript
function validateEnv() {
  const required = [
    'DATABASE_URL',
    'LINKEDIN_CLIENT_SECRET',
    'SESSION_SECRET'
  ];
  
  const missing = required.filter(key => !process.env[key]);
  
  if (missing.length > 0) {
    console.error('❌ Missing required environment variables:', missing.join(', '));
    process.exit(1);
  }
  
  console.log('✅ Environment validated');
}

// Call before server starts
validateEnv();
```

---

### 3. Session Configuration Fix
**Problem:** Users getting logged out randomly
**Location:** `server/routes.ts` - session configuration

**Current code has issues. Replace with:**
```typescript
app.use(
  session({
    secret: process.env.SESSION_SECRET || "nexashare-secret-change-in-production",
    resave: false,
    saveUninitialized: false,
    store: new MemoryStoreSession({
      checkPeriod: 86400000, // prune expired entries every 24h
    }),
    cookie: {
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days instead of 1
      secure: process.env.NODE_ENV === "production",
      sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
      httpOnly: true,
      domain: process.env.NODE_ENV === "production" ? ".nexashare.com" : undefined
    },
    proxy: true,
    name: 'nexashare.sid' // Custom name to avoid conflicts
  })
);
```

---

### 4. LinkedIn Redirect URI Fix
**Problem:** Hardcoded production URL breaks development
**Location:** `client/src/lib/linkedinAuth.ts`

**Replace:**
```typescript
private get redirectUri(): string {
  // Always use production redirect URI
  return 'https://nexashare.com/auth/callback';
}
```

**With:**
```typescript
private get redirectUri(): string {
  const isDev = import.meta.env.DEV;
  if (isDev) {
    return 'http://localhost:5000/auth/callback';
  }
  return import.meta.env.VITE_REDIRECT_URI || 'https://nexashare.com/auth/callback';
}
```

**Add to .env:**
```
VITE_REDIRECT_URI=https://nexashare.com/auth/callback
```

---

### 5. Auto-Repost Service Fix
**Problem:** Runs in development, wastes API calls
**Location:** `server/index.ts`

**Replace:**
```typescript
server.listen(port, () => {
  log(`serving on port ${port}`);
  startAutoRepostService(); // Always runs!
});
```

**With:**
```typescript
server.listen(port, () => {
  log(`serving on port ${port}`);
  
  // Only start auto-repost in production
  if (process.env.NODE_ENV === 'production') {
    startAutoRepostService();
    log('✅ Auto-repost service started');
  } else {
    log('⏸️  Auto-repost service disabled in development');
  }
});
```

---

### 6. Database Connection Error Handling
**Problem:** App crashes if database is unavailable
**Location:** `server/db.ts`

**Add proper error handling:**
```typescript
import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import * as schema from '@shared/schema';

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL environment variable is required');
}

let db: any;

try {
  const sql = neon(process.env.DATABASE_URL);
  db = drizzle(sql, { schema });
  console.log('✅ Database connected');
} catch (error) {
  console.error('❌ Database connection failed:', error);
  process.exit(1);
}

export { db };
```

---

### 7. Health Check Endpoint
**Problem:** No way to verify app is running
**Location:** `server/index.ts`

**Add before routes:**
```typescript
app.get('/health', (req, res) => {
  res.status(200).json({ 
    status: 'healthy',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV,
    database: !!process.env.DATABASE_URL
  });
});
```

---

### 8. Better Error Responses
**Problem:** Generic "500 Internal Server Error" messages
**Location:** `server/routes.ts`

**Replace generic error handler:**
```typescript
app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  const status = err.status || err.statusCode || 500;
  const message = err.message || "Internal Server Error";
  
  console.error('Server error:', err);
  res.status(status).json({ 
    message,
    ...(process.env.NODE_ENV === 'development' && { 
      stack: err.stack,
      details: err 
    })
  });
});
```

---

### 9. LinkedIn Token Refresh
**Problem:** Users need to re-login when token expires
**Location:** Create new file `server/linkedinTokenRefresh.ts`

```typescript
export async function refreshLinkedInToken(userId: number): Promise<boolean> {
  try {
    const user = await storage.getUser(userId);
    
    if (!user?.linkedinAccessToken) {
      return false;
    }
    
    // Check if token is about to expire (within 7 days)
    const expiryDate = new Date(user.linkedinTokenExpiry || 0);
    const now = new Date();
    const daysUntilExpiry = (expiryDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
    
    if (daysUntilExpiry > 7) {
      return true; // Token is still fresh
    }
    
    // LinkedIn doesn't support refresh tokens for OAuth 2.0
    // User needs to re-authenticate
    return false;
  } catch (error) {
    console.error('Token refresh check failed:', error);
    return false;
  }
}
```

---

### 10. Graceful Shutdown
**Problem:** Server doesn't clean up properly on shutdown
**Location:** `server/index.ts`

**Add at the end:**
```typescript
// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM signal received: closing HTTP server');
  server.close(() => {
    console.log('HTTP server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('SIGINT signal received: closing HTTP server');
  server.close(() => {
    console.log('HTTP server closed');
    process.exit(0);
  });
});
```

---

## 🚀 Quick Implementation Steps

### Step 1: Install Missing Dependencies
```bash
npm install cors
npm install --save-dev @types/cors
```

### Step 2: Update Environment Variables
Add to your `.env` or Replit Secrets:
```
SESSION_SECRET=<generate-32-char-random-string>
NODE_ENV=production
VITE_REDIRECT_URI=https://nexashare.com/auth/callback
```

Generate session secret:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### Step 3: Apply Fixes in Order
1. ✅ Add CORS configuration
2. ✅ Add environment validation
3. ✅ Fix session configuration
4. ✅ Fix LinkedIn redirect URI
5. ✅ Fix auto-repost service
6. ✅ Add database error handling
7. ✅ Add health check endpoint
8. ✅ Improve error responses
9. ✅ Add graceful shutdown

### Step 4: Test Locally
```bash
npm run dev
```

Visit: `http://localhost:5000`
- Check browser console for errors
- Try LinkedIn login
- Test repost functionality

### Step 5: Deploy to Production
```bash
npm run build
npm start
```

---

## 📋 Testing Checklist

After applying fixes:

- [ ] Server starts without errors
- [ ] Health check works: `curl https://nexashare.com/health`
- [ ] No CORS errors in browser console
- [ ] LinkedIn login works
- [ ] Sessions persist after page refresh
- [ ] Repost functionality works
- [ ] Auto-repost only runs in production
- [ ] Database errors are caught and logged
- [ ] Server shuts down gracefully

---

## 🔍 Debugging Commands

### Check if server is running:
```bash
curl https://nexashare.com/health
```

Expected response:
```json
{
  "status": "healthy",
  "timestamp": "2026-01-27T...",
  "environment": "production",
  "database": true
}
```

### Check CORS:
```bash
curl -H "Origin: https://nexashare.com" \
     -H "Access-Control-Request-Method: POST" \
     -H "Access-Control-Request-Headers: Content-Type" \
     -X OPTIONS https://nexashare.com/api/auth/login \
     --verbose
```

Look for: `Access-Control-Allow-Origin` header

### View logs (if on Railway):
```bash
railway logs
```

### View logs (if on Render):
```bash
render logs
```

---

## 🆘 Common Errors and Solutions

### Error: "Cannot set headers after they are sent"
**Cause:** Multiple responses in one request
**Fix:** Check for duplicate `res.json()` or `res.send()` calls

### Error: "CORS policy blocked"
**Cause:** CORS not configured or wrong origin
**Fix:** Apply CORS fix from above

### Error: "Session not found"
**Cause:** Session middleware not working
**Fix:** Apply session configuration fix

### Error: "LinkedIn OAuth failed"
**Cause:** Wrong redirect URI
**Fix:** Apply LinkedIn redirect URI fix

### Error: "Database connection refused"
**Cause:** Wrong DATABASE_URL or database down
**Fix:** Check DATABASE_URL in environment variables

---

## 📦 Complete Fixed Files

I can provide you with:
1. ✅ Complete fixed `server/index.ts`
2. ✅ Complete fixed `server/routes.ts`
3. ✅ Complete fixed `client/src/lib/linkedinAuth.ts`
4. ✅ Complete `.env.example`
5. ✅ Updated `package.json`

Would you like me to generate these complete files for you?

---

## 🎯 Priority Order

1. **HIGHEST:** CORS configuration (blocks everything)
2. **HIGH:** Session configuration (users can't stay logged in)
3. **HIGH:** Environment validation (prevents silent failures)
4. **MEDIUM:** LinkedIn redirect URI (breaks development)
5. **MEDIUM:** Auto-repost service fix (wastes API calls)
6. **LOW:** Health check endpoint (nice to have)
7. **LOW:** Better error messages (improves debugging)
8. **LOW:** Graceful shutdown (production best practice)

---

## Next Steps

1. Apply fixes in priority order
2. Test locally first
3. Deploy to production
4. Monitor logs for errors
5. Test all functionality
6. Share with users

Need help with any specific fix? Let me know!
