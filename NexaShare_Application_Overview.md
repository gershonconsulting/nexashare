# NexaShare - Application Overview

> Historical design document. It does not describe the current secure MVP.
> The current release uses Cloudflare Worker + D1 + assets and a user-initiated
> Chrome extension that operates LinkedIn's visible UI. It does not request
> posting permission or call LinkedIn's posting API. See `DEPLOYMENT.md`.

## Executive Summary

NexaShare is a B2B influencer amplification platform designed to help companies increase their LinkedIn content reach through strategic reposting. The platform enables users to connect their LinkedIn accounts, monitor company pages, and share (repost) content from those company pages to their personal LinkedIn feeds.

## Core Functionality

### 1. **LinkedIn Content Reposting**
The primary feature allows users to:
- Connect their LinkedIn company page(s) to monitor
- Manually repost company content to their personal LinkedIn feed with optional commentary
- Enable automatic reposting for hands-free content sharing
- Track all reposts in a centralized history table

### 2. **Authentication & User Management**
- LinkedIn OAuth integration (OpenID Connect) for seamless login
- Secure session management with encrypted cookies
- Profile management (name, company, notifications)
- Referral system for user acquisition

### 3. **Dashboard Features**

#### **Re-Post Feature Section**
- Toggle to enable/disable auto-reposting
- Input field to save company LinkedIn page URL
- Quick repost interface:
  - Enter any LinkedIn post URL
  - Add optional comment
  - Instantly share to user's feed

#### **Re-Post History Table**
Displays all historical reposts with columns:
- Date
- Company Post Link (original post URL)
- User Feed Re-Post Link (user's shared post URL)
- Post Text (content preview)

### 4. **Additional Pages**
- **Campaigns**: Manage company pages and auto-repost settings
- **Influencers**: Search for influencers from followed companies
- **Analytics**: View performance metrics and engagement data
- **Content**: Manage and filter reposted content
- **Settings**: Profile editing, notifications, account management
- **Referrals**: Track referral program

## Technical Architecture

### Frontend Stack
- **Framework**: React 18 with TypeScript
- **Routing**: Wouter (lightweight router)
- **State Management**: 
  - TanStack React Query for server state
  - React Context for auth state
- **Styling**: Tailwind CSS + shadcn/ui components
- **Build Tool**: Vite
- **Form Handling**: React Hook Form + Zod validation

### Backend Stack
- **Runtime**: Node.js with Express.js
- **Language**: TypeScript (ESM modules)
- **Session**: express-session with MemoryStore
- **Password Security**: bcrypt hashing
- **API Pattern**: RESTful endpoints under `/api` prefix

### Database
- **ORM**: Drizzle ORM
- **Database**: Neon Serverless PostgreSQL
- **Tables**:
  - `users` - User accounts with LinkedIn integration
  - `companyPages` - LinkedIn company pages to monitor
  - `posts` - Tracked content from LinkedIn
  - `commentSuggestions` - AI-generated comments
  - `reposts` - Repost tracking with metrics
  - `analytics` - Aggregated analytics data
  - `referrals` - Referral program tracking

## LinkedIn Integration

### OAuth Flow
1. User clicks "Continue with LinkedIn"
2. Redirected to LinkedIn authorization (OpenID Connect)
3. User grants permissions (openid, profile, email, w_member_social)
4. Callback receives auth code
5. Server exchanges code for access token
6. Token stored in database with expiry date

### Required Scopes
- `openid` - Basic authentication
- `profile` - User profile data
- `email` - User email address
- `w_member_social` - Post to user's feed

### Reposting API
Uses LinkedIn UGC Post API (`/v2/ugcPosts`) to share content:
- Posts as the authenticated user
- Links to original company post
- Includes optional user commentary
- Supports article, image, and video posts

## Key Features & Workflows

### Manual Repost Workflow
1. User enters company LinkedIn page URL
2. User enables the feature via toggle
3. User pastes a post URL from that company
4. Adds optional comment
5. Clicks "Share to My Feed"
6. System posts to LinkedIn and records in history

### Auto-Repost System
When enabled:
- Background service runs every 5 minutes
- Monitors configured company pages for new posts
- Scrapes company page feeds (using cheerio)
- Automatically shares new posts to user's LinkedIn
- Respects configured frequency (daily, weekly, etc.)

### History Tracking
All reposts are stored with:
- Timestamp of repost
- Original company post link
- User's reposted version link
- Post content/text
- Engagement metrics (impressions, engagement rate)

## Environment Configuration

### Required Environment Variables
- `DATABASE_URL` - PostgreSQL connection string
- `LINKEDIN_CLIENT_SECRET` - LinkedIn OAuth secret
- `STRIPE_SECRET_KEY` - Stripe API key (for subscriptions)
- `VITE_STRIPE_PUBLIC_KEY` - Stripe public key
- `SESSION_SECRET` - Session encryption secret (optional)
- `VITE_LINKEDIN_CLIENT_ID` - LinkedIn OAuth client ID (optional, has hardcoded fallback)

### Production Settings
- Domain: nexashare.com
- LinkedIn Redirect URI: https://nexashare.com/auth/callback
- Client ID: 78dsjq2rbcv26t
- Secure cookies enabled
- Trust proxy configuration for reverse proxy

## Subscription & Monetization

### Tiers
- **Free Tier**: Basic features
- **Premium Tier**: Advanced features (Stripe integration ready)

### Payment Integration
- Stripe Elements for payment forms
- Subscription lifecycle management
- Webhook-ready architecture

## Current Status & Known Issues

### Working Features
✅ LinkedIn OAuth authentication (OpenID Connect)
✅ Manual reposting with comments
✅ Auto-repost background service
✅ Company page monitoring
✅ Repost history tracking
✅ Dashboard interface
✅ Profile management

### Requirements for Full Functionality
⚠️ LinkedIn app must have "Sign In with LinkedIn using OpenID Connect" product approved
⚠️ LinkedIn app must have appropriate scopes configured
⚠️ Database must be initialized with schema
⚠️ Environment variables must be set

### Known Limitations
- Web scraping may be blocked by LinkedIn (manual entry fallback available)
- Access tokens expire and require re-authentication
- Auto-repost service requires continuous server uptime

## Developer Notes

### File Structure
```
NexaSharecom/
├── client/                  # React frontend
│   └── src/
│       ├── components/      # UI components
│       ├── pages/          # Page components
│       ├── context/        # React context
│       └── lib/            # Utilities
├── server/                  # Express backend
│   ├── routes.ts           # API endpoints
│   ├── storage.ts          # Database layer
│   ├── autoRepostService.ts # Background service
│   └── linkedinScraper.ts  # Web scraper
├── shared/                  # Shared code
│   └── schema.ts           # Database schema
└── dist/                    # Production build
```

### Running the Application

**Development:**
```bash
npm run dev
```

**Production Build:**
```bash
npm run build
npm start
```

**Database Migrations:**
```bash
npm run db:push
```

## API Endpoints

### Authentication
- `POST /api/auth/login` - User login
- `POST /api/auth/logout` - User logout
- `GET /api/auth/callback` - LinkedIn OAuth callback
- `GET /api/user` - Get current user

### Company Pages
- `GET /api/company-pages` - List company pages
- `POST /api/company-pages` - Add company page
- `PUT /api/company-pages/:id` - Update company page
- `DELETE /api/company-pages/:id` - Remove company page

### Posts & Reposts
- `GET /api/posts` - List posts
- `POST /api/posts` - Create post
- `GET /api/reposts` - List reposts
- `POST /api/reposts` - Create repost manually

### LinkedIn Integration
- `POST /api/linkedin/share` - Share post to LinkedIn
- Uses LinkedIn UGC Post API
- Requires valid access token

### User Management
- `PUT /api/user/profile` - Update user profile
- `GET /api/analytics` - Get user analytics
- `GET /api/referrals` - Get referral data

## Security Considerations

1. **Session Security**
   - HTTPOnly cookies
   - Secure flag in production
   - SameSite=none for cross-domain
   - Trust proxy enabled

2. **Password Security**
   - bcrypt hashing (default rounds)
   - No plaintext storage

3. **API Security**
   - Session-based authentication
   - All sensitive endpoints protected
   - Input validation with Zod

4. **LinkedIn OAuth**
   - State parameter validation
   - Code verifier checks
   - Token expiry tracking

## Future Enhancement Opportunities

1. **AI Features**
   - Comment suggestion generation (schema exists)
   - Content optimization recommendations
   - Engagement prediction

2. **Analytics**
   - Detailed performance metrics
   - Influencer network analysis
   - ROI tracking

3. **Content Management**
   - Post scheduling
   - Content calendar
   - Bulk operations

4. **Collaboration**
   - Team accounts
   - Role-based permissions
   - Approval workflows

## Conclusion

NexaShare provides a streamlined solution for B2B companies looking to amplify their LinkedIn content reach through employee advocacy and influencer partnerships. The platform combines automated monitoring, easy reposting, and comprehensive tracking to maximize content visibility and engagement.

The application is production-ready with proper authentication, database management, and API integration. The modular architecture allows for easy extension and enhancement as the platform grows.
