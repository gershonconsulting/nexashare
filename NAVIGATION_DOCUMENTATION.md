# NexaShare - Complete Navigation System

## 🎯 **LinkedIn-Only Authentication**

**CRITICAL:** NexaShare uses **LinkedIn Connect exclusively** for authentication.

### **How It Works:**
```
1. User clicks "Continue with LinkedIn"
2. OAuth flow redirects to LinkedIn
3. User authorizes NexaShare
4. LinkedIn returns user data
5. User logged in! ✅

NO traditional email/password login!
```

### **Chrome Extension for Full Access:**
```
After OAuth:
1. User installs Chrome extension
2. Extension captures LinkedIn cookies
3. Full API access enabled
4. Can scrape & post without limits
```

---

## 📱 **Left Sidebar Navigation**

### **Structure:**

```
┌─────────────────────────┐
│  🚀 NexaShare           │
│                         │
│  👤 User Profile         │
│     John Doe            │
│     Pro Plan            │
├─────────────────────────┤
│  📊 Dashboard           │
│  ⚙️  Settings            │
│  👥 Refer Friends  💰   │
│  💳 Billing             │
│  📈 Reports             │
├─────────────────────────┤
│  🚪 Logout              │
└─────────────────────────┘
```

---

## 📄 **Pages Overview**

### **1. Dashboard** (`/dashboard`)
**Main control center**

Features:
- ✅ Overview of all companies
- ✅ Quick repost actions
- ✅ Recent activity
- ✅ Company statistics
- ✅ AI features access
- ✅ Auto-repost status

Components:
- Company list with status
- Add new company button
- Recent reposts feed
- Quick stats cards

---

### **2. Settings** (`/settings`)
**Account preferences & configuration**

Sections:

**Profile:**
- Avatar (from LinkedIn)
- Full name
- Email
- Company
- LinkedIn connection status

**Notifications:**
- Email notifications (toggle)
- New post alerts (toggle)
- Weekly digest (toggle)
- Repost confirmations (toggle)

**Privacy:**
- Show profile publicly (toggle)
- Analytics data collection (toggle)

**LinkedIn Connection:**
- Status: Connected ✅
- Disconnect button
- Last synced

**Danger Zone:**
- Delete account (requires confirmation)

---

### **3. Refer Friends** (`/refer`)
**Affiliate program management**

**IMPORTANT:** Managed by third-party affiliate platform (e.g., Rewardful, FirstPromoter)

Features:

**Stats Dashboard:**
- Total referrals
- Active subscriptions
- Total earnings
- Pending payout

**Referral Tools:**
- Unique referral link
- Referral code
- Social share buttons
  - Email
  - LinkedIn
  - Twitter
  - Copy link

**Commission Structure:**
- 30% recurring commission
- Pro plan: $5.70/month per referral
- Elite plan: $14.70/month per referral
- Paid monthly via PayPal

**How It Works:**
1. Share your link
2. Friend signs up using link
3. Friend subscribes to Pro/Elite
4. You earn 30% recurring
5. Get paid monthly!

**Calculator:**
- 5 referrals = $28.50/month
- 10 referrals = $57/month
- 25 referrals = $142.50/month
- 50+ referrals = $350+/month

---

### **4. Billing** (`/billing`)
**Subscription & payment management**

Sections:

**Current Plan:**
- Plan name (Starter/Pro/Elite)
- Plan status (Active/Canceled/Past Due)
- Features included
- Next billing date
- Cancel/Reactivate options

**Usage & Limits:**
- Company pages: 0/10
- AI generations: 0/100
- Reposts this month: 0/500
- Progress bars for each

**Actions:**
- Manage Billing (opens Stripe portal)
- Change Plan (to pricing page)
- Cancel Subscription
- Reactivate Subscription

**Compare Plans:**
- Table showing all plans
- Feature comparison
- Link to full pricing page

---

### **5. Reports** (`/reports`)
**Analytics & performance tracking**

Features:

**Summary Stats:**
- Total reposts
- Total views
- Total engagement
- Average engagement rate

**Performance Chart:**
- Engagement over time
- Views per day
- Best performing days
- Trend analysis

**Top Performers:**
- Top performing company
- Top performing post
- Best engagement times
- Most successful content type

**Recent Activity:**
- Latest reposts
- Engagement metrics
- Time posted
- Company source

**Export Options:**
- Export to CSV
- Export to PDF
- Custom date ranges
- Filtered reports

---

### **6. Logout**
**Sign out action**

**What happens:**
```
1. User clicks Logout
2. Confirms action
3. Session destroyed
4. Cookies cleared
5. Redirects to homepage
6. Must log in with LinkedIn again
```

---

## 🎨 **Sidebar Features**

### **Desktop View:**
- Full sidebar (64rem width)
- Gradient background (purple to blue)
- Fixed position
- User profile at top
- Plan badge
- Navigation items with icons
- Logout at bottom
- Responsive design

### **Mobile View:**
- Hamburger menu button
- Full-screen overlay menu
- Same navigation items
- Slide-in animation
- Close button
- Touch-friendly

### **Active States:**
- Highlighted background
- White text
- Icon color change
- Smooth transitions

---

## 🔐 **Authentication Flow**

### **Login Process:**
```
1. User visits nexashare.com
2. Sees landing page
3. Clicks "Continue with LinkedIn"
4. Redirected to LinkedIn OAuth
5. Authorizes NexaShare
6. Returns to app
7. Session created
8. Redirected to /dashboard
9. Sees sidebar navigation
10. Can access all pages
```

### **Chrome Extension Flow:**
```
1. User logged in via LinkedIn OAuth
2. Installs Chrome extension
3. Extension detects LinkedIn login
4. Captures session cookies
5. Sends to NexaShare backend
6. Encrypted and stored
7. Full functionality unlocked
8. Can scrape & post automatically
```

### **Logout Process:**
```
1. Click Logout in sidebar
2. POST /api/auth/logout
3. Session destroyed
4. Cookies cleared
5. Redirect to homepage
6. Must log in again
```

---

## 📊 **User Session Management**

### **Session Data:**
```typescript
{
  userId: 123,
  linkedinId: "abc123",
  fullName: "John Doe",
  email: "john@example.com",
  profilePicture: "https://...",
  subscriptionTier: "pro",
  subscriptionStatus: "active",
  referralCode: "HEX123456",
  referralCount: 5
}
```

### **Session Persistence:**
- 7-day cookie lifetime
- Secure, httpOnly
- SameSite=Lax
- Auto-renew on activity

---

## 🎯 **Navigation Rules**

### **Public Pages (No Auth Required):**
- `/` - Homepage
- `/pricing` - Pricing page
- `/about` - About page
- `/help` - Help center

### **Protected Pages (Auth Required):**
- `/dashboard` - Main dashboard
- `/settings` - User settings
- `/refer` - Referral program
- `/billing` - Subscription management
- `/reports` - Analytics & reports

### **Redirect Logic:**
```typescript
// If not authenticated, redirect to login
if (!user && protectedRoute) {
  redirect('/');
}

// If authenticated, redirect to dashboard
if (user && publicRoute === '/') {
  redirect('/dashboard');
}
```

---

## 🔧 **Implementation Details**

### **Files Created:**

**Layout:**
- `client/src/components/AppLayout.tsx` - Main layout with sidebar

**Pages:**
- `client/src/pages/Dashboard.tsx` - Main dashboard (existing)
- `client/src/pages/Settings.tsx` - Settings page
- `client/src/pages/Refer.tsx` - Referral program
- `client/src/pages/Billing.tsx` - Billing management
- `client/src/pages/Reports.tsx` - Analytics & reports

**Hooks:**
- `client/src/hooks/use-user.ts` - User state management

### **Routes Setup:**
```typescript
// In App.tsx or Routes.tsx
<Route path="/" component={HomePage} />
<Route path="/pricing" component={PricingPage} />
<Route path="/dashboard" component={DashboardPage} />
<Route path="/settings" component={SettingsPage} />
<Route path="/refer" component={ReferPage} />
<Route path="/billing" component={BillingPage} />
<Route path="/reports" component={ReportsPage} />
```

### **Protected Route Wrapper:**
```typescript
function ProtectedRoute({ component: Component }) {
  const { user, loading } = useUser();
  
  if (loading) return <LoadingSpinner />;
  if (!user) return <Redirect to="/" />;
  
  return (
    <AppLayout>
      <Component />
    </AppLayout>
  );
}
```

---

## 🎨 **Design System**

### **Colors:**
```
Primary: Purple (#7C3AED)
Secondary: Blue (#3B82F6)
Success: Green (#10B981)
Danger: Red (#EF4444)
Warning: Yellow (#F59E0B)
```

### **Gradient:**
```css
background: linear-gradient(to bottom, #7C3AED, #3B82F6);
```

### **Typography:**
```
Headings: Font-bold, text-2xl to text-4xl
Body: Font-normal, text-base
Small: text-sm, text-gray-600
```

---

## 💡 **Key Features**

### **Sidebar:**
- ✅ Responsive (desktop + mobile)
- ✅ Active state highlighting
- ✅ User profile display
- ✅ Plan badge
- ✅ Badge notifications (referral count)
- ✅ Smooth animations

### **Navigation:**
- ✅ 6 main pages
- ✅ Icon-based menu items
- ✅ Logout action
- ✅ Protected routes
- ✅ Redirect logic

### **Authentication:**
- ✅ LinkedIn OAuth only
- ✅ No email/password
- ✅ Chrome extension for cookies
- ✅ Session management
- ✅ Auto-logout on inactivity

---

## 🚀 **Quick Start**

### **For Users:**
```
1. Go to nexashare.com
2. Click "Continue with LinkedIn"
3. Authorize app
4. Redirected to dashboard
5. Install Chrome extension (optional)
6. Start using NexaShare!
```

### **For Developers:**
```
1. Clone repo
2. npm install
3. Configure environment variables
4. Set up LinkedIn OAuth
5. npm run dev
6. Test navigation
```

---

## 📝 **Environment Variables**

```bash
# LinkedIn OAuth
LINKEDIN_CLIENT_ID=your_client_id
LINKEDIN_CLIENT_SECRET=your_secret
VITE_REDIRECT_URI=http://localhost:5000/auth/callback

# Session
SESSION_SECRET=random_32_char_string

# Database
DATABASE_URL=postgresql://...

# Stripe
STRIPE_SECRET_KEY=sk_...
VITE_STRIPE_PUBLIC_KEY=pk_...

# AI
ANTHROPIC_API_KEY=sk-ant-...

# Domain
DOMAIN=https://nexashare.com
```

---

## 🎉 **Summary**

**Navigation Structure:**
- ✅ 6 pages (Dashboard, Settings, Refer, Billing, Reports, Logout)
- ✅ Left sidebar (desktop + mobile)
- ✅ LinkedIn OAuth only
- ✅ Protected routes
- ✅ Beautiful design

**User Flow:**
```
Login (LinkedIn) → Dashboard → Use Features → Logout
```

**Perfect for:**
- Single sign-on (LinkedIn)
- Professional users
- B2B SaaS
- Subscription business
- Referral program

**Ready to deploy!** 🚀
