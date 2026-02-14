import express, { Request, Response } from "express";
import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { 
  insertUserSchema, 
  insertCompanyPageSchema, 
  updateCompanyPageSchema,
  insertPostSchema,
  insertCommentSuggestionSchema,
  insertRepostSchema,
  insertAnalyticsSchema,
  insertReferralSchema
} from "@shared/schema";
import session from "express-session";
import MemoryStore from "memorystore";
import { z } from "zod";
import Stripe from "stripe";
import companyRoutes from "./companyRoutes";
import linkedinCookieRoutes from "./linkedinCookieRoutes";
import aiRoutes from "./aiRoutes";

declare module "express-session" {
  interface SessionData {
    userId: number;
  }
}

function getStripe(): Stripe {
  if (!process.env.STRIPE_SECRET_KEY) {
    throw new Error('Missing required environment variable: STRIPE_SECRET_KEY');
  }
  return new Stripe(process.env.STRIPE_SECRET_KEY);
}

export async function registerRoutes(app: Express): Promise<Server> {
  
  // Create memory store for sessions
  const MemoryStoreSession = MemoryStore(session);
  
  // Trust proxy for secure cookies behind reverse proxy
  app.set('trust proxy', 1);
  
  // Set up session
  app.use(
    session({
      secret: process.env.SESSION_SECRET || "nexashare-secret",
      resave: false,
      saveUninitialized: false,
      store: new MemoryStoreSession({
        checkPeriod: 86400000, // prune expired entries every 24h
      }),
      cookie: {
        maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
        secure: process.env.NODE_ENV === "production",
        sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
        httpOnly: true,
      },
      proxy: true,
    })
  );

  // Middleware to check if user is authenticated
  const isAuthenticated = (req: Request, res: Response, next: () => void) => {
    if (req.session.userId) {
      next();
    } else {
      res.status(401).json({ message: "Unauthorized" });
    }
  };

  // Authentication routes
  app.post("/api/auth/login", async (req, res) => {
    try {
      const { username, password } = req.body;
      
      if (!username || !password) {
        return res.status(400).json({ message: "Username and password are required" });
      }
      
      // Try to find user by username first, then by email
      let user = await storage.getUserByUsername(username);
      if (!user) {
        user = await storage.getUserByEmail(username);
      }
      
      if (!user) {
        return res.status(401).json({ message: "Invalid credentials" });
      }
      
      if (user.linkedinId && !user.password) {
        return res.status(401).json({ message: "This account uses LinkedIn sign-in. Please use 'Continue with LinkedIn' to log in." });
      }
      
      const isValidPassword = await storage.verifyPassword(password, user.password);
      if (!isValidPassword) {
        return res.status(401).json({ message: "Invalid credentials" });
      }
      
      // Update last login time
      await storage.updateUser(user.id, { lastLoginAt: new Date() });
      
      // Set user in session
      req.session.userId = user.id;
      
      // Return user info without password
      const { password: _, ...userWithoutPassword } = user;
      return res.status(200).json(userWithoutPassword);
    } catch (error) {
      console.error("Login error:", error);
      return res.status(500).json({ message: "Server error" });
    }
  });

  app.post("/api/auth/linkedin-callback", async (req, res) => {
    try {
      const { code, redirectUri } = req.body;
      
      if (!code) {
        return res.status(400).json({ message: "LinkedIn authorization code is required" });
      }
      
      console.log("Received LinkedIn auth code:", code);
      
      // Use LINKEDIN_CLIENT_ID for server-side, fallback to VITE_ version
      const clientId = process.env.LINKEDIN_CLIENT_ID || process.env.VITE_LINKEDIN_CLIENT_ID || "78dsjq2rbcv26t";
      const clientSecret = process.env.LINKEDIN_CLIENT_SECRET;
      
      if (!clientSecret) {
        console.error("LinkedIn client secret not configured");
        return res.status(500).json({ message: "LinkedIn authentication is not configured" });
      }
      
      console.log("LinkedIn token exchange - clientId:", clientId, "redirectUri:", redirectUri);
      
      // Exchange authorization code for access token
      const tokenResponse = await fetch("https://www.linkedin.com/oauth/v2/accessToken", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          code,
          redirect_uri: redirectUri,
          client_id: clientId,
          client_secret: clientSecret,
        }),
      });
      
      if (!tokenResponse.ok) {
        const errorText = await tokenResponse.text();
        console.error("LinkedIn token error:", errorText);
        console.error("Token request details - redirect_uri:", redirectUri, "client_id:", clientId);
        return res.status(401).json({ message: `Failed to authenticate with LinkedIn`, details: errorText });
      }
      
      const tokenData = await tokenResponse.json();
      const accessToken = tokenData.access_token;
      const expiresIn = tokenData.expires_in || 5184000; // Default 60 days
      const tokenExpiry = new Date(Date.now() + expiresIn * 1000);
      console.log("LinkedIn access token obtained successfully, expires:", tokenExpiry);
      
      // Fetch user profile using OpenID Connect userinfo endpoint
      // Requires "Sign In with LinkedIn using OpenID Connect" product in LinkedIn Developer Console
      const profileResponse = await fetch("https://api.linkedin.com/v2/userinfo", {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });
      
      if (!profileResponse.ok) {
        const profileError = await profileResponse.text();
        console.error("LinkedIn userinfo error:", profileError);
        return res.status(401).json({ 
          message: "Failed to fetch LinkedIn profile. Make sure 'Sign In with LinkedIn using OpenID Connect' product is approved in your LinkedIn Developer Console.", 
          details: profileError 
        });
      }
      
      const profileData = await profileResponse.json();
      console.log("LinkedIn userinfo data:", JSON.stringify(profileData));
      
      // Validate required fields from OpenID Connect response
      if (!profileData.sub) {
        console.error("LinkedIn profile missing 'sub' field:", profileData);
        return res.status(401).json({ message: "LinkedIn profile is incomplete. Please try again." });
      }
      
      if (!profileData.email) {
        console.error("LinkedIn profile missing 'email' field:", profileData);
        return res.status(401).json({ message: "Unable to retrieve email from LinkedIn. Please ensure your LinkedIn account has a verified email address." });
      }
      
      const linkedinUserInfo = {
        id: profileData.sub,
        email: profileData.email,
        firstName: profileData.given_name || "User",
        lastName: profileData.family_name || "",
        picture: profileData.picture || null
      };
      
      console.log("LinkedIn user info:", linkedinUserInfo.email, linkedinUserInfo.id);
      
      // Check if user exists
      let user = await storage.getUserByLinkedinId(linkedinUserInfo.id);
      
      if (!user) {
        // Check if user exists by email
        user = await storage.getUserByUsername(linkedinUserInfo.email);
        
        if (user) {
          // Link existing account to LinkedIn and store access token
          await storage.updateUser(user.id, { 
            linkedinId: linkedinUserInfo.id,
            linkedinAccessToken: accessToken,
            linkedinTokenExpiry: tokenExpiry
          });
        } else {
          // Create new OAuth user with null password
          console.log("Creating new user with LinkedIn data");
          user = await storage.createUser({
            username: linkedinUserInfo.email,
            password: null,
            email: linkedinUserInfo.email,
            fullName: `${linkedinUserInfo.firstName} ${linkedinUserInfo.lastName}`.trim(),
            linkedinId: linkedinUserInfo.id,
            linkedinAccessToken: accessToken,
            linkedinTokenExpiry: tokenExpiry,
            profilePicture: linkedinUserInfo.picture,
            role: "company_user"
          });
        }
      } else {
        console.log("Found existing user:", user.id);
        // Update access token for existing user
        await storage.updateUser(user.id, { 
          linkedinAccessToken: accessToken,
          linkedinTokenExpiry: tokenExpiry
        });
      }
      
      // Update last login time
      await storage.updateUser(user.id, { lastLoginAt: new Date() });
      
      // Set user in session
      req.session.userId = user.id;
      
      // Return user info without password
      const { password: _, ...userWithoutPassword } = user;
      return res.status(200).json(userWithoutPassword);
    } catch (error) {
      console.error("LinkedIn auth error:", error);
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      return res.status(500).json({ message: "LinkedIn authentication failed. Please try again.", details: errorMessage });
    }
  });
  
  app.post("/api/auth/logout", (req, res) => {
    req.session.destroy(() => {
      res.status(200).json({ message: "Logged out successfully" });
    });
  });
  
  app.get("/api/auth/me", async (req, res) => {
    try {
      if (!req.session.userId) {
        return res.status(401).json({ message: "Not authenticated" });
      }
      
      const user = await storage.getUser(req.session.userId);
      
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      
      // Return user info without password
      const { password: _, ...userWithoutPassword } = user;
      return res.status(200).json(userWithoutPassword);
    } catch (error) {
      console.error("Get current user error:", error);
      return res.status(500).json({ message: "Server error" });
    }
  });
  
  // Update user profile
  app.put("/api/user/profile", isAuthenticated, async (req, res) => {
    try {
      const userId = req.session.userId as number;
      const { fullName, company } = req.body;
      
      const updatedUser = await storage.updateUser(userId, { fullName, company });
      
      if (!updatedUser) {
        return res.status(404).json({ message: "User not found" });
      }
      
      const { password: _, ...userWithoutPassword } = updatedUser;
      return res.status(200).json(userWithoutPassword);
    } catch (error) {
      console.error("Update user profile error:", error);
      return res.status(500).json({ message: "Server error" });
    }
  });
  
  // Company Pages routes
  app.get("/api/company-pages", isAuthenticated, async (req, res) => {
    try {
      const userId = req.session.userId as number;
      const pages = await storage.getCompanyPages(userId);
      return res.status(200).json(pages);
    } catch (error) {
      console.error("Get company pages error:", error);
      return res.status(500).json({ message: "Server error" });
    }
  });
  
  app.post("/api/company-pages", isAuthenticated, async (req, res) => {
    try {
      const userId = req.session.userId as number;
      const validatedData = insertCompanyPageSchema.parse({
        ...req.body,
        userId
      });
      
      const companyPage = await storage.createCompanyPage(validatedData);
      return res.status(201).json(companyPage);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Validation error", errors: error.errors });
      }
      console.error("Create company page error:", error);
      return res.status(500).json({ message: "Server error" });
    }
  });
  
  app.put("/api/company-pages/:id", isAuthenticated, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const userId = req.session.userId as number;
      
      // Check if page exists and belongs to user
      const page = await storage.getCompanyPage(id);
      if (!page) {
        return res.status(404).json({ message: "Company page not found" });
      }
      if (page.userId !== userId) {
        return res.status(403).json({ message: "Forbidden" });
      }
      
      // Validate update data with partial schema
      const validatedData = updateCompanyPageSchema.parse(req.body);
      
      const updatedPage = await storage.updateCompanyPage(id, validatedData);
      return res.status(200).json(updatedPage);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Validation error", errors: error.errors });
      }
      console.error("Update company page error:", error);
      return res.status(500).json({ message: "Server error" });
    }
  });
  
  app.delete("/api/company-pages/:id", isAuthenticated, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const userId = req.session.userId as number;
      
      // Check if page exists and belongs to user
      const page = await storage.getCompanyPage(id);
      if (!page) {
        return res.status(404).json({ message: "Company page not found" });
      }
      if (page.userId !== userId) {
        return res.status(403).json({ message: "Forbidden" });
      }
      
      await storage.deleteCompanyPage(id);
      return res.status(200).json({ message: "Company page deleted" });
    } catch (error) {
      console.error("Delete company page error:", error);
      return res.status(500).json({ message: "Server error" });
    }
  });
  
  // Posts routes
  app.get("/api/posts", isAuthenticated, async (req, res) => {
    try {
      const { companyPageId } = req.query;
      
      if (!companyPageId) {
        const recentPosts = await storage.getRecentPosts(10);
        return res.status(200).json(recentPosts);
      }
      
      const posts = await storage.getPosts(parseInt(companyPageId as string));
      return res.status(200).json(posts);
    } catch (error) {
      console.error("Get posts error:", error);
      return res.status(500).json({ message: "Server error" });
    }
  });
  
  app.post("/api/posts", isAuthenticated, async (req, res) => {
    try {
      const validatedData = insertPostSchema.parse(req.body);
      
      const post = await storage.createPost(validatedData);
      return res.status(201).json(post);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Validation error", errors: error.errors });
      }
      console.error("Create post error:", error);
      return res.status(500).json({ message: "Server error" });
    }
  });
  
  // Comment Suggestions routes
  app.get("/api/comment-suggestions", isAuthenticated, async (req, res) => {
    try {
      const { postId } = req.query;
      
      if (!postId) {
        return res.status(400).json({ message: "Post ID is required" });
      }
      
      const suggestions = await storage.getCommentSuggestions(parseInt(postId as string));
      return res.status(200).json(suggestions);
    } catch (error) {
      console.error("Get comment suggestions error:", error);
      return res.status(500).json({ message: "Server error" });
    }
  });
  
  app.post("/api/comment-suggestions", isAuthenticated, async (req, res) => {
    try {
      const validatedData = insertCommentSuggestionSchema.parse(req.body);
      
      // In a real app, this would call an AI service to generate a comment
      // Here we'll use some predefined comments based on content patterns
      
      const post = await storage.getPost(validatedData.postId);
      if (!post) {
        return res.status(404).json({ message: "Post not found" });
      }
      
      let suggestedComment = "";
      
      if (post.content.toLowerCase().includes("marketing")) {
        suggestedComment = "Great insights on the evolving marketing landscape! These strategies align perfectly with what we're seeing in the industry. #MarketingTrends #B2BMarketing";
      } else if (post.content.toLowerCase().includes("cloud")) {
        suggestedComment = "Excited to see this innovative cloud solution addressing enterprise security and scalability challenges. This will have a significant impact on digital transformation! #CloudComputing #Enterprise";
      } else if (post.content.toLowerCase().includes("remote work")) {
        suggestedComment = "The shift to remote work has definitely transformed how businesses operate. These insights provide valuable guidance for organizations navigating this new landscape. #FutureOfWork #RemoteWork";
      } else {
        suggestedComment = "Valuable insights shared here! This aligns with the trends we're seeing across the industry. Looking forward to more content like this. #B2B #ThoughtLeadership";
      }
      
      const suggestion = await storage.createCommentSuggestion({
        postId: validatedData.postId,
        commentText: suggestedComment
      });
      
      return res.status(201).json(suggestion);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Validation error", errors: error.errors });
      }
      console.error("Create comment suggestion error:", error);
      return res.status(500).json({ message: "Server error" });
    }
  });
  
  app.put("/api/comment-suggestions/:id/use", isAuthenticated, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      
      const updatedSuggestion = await storage.markCommentAsUsed(id);
      if (!updatedSuggestion) {
        return res.status(404).json({ message: "Comment suggestion not found" });
      }
      
      return res.status(200).json(updatedSuggestion);
    } catch (error) {
      console.error("Mark comment as used error:", error);
      return res.status(500).json({ message: "Server error" });
    }
  });
  
  // Reposts routes
  app.post("/api/reposts", isAuthenticated, async (req, res) => {
    try {
      const userId = req.session.userId as number;
      const validatedData = insertRepostSchema.parse({
        ...req.body,
        userId
      });
      
      const repost = await storage.createRepost(validatedData);
      return res.status(201).json(repost);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Validation error", errors: error.errors });
      }
      console.error("Create repost error:", error);
      return res.status(500).json({ message: "Server error" });
    }
  });
  
  app.get("/api/reposts", isAuthenticated, async (req, res) => {
    try {
      const { postId } = req.query;
      const userId = req.session.userId as number;
      
      if (postId) {
        const reposts = await storage.getReposts(parseInt(postId as string));
        return res.status(200).json(reposts);
      } else {
        const userReposts = await storage.getUserReposts(userId);
        return res.status(200).json(userReposts);
      }
    } catch (error) {
      console.error("Get reposts error:", error);
      return res.status(500).json({ message: "Server error" });
    }
  });
  
  // LinkedIn Share/Repost API endpoint
  app.post("/api/linkedin/share", isAuthenticated, async (req, res) => {
    try {
      const userId = req.session.userId as number;
      const { postUrl, comment, companyPageId } = req.body;
      
      if (!postUrl) {
        return res.status(400).json({ message: "Post URL is required" });
      }
      
      // Get user with access token
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      
      if (!user.linkedinAccessToken) {
        return res.status(401).json({ 
          message: "LinkedIn access token not found. Please log in again to authorize posting.",
          requiresReauth: true
        });
      }
      
      // Check if token is expired
      if (user.linkedinTokenExpiry && new Date(user.linkedinTokenExpiry) < new Date()) {
        return res.status(401).json({ 
          message: "LinkedIn access token has expired. Please log in again to refresh your authorization.",
          requiresReauth: true
        });
      }
      
      // Create LinkedIn Share using the Posts API (v2)
      const sharePayload = {
        author: `urn:li:person:${user.linkedinId}`,
        lifecycleState: "PUBLISHED",
        visibility: "PUBLIC",
        commentary: comment || "",
        distribution: {
          feedDistribution: "MAIN_FEED",
          targetEntities: [],
          thirdPartyDistributionChannels: []
        },
        content: {
          article: {
            source: postUrl,
            title: "Shared post"
          }
        }
      };

      console.log("Posting to LinkedIn:", JSON.stringify(sharePayload, null, 2));

      const shareResponse = await fetch("https://api.linkedin.com/rest/posts", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${user.linkedinAccessToken}`,
          "Content-Type": "application/json",
          "LinkedIn-Version": "202401",
          "X-Restli-Protocol-Version": "2.0.0"
        },
        body: JSON.stringify(sharePayload)
      });
      
      if (!shareResponse.ok) {
        const errorText = await shareResponse.text();
        console.error("LinkedIn share error:", shareResponse.status, errorText);
        
        if (shareResponse.status === 401) {
          return res.status(401).json({ 
            message: "LinkedIn authorization expired. Please log in again.",
            requiresReauth: true
          });
        }
        
        return res.status(500).json({ 
          message: "Failed to share on LinkedIn", 
          details: errorText 
        });
      }
      
      // Posts API returns the post URN in x-restli-id header
      const linkedinPostId = shareResponse.headers.get("x-restli-id") || "unknown";
      console.log("LinkedIn share success:", linkedinPostId);

      // Create a post record if it doesn't exist
      let post = await storage.getPostByUrl(postUrl);
      if (!post && companyPageId) {
        post = await storage.createPost({
          companyPageId: companyPageId,
          postUrl: postUrl,
          content: comment || "Shared post",
          postType: "article",
          publishedAt: new Date()
        });
      }

      // Create repost record
      if (post) {
        const repost = await storage.createRepost({
          postId: post.id,
          userId: userId,
          comment: comment || null
        });

        // Update company page lastChecked
        if (companyPageId) {
          await storage.updateCompanyPage(companyPageId, { lastChecked: new Date() });
        }

        return res.status(201).json({
          success: true,
          linkedinPostId,
          repost: repost
        });
      }

      return res.status(201).json({
        success: true,
        linkedinPostId
      });
      
    } catch (error) {
      console.error("LinkedIn share error:", error);
      return res.status(500).json({ message: "Server error" });
    }
  });
  
  // Analytics routes
  app.get("/api/analytics", isAuthenticated, async (req, res) => {
    try {
      const userId = req.session.userId as number;
      
      // Get or create analytics
      let analytics = await storage.getAnalytics(userId);
      
      if (!analytics) {
        // Create mock analytics for the user
        analytics = await storage.createOrUpdateAnalytics({
          userId,
          totalImpressions: 123400,
          totalReposts: 1458,
          engagementRate: "4.2",
          activeInfluencers: 58,
          dailyData: {
            days: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
            impressions: [12000, 15000, 9000, 18000, 14000, 20000, 16000],
            targets: [18000, 19000, 18000, 21000, 20000, 22000, 20000]
          }
        });
      }
      
      return res.status(200).json(analytics);
    } catch (error) {
      console.error("Get analytics error:", error);
      return res.status(500).json({ message: "Server error" });
    }
  });
  
  // Stripe Payment routes
  app.post("/api/create-payment-intent", isAuthenticated, async (req, res) => {
    try {
      const userId = req.session.userId as number;
      const { amount } = req.body;
      
      if (!amount) {
        return res.status(400).json({ message: "Amount is required" });
      }
      
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      
      // Create a PaymentIntent
      const paymentIntent = await getStripe().paymentIntents.create({
        amount: Math.round(amount * 100), // Convert to cents
        currency: "usd",
        metadata: {
          userId: userId.toString(),
        },
      });
      
      return res.status(200).json({
        clientSecret: paymentIntent.client_secret,
      });
    } catch (error) {
      console.error("Create payment intent error:", error);
      return res.status(500).json({ message: "Server error" });
    }
  });
  
  app.post("/api/create-subscription", isAuthenticated, async (req, res) => {
    try {
      const userId = req.session.userId as number;
      
      // Retrieve user
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      
      let customerId = user.stripeCustomerId;
      
      // If user doesn't have a Stripe customer ID, create one
      if (!customerId) {
        const customer = await getStripe().customers.create({
          email: user.email,
          name: user.fullName,
          metadata: {
            userId: userId.toString(),
          },
        });
        
        customerId = customer.id;
        
        // Update user with Stripe customer ID
        await storage.updateStripeCustomerId(userId, customerId);
      }
      
      // Create or get the premium price
      let priceId: string;
      const existingPrices = await getStripe().prices.list({
        lookup_keys: ['hexashare_premium'],
        limit: 1
      });
      
      if (existingPrices.data.length > 0) {
        priceId = existingPrices.data[0].id;
      } else {
        // Create product and price
        const product = await getStripe().products.create({
          name: "Hexashare Premium",
          description: "Access to premium features and unlimited content amplification",
        });
        
        const price = await getStripe().prices.create({
          product: product.id,
          unit_amount: 1990,
          currency: "usd",
          recurring: { interval: "month" },
          lookup_key: "hexashare_premium",
        });
        priceId = price.id;
      }
      
      // Create subscription with Stripe
      const subscription = await getStripe().subscriptions.create({
        customer: customerId,
        items: [{ price: priceId }],
        payment_behavior: "default_incomplete",
        expand: ["latest_invoice.payment_intent"],
      });
      
      // Get the invoice from the subscription
      const invoice = subscription.latest_invoice as any;
      const paymentIntent = invoice?.payment_intent;
      
      // Update user subscription status
      await storage.updateStripeSubscription(
        userId,
        subscription.id,
        subscription.status
      );
      
      // Return client secret for the frontend to confirm payment
      return res.status(200).json({
        subscriptionId: subscription.id,
        clientSecret: paymentIntent?.client_secret,
      });
    } catch (error) {
      console.error("Create subscription error:", error);
      return res.status(500).json({ message: "Server error" });
    }
  });
  
  // Webhook to handle Stripe events (body parsed as raw buffer by global middleware)
  app.post("/api/webhook", async (req, res) => {
    const sig = req.headers['stripe-signature'] as string;

    let event;

    try {
      // Verify the webhook signature
      const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

      if (!webhookSecret) {
        return res.status(400).send('Webhook secret is not configured');
      }

      event = getStripe().webhooks.constructEvent(req.body, sig, webhookSecret);
    } catch (err: any) {
      console.error(`Webhook Error: ${err.message}`);
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }
    
    // Handle the event
    switch (event.type) {
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
        const subscription = event.data.object as Stripe.Subscription;
        // Find the user by Stripe customer ID
        const user = await storage.getUserByStripeCustomerId(subscription.customer as string);
        
        if (user) {
          await storage.updateStripeSubscription(
            user.id,
            subscription.id,
            subscription.status
          );
        }
        break;
      
      case 'customer.subscription.deleted':
        const canceledSubscription = event.data.object as Stripe.Subscription;
        const userWithCanceledSub = await storage.getUserByStripeCustomerId(
          canceledSubscription.customer as string
        );
        
        if (userWithCanceledSub) {
          await storage.updateStripeSubscription(
            userWithCanceledSub.id,
            canceledSubscription.id,
            'canceled'
          );
        }
        break;
    }
    
    res.json({ received: true });
  });
  
  // Subscription management endpoints
  app.get("/api/subscription", isAuthenticated, async (req, res) => {
    try {
      const userId = req.session.userId as number;
      
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      
      if (!user.stripeSubscriptionId) {
        return res.status(200).json({
          status: "free",
          tier: "free"
        });
      }
      
      // Get the subscription from Stripe
      const subscription = await getStripe().subscriptions.retrieve(user.stripeSubscriptionId) as any;
      
      return res.status(200).json({
        id: subscription.id,
        status: subscription.status,
        currentPeriodEnd: subscription.current_period_end ? new Date(subscription.current_period_end * 1000) : null,
        cancelAtPeriodEnd: subscription.cancel_at_period_end,
        tier: user.subscriptionTier
      });
      
    } catch (error) {
      console.error("Get subscription error:", error);
      return res.status(500).json({ message: "Server error" });
    }
  });
  
  app.post("/api/subscription/cancel", isAuthenticated, async (req, res) => {
    try {
      const userId = req.session.userId as number;
      
      const user = await storage.getUser(userId);
      if (!user || !user.stripeSubscriptionId) {
        return res.status(404).json({ message: "Subscription not found" });
      }
      
      // Cancel the subscription at the end of the current period
      const subscription = await getStripe().subscriptions.update(user.stripeSubscriptionId, {
        cancel_at_period_end: true
      });
      
      return res.status(200).json({
        id: subscription.id,
        status: subscription.status,
        cancelAtPeriodEnd: subscription.cancel_at_period_end
      });
      
    } catch (error) {
      console.error("Cancel subscription error:", error);
      return res.status(500).json({ message: "Server error" });
    }
  });
  
  app.post("/api/subscription/reactivate", isAuthenticated, async (req, res) => {
    try {
      const userId = req.session.userId as number;
      
      const user = await storage.getUser(userId);
      if (!user || !user.stripeSubscriptionId) {
        return res.status(404).json({ message: "Subscription not found" });
      }
      
      // Reactivate the subscription
      const subscription = await getStripe().subscriptions.update(user.stripeSubscriptionId, {
        cancel_at_period_end: false
      });
      
      return res.status(200).json({
        id: subscription.id,
        status: subscription.status,
        cancelAtPeriodEnd: subscription.cancel_at_period_end
      });
      
    } catch (error) {
      console.error("Reactivate subscription error:", error);
      return res.status(500).json({ message: "Server error" });
    }
  });

  // Create HTTP server
  // Referral routes
  app.get("/api/referrals", isAuthenticated, async (req, res) => {
    try {
      const userId = req.session.userId as number;
      const referrals = await storage.getReferralsByUser(userId);
      
      // Get user to include referral code in response
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      
      return res.status(200).json({
        referrals,
        referralCode: user.referralCode,
        referralCount: user.referralCount || 0
      });
    } catch (error) {
      console.error("Get referrals error:", error);
      return res.status(500).json({ message: "Server error" });
    }
  });
  
  app.post("/api/referrals/invite", isAuthenticated, async (req, res) => {
    try {
      const userId = req.session.userId as number;
      const { email } = req.body;
      
      if (!email) {
        return res.status(400).json({ message: "Email is required" });
      }
      
      // Create a new referral record
      const referral = await storage.createReferral({
        referrerId: userId,
        referredEmail: email,
        status: "pending"
      });
      
      // In a real app, send an email to the invited user
      // For now, just return success
      
      return res.status(201).json(referral);
    } catch (error) {
      console.error("Create referral error:", error);
      return res.status(500).json({ message: "Server error" });
    }
  });
  
  app.get("/api/referrals/validate/:code", async (req, res) => {
    try {
      const { code } = req.params;
      
      if (!code) {
        return res.status(400).json({ message: "Referral code is required" });
      }
      
      const referrer = await storage.getUserByReferralCode(code);
      
      if (!referrer) {
        return res.status(404).json({ message: "Invalid referral code" });
      }
      
      return res.status(200).json({
        valid: true,
        referrerId: referrer.id,
        referrerName: referrer.fullName
      });
    } catch (error) {
      console.error("Validate referral error:", error);
      return res.status(500).json({ message: "Server error" });
    }
  });
  
  app.post("/api/referrals/redeem", async (req, res) => {
    try {
      const { referralCode, userId } = req.body;
      
      if (!referralCode || !userId) {
        return res.status(400).json({ message: "Referral code and user ID are required" });
      }
      
      // Find the referrer
      const referrer = await storage.getUserByReferralCode(referralCode);
      if (!referrer) {
        return res.status(404).json({ message: "Invalid referral code" });
      }
      
      // Check if there's an existing referral
      const referrals = await storage.getReferralsByUser(referrer.id);
      const existingReferral = referrals.find(r => r.referredEmail === req.body.email);
      
      if (existingReferral) {
        // Update existing referral
        const updatedReferral = await storage.updateReferralStatus(
          existingReferral.id, 
          "completed", 
          userId
        );
        return res.status(200).json(updatedReferral);
      } else {
        // Create a new referral and mark it as completed
        const newReferral = await storage.createReferral({
          referrerId: referrer.id,
          referredEmail: req.body.email || "", // In a real app, you'd get this from the new user
          status: "completed",
          referredUserId: userId
        });
        
        // Update the referred user to link them to the referrer
        // Convert the id to string to match the schema
        await storage.updateUser(userId, { referredBy: referrer.id.toString() });
        
        return res.status(201).json(newReferral);
      }
    } catch (error) {
      console.error("Redeem referral error:", error);
      return res.status(500).json({ message: "Server error" });
    }
  });

  // Mount additional router modules
  app.use("/api/companies", companyRoutes);
  app.use("/api/linkedin", linkedinCookieRoutes);
  app.use("/api/ai", aiRoutes);

  const httpServer = createServer(app);

  return httpServer;
}
