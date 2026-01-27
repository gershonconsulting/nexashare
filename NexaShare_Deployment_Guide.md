# NexaShare Deployment Guide

## 🚀 Deployment Overview

This guide will help you deploy NexaShare from Replit to a production environment and configure DNS properly.

---

## Part 1: Fixing Current Issues

### Critical Issues Found in Current Code

1. **❌ Missing CORS Configuration** - Prevents frontend from communicating with API
2. **❌ Hardcoded Production URLs** - Breaks in development
3. **❌ No Environment Validation** - Server starts even with missing config
4. **❌ Auto-repost runs in dev** - Wastes LinkedIn API calls
5. **❌ Poor error handling** - Hard to debug issues
6. **❌ Session configuration issues** - Users getting logged out

### Fixed Version Improvements

✅ Proper CORS setup with credentials
✅ Environment-aware configuration
✅ Comprehensive error handling
✅ Health check endpoint
✅ Graceful shutdown handling
✅ Better logging and debugging
✅ Production-ready session management

---

## Part 2: Moving Away from Replit

### Why Move from Replit?

- **Limited control** over server configuration
- **Performance issues** with complex apps
- **Domain management** can be tricky
- **Better alternatives** exist for production

### Recommended Hosting Options

#### Option 1: **Railway.app** (Recommended)
**Pros:**
- Easy deployment from GitHub
- Free tier available
- Automatic HTTPS
- Custom domains included
- PostgreSQL database included
- Good performance

**Pricing:** $5/month for hobby plan

#### Option 2: **Render.com**
**Pros:**
- Free tier available
- PostgreSQL included
- Auto-deploy from GitHub
- Built-in SSL

**Pricing:** Free tier, $7/month for production

#### Option 3: **DigitalOcean App Platform**
**Pros:**
- Good performance
- Reliable infrastructure
- PostgreSQL included
- Custom domains

**Pricing:** $5-12/month

#### Option 4: **Fly.io**
**Pros:**
- Global edge deployment
- Free PostgreSQL
- Excellent performance
- Good pricing

**Pricing:** Pay-as-you-go, typically $5-10/month

---

## Part 3: DNS Configuration

### Current Replit Setup Issues

Your current DNS:
```
nexashare.com TXT replit-verify=90363312-c433-4ade-968c-a4206be5143f
```

**Problems:**
- TXT record doesn't route traffic
- Missing A or CNAME record
- No www subdomain configuration

### Correct DNS Setup for New Hosting

#### For Railway, Render, Fly.io (CNAME Method)

**DNS Records to Add:**

```dns
Type    Name              Value                          TTL
----    ----              -----                          ---
CNAME   nexashare.com     your-app.railway.app          3600
CNAME   www              nexashare.com                   3600
```

**Or using A Record (if provider gives IP):**

```dns
Type    Name              Value                          TTL
----    ----              -----                          ---
A       @                 xxx.xxx.xxx.xxx                3600
CNAME   www              nexashare.com                   3600
```

#### Important Notes

1. **Remove Replit TXT record** - It's no longer needed
2. **Add both apex and www** - Users might type either
3. **Wait for propagation** - DNS changes take 1-48 hours
4. **Update LinkedIn redirect** - Change to new domain if needed

---

## Part 4: Step-by-Step Deployment (Railway Example)

### Prerequisites

1. GitHub account
2. Railway account (sign up at railway.app)
3. Your NexaShare code in GitHub repository
4. LinkedIn Developer Console access
5. Domain registrar access (for DNS)

### Step 1: Prepare GitHub Repository

```bash
# Clone your fixed NexaShare code
git clone <your-repo-url>
cd nexashare

# Create .env file (don't commit this!)
cp .env.example .env

# Edit .env with your values
nano .env

# Add to .gitignore
echo ".env" >> .gitignore
echo "node_modules" >> .gitignore
echo "dist" >> .gitignore

# Commit and push
git add .
git commit -m "Prepare for Railway deployment"
git push origin main
```

### Step 2: Deploy to Railway

1. Go to [railway.app](https://railway.app)
2. Click "New Project"
3. Select "Deploy from GitHub repo"
4. Choose your NexaShare repository
5. Railway will auto-detect Node.js

### Step 3: Add PostgreSQL Database

1. In Railway project, click "New"
2. Select "Database" → "PostgreSQL"
3. Railway will create database and set `DATABASE_URL`
4. Run migrations:
   ```bash
   railway run npm run db:push
   ```

### Step 4: Configure Environment Variables

In Railway dashboard, add these variables:

```
DATABASE_URL=<automatically set by Railway>
LINKEDIN_CLIENT_ID=78dsjq2rbcv26t
LINKEDIN_CLIENT_SECRET=your_secret_here
SESSION_SECRET=<generate 32+ character random string>
STRIPE_SECRET_KEY=sk_test_...
VITE_STRIPE_PUBLIC_KEY=pk_test_...
NODE_ENV=production
PORT=5000
DOMAIN=nexashare.com
```

**Generate Session Secret:**
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### Step 5: Configure Custom Domain

1. In Railway project → "Settings" → "Domains"
2. Click "Add Custom Domain"
3. Enter `nexashare.com`
4. Railway will show you CNAME target (e.g., `nexashare.up.railway.app`)

### Step 6: Update DNS Records

In your domain registrar (GoDaddy, Namecheap, etc.):

**Remove:**
```
TXT replit-verify=90363312-c433-4ade-968c-a4206be5143f
```

**Add:**
```
Type    Name    Value                           TTL
CNAME   @       nexashare.up.railway.app        3600
CNAME   www     nexashare.com                    3600
```

**Note:** Some registrars don't allow CNAME on apex (@). If that's the case:
1. Use their "ANAME" or "ALIAS" feature (if available)
2. Or use an A record pointing to Railway's IP (check Railway docs)

### Step 7: Update LinkedIn OAuth Settings

1. Go to [LinkedIn Developers](https://developer.linkedin.com)
2. Select your app
3. Go to "Auth" tab
4. Update "Redirect URLs":
   ```
   https://nexashare.com/auth/callback
   ```
5. Save changes

### Step 8: Test Deployment

1. Wait for DNS propagation (check with `dig nexashare.com`)
2. Visit `https://nexashare.com`
3. Test login with LinkedIn
4. Test repost functionality
5. Check Railway logs for errors

---

## Part 5: Alternative Quick Deploy (Keeping Replit)

If you want to keep using Replit temporarily:

### Fix DNS on Replit

1. **Get your Replit app URL:**
   - Go to your Repl
   - Look for the URL (e.g., `your-repl.yourusername.repl.co`)

2. **Update DNS Records:**

**For Custom Domain on Replit:**

```dns
Type    Name    Value                                TTL
CNAME   @       your-repl.yourusername.repl.co      3600
CNAME   www     nexashare.com                        3600
```

**Keep the TXT record:**
```dns
TXT     @       replit-verify=90363312-c433-4ade-968c-a4206be5143f
```

3. **Configure in Replit:**
   - Go to your Repl
   - Click the ⚙️ icon (Settings)
   - Scroll to "Domains"
   - Add `nexashare.com`
   - Replit will verify via TXT record

4. **Update environment variables in Replit:**
   - Go to "Secrets" (lock icon 🔒)
   - Add/update all required variables
   - Restart your Repl

---

## Part 6: Post-Deployment Checklist

### Verify Everything Works

- [ ] Site loads at https://nexashare.com
- [ ] LinkedIn login works
- [ ] Company page can be added
- [ ] Manual repost works
- [ ] Auto-repost service is running (check logs)
- [ ] History table shows reposts
- [ ] HTTPS is enabled (🔒 in browser)
- [ ] No CORS errors in browser console
- [ ] Sessions persist (don't get logged out)

### Monitor and Maintain

1. **Set up monitoring:**
   - Railway/Render have built-in monitoring
   - Check logs regularly
   - Set up alerts for errors

2. **Database backups:**
   - Railway/Render do automatic backups
   - Download manual backup periodically

3. **Update regularly:**
   ```bash
   git pull origin main
   npm install
   npm run build
   ```

---

## Part 7: Troubleshooting

### Issue: DNS not resolving

**Check:**
```bash
dig nexashare.com
nslookup nexashare.com
```

**Solution:** Wait up to 48 hours for DNS propagation

### Issue: LinkedIn OAuth fails

**Check:**
- Redirect URI exactly matches: `https://nexashare.com/auth/callback`
- OpenID Connect product is approved
- Environment variables are set correctly

### Issue: CORS errors

**Check:**
- Server has CORS enabled (fixed version does)
- Credentials are being sent
- Domain matches in CORS config

### Issue: Sessions not persisting

**Check:**
- `SESSION_SECRET` is set
- Cookies are enabled in browser
- `trust proxy` is set (fixed version does)

### Issue: Auto-repost not working

**Check logs:**
```bash
railway logs   # or your platform's log command
```

Look for:
- `[AutoRepost] Starting auto-repost service...`
- LinkedIn API errors
- Token expiry issues

---

## Part 8: Cost Breakdown

### Replit (Current)
- Free tier: Very limited
- Hacker plan: $7/month
- Issues: Performance, reliability

### Railway (Recommended)
- Hobby: $5/month
- Includes: 512 MB RAM, PostgreSQL, SSL
- Overage: $0.000463/GB-hour
- Expected monthly: $5-10

### Total Monthly Cost
- Hosting: $5-10
- Domain: $10-15/year
- LinkedIn: Free (for OAuth)
- **Total: ~$6-11/month**

---

## Part 9: Quick Start Commands

### Deploy to Railway
```bash
# Install Railway CLI
npm i -g @railway/cli

# Login
railway login

# Link to project
railway link

# Deploy
railway up

# View logs
railway logs

# Set environment variable
railway variables set SESSION_SECRET=your_secret_here
```

### Deploy to Render
```bash
# Connect GitHub repo
# Render will auto-deploy on push

# Manual deploy
git push origin main

# View logs
render logs
```

---

## Support and Next Steps

### If You Need Help

1. Check Railway/Render documentation
2. Review application logs
3. Test with Railway's domain first before custom domain
4. Verify LinkedIn app settings

### After Successful Deploy

1. ✅ Update LinkedIn OAuth redirect URLs
2. ✅ Test all functionality
3. ✅ Set up monitoring
4. ✅ Create database backup
5. ✅ Document any custom configuration
6. ✅ Share app with test users

---

## Summary

**What to change in DNS:**

1. **Remove:** Replit TXT verification record (if moving away from Replit)
2. **Add:** CNAME record pointing to your new hosting platform
3. **Add:** CNAME for www subdomain
4. **Wait:** 1-48 hours for DNS propagation
5. **Update:** LinkedIn OAuth redirect URL to new domain

**Recommended Action:**
Deploy to Railway.app for reliable, production-ready hosting at $5/month with included PostgreSQL and automatic SSL.

---

## Need the Fixed Code?

I've created an improved version with all issues fixed. Let me know if you want me to:
1. Package it as a downloadable zip
2. Create specific deployment files for your chosen platform
3. Help with the actual deployment process
4. Set up monitoring and alerts

Good luck with your deployment! 🚀
