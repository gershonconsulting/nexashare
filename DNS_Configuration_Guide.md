# DNS Configuration Guide for NexaShare

## 🎯 Quick Answer: What to Change in DNS

### Current Setup (Replit)
```
nexashare.com TXT replit-verify=90363312-c433-4ade-968c-a4206be5143f
```

### Problem
❌ TXT record only verifies domain ownership - it doesn't route traffic
❌ No A or CNAME record to point to your server
❌ Users can't access nexashare.com

---

## Option 1: Stay on Replit (Quick Fix)

### Step 1: Get Your Replit URL
1. Go to your Repl
2. Copy the URL shown at top (e.g., `nexashare-app.yourusername.repl.co`)

### Step 2: Update DNS Records

**KEEP the TXT record:**
```
Type    Name    Value
TXT     @       replit-verify=90363312-c433-4ade-968c-a4206be5143f
```

**ADD these records:**
```
Type    Name    Value                                   TTL
CNAME   @       nexashare-app.yourusername.repl.co     3600
CNAME   www     nexashare.com                           3600
```

**Note:** Replace `nexashare-app.yourusername.repl.co` with YOUR actual Repl URL

### Step 3: Configure in Replit
1. Open your Repl
2. Click ⚙️ Settings
3. Go to "Domains" section
4. Click "Link custom domain"
5. Enter `nexashare.com`
6. Replit will verify using the TXT record
7. Wait 5-10 minutes

### Step 4: Update LinkedIn
1. Go to LinkedIn Developer Console
2. Update OAuth redirect to: `https://nexashare.com/auth/callback`

---

## Option 2: Move to Better Hosting (Recommended)

### Why Move?
- 🚀 Better performance
- 💰 Similar or lower cost
- 🔧 More control
- 📊 Better monitoring
- 🔒 More reliable

### Recommended: Railway.app

#### Step 1: Deploy to Railway
1. Sign up at [railway.app](https://railway.app)
2. Connect your GitHub repo
3. Railway auto-deploys
4. Add PostgreSQL database
5. Set environment variables

#### Step 2: Get Your Railway Domain
Railway gives you: `nexashare.up.railway.app` (or similar)

#### Step 3: Update DNS Records

**REMOVE:**
```
TXT replit-verify=90363312-c433-4ade-968c-a4206be5143f
```

**ADD:**
```
Type    Name    Value                        TTL
CNAME   @       nexashare.up.railway.app    3600
CNAME   www     nexashare.com                3600
```

**Note:** Some domain providers don't allow CNAME on apex (@)
- If you get an error, use "ALIAS" or "ANAME" instead
- Or ask Railway for A record IPs

#### Step 4: Configure Custom Domain in Railway
1. Go to your Railway project
2. Click "Settings" → "Domains"
3. Click "Add Custom Domain"
4. Enter `nexashare.com`
5. Railway will issue SSL certificate

#### Step 5: Update LinkedIn
OAuth redirect stays the same: `https://nexashare.com/auth/callback`

---

## DNS Record Types Explained

### CNAME (Canonical Name)
- **What it does:** Points your domain to another domain
- **Example:** `nexashare.com` → `nexashare.up.railway.app`
- **Pros:** Automatic updates if hosting IP changes
- **Cons:** Some providers don't allow on apex domain

### A Record (Address)
- **What it does:** Points your domain to an IP address
- **Example:** `nexashare.com` → `192.0.2.1`
- **Pros:** Works on any domain
- **Cons:** Manual update if IP changes

### TXT (Text)
- **What it does:** Stores text information
- **Example:** Verification codes, SPF records
- **Use case:** Replit uses it to verify you own the domain
- **Note:** Doesn't route traffic!

---

## Step-by-Step: Updating DNS (Any Provider)

### For GoDaddy:
1. Login to GoDaddy
2. Go to "My Products" → "Domains"
3. Click on `nexashare.com`
4. Scroll to "DNS" section
5. Click "Manage DNS"
6. Add/edit records as shown above
7. Save changes

### For Namecheap:
1. Login to Namecheap
2. Dashboard → Domain List
3. Click "Manage" next to `nexashare.com`
4. Go to "Advanced DNS" tab
5. Add/edit records
6. Save changes

### For Cloudflare:
1. Login to Cloudflare
2. Select `nexashare.com` domain
3. Go to "DNS" section
4. Add/edit records
5. Proxy status: 🟠 (DNS only) for CNAME to hosting

### For Google Domains:
1. Login to Google Domains
2. Select `nexashare.com`
3. Click "DNS" in left menu
4. Scroll to "Custom records"
5. Add/edit records
6. Save

---

## Verification Commands

### Check if DNS is propagated:
```bash
# Check A record
dig nexashare.com A

# Check CNAME record
dig nexashare.com CNAME

# From specific DNS server
dig @8.8.8.8 nexashare.com

# Check globally
https://dnschecker.org/#A/nexashare.com
```

### Expected Results:

**If pointing to Railway:**
```
nexashare.com. 3600 IN CNAME nexashare.up.railway.app.
```

**If pointing to Replit:**
```
nexashare.com. 3600 IN CNAME nexashare-app.yourusername.repl.co.
```

---

## Timeline

### DNS Propagation Time
- **Minimum:** 5 minutes
- **Typical:** 1-2 hours
- **Maximum:** 48 hours
- **Tip:** Use `dig` command to check if it's working

### What Happens During Propagation?
1. You update DNS records at registrar
2. Registrar updates their nameservers (minutes)
3. Other DNS servers cache old records (hours)
4. Gradually, all DNS servers get new records (up to 48h)

### Speed It Up
1. Lower TTL before changes (set to 300)
2. Wait 24 hours
3. Make changes
4. TTL will expire faster
5. Raise TTL back to 3600 after

---

## Common Issues

### Issue: "This site can't be reached"
**Cause:** DNS not propagated yet
**Solution:** Wait, or try `ipconfig /flushdns` (Windows) or `sudo dscacheutil -flushcache` (Mac)

### Issue: "Connection not secure"
**Cause:** SSL certificate not issued yet
**Solution:** 
- Railway/Render: Wait 5-10 minutes
- Replit: Check domain configuration in settings

### Issue: CNAME not allowed on apex domain
**Cause:** DNS provider restriction
**Solution:** 
1. Use ALIAS or ANAME record
2. Use A record with IP address
3. Change DNS provider to Cloudflare

### Issue: Changes not applying
**Cause:** DNS cache
**Solution:**
```bash
# Clear local DNS cache
# Windows:
ipconfig /flushdns

# Mac:
sudo dscacheutil -flushcache

# Linux:
sudo systemd-resolve --flush-caches
```

---

## Testing Checklist

After DNS changes:

1. **Test domain resolution:**
   ```bash
   ping nexashare.com
   ```

2. **Test HTTPS:**
   ```bash
   curl https://nexashare.com/health
   ```

3. **Test in browser:**
   - Visit `https://nexashare.com`
   - Check for 🔒 (secure)
   - No certificate errors

4. **Test www subdomain:**
   - Visit `https://www.nexashare.com`
   - Should redirect to `https://nexashare.com`

5. **Test LinkedIn OAuth:**
   - Click "Continue with LinkedIn"
   - Should redirect correctly
   - Should be able to log in

---

## Summary: Exact DNS Records

### If Staying on Replit:
```
Type    Name    Value                                   TTL     Priority
TXT     @       replit-verify=90363312...               3600    -
CNAME   @       your-repl.yourusername.repl.co         3600    -
CNAME   www     nexashare.com                           3600    -
```

### If Moving to Railway:
```
Type    Name    Value                        TTL     Priority
CNAME   @       nexashare.up.railway.app    3600    -
CNAME   www     nexashare.com                3600    -
```

### If Moving to Render:
```
Type    Name    Value                        TTL     Priority
CNAME   @       nexashare.onrender.com      3600    -
CNAME   www     nexashare.com                3600    -
```

---

## Quick Start (Replit)

1. Get Repl URL from dashboard
2. Update DNS CNAME record
3. Configure domain in Replit settings
4. Wait 10 minutes
5. Test at https://nexashare.com
6. Update LinkedIn OAuth redirect

**Total time:** 30 minutes + DNS propagation

---

## Quick Start (Railway)

1. Deploy code to Railway (5 min)
2. Add PostgreSQL (1 min)
3. Set environment variables (2 min)
4. Get Railway domain (automatic)
5. Update DNS records (2 min)
6. Add custom domain in Railway (1 min)
7. Wait for SSL cert (10 min)
8. Test at https://nexashare.com

**Total time:** 30 minutes + DNS propagation

---

## Need Help?

- **DNS not working after 24 hours:** Check with your domain registrar
- **SSL errors:** Check hosting platform SSL settings
- **LinkedIn OAuth errors:** Verify redirect URI matches exactly
- **Still stuck:** Check platform-specific documentation

---

## What's Next?

After DNS is configured:

1. ✅ Test site accessibility
2. ✅ Verify SSL certificate
3. ✅ Test LinkedIn login
4. ✅ Test repost functionality
5. ✅ Monitor logs for errors
6. ✅ Set up monitoring/alerts
7. ✅ Create backups
