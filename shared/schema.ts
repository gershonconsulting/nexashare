import { pgTable, text, serial, integer, boolean, json, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Main user table
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  password: text("password"),
  email: text("email").notNull().unique(),
  fullName: text("full_name").notNull(),
  company: text("company"),
  linkedinId: text("linkedin_id").unique(),
  linkedinAccessToken: text("linkedin_access_token"),
  linkedinTokenExpiry: timestamp("linkedin_token_expiry"),
  linkedinCookies: text("linkedin_cookies"), // Encrypted LinkedIn session cookies
  linkedinCookiesUpdatedAt: timestamp("linkedin_cookies_updated_at"), // When cookies were last updated
  profilePicture: text("profile_picture"),
  role: text("role").notNull().default("company_user"), // "company_user", "influencer", "admin"
  referralCode: text("referral_code").unique(),
  referredBy: text("referred_by"),
  referralCount: integer("referral_count").notNull().default(0),
  stripeCustomerId: text("stripe_customer_id").unique(),
  stripeSubscriptionId: text("stripe_subscription_id").unique(),
  subscriptionStatus: text("subscription_status").default("free"), // "free", "active", "past_due", "canceled"
  subscriptionTier: text("subscription_tier").default("free"), // "free", "premium"
  createdAt: timestamp("created_at").defaultNow(),
  lastLoginAt: timestamp("last_login_at")
});

// LinkedIn company pages to monitor
export const companyPages = pgTable("company_pages", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id),
  linkedinPageUrl: text("linkedin_page_url").notNull(),
  pageName: text("page_name").notNull(),
  lastChecked: timestamp("last_checked"),
  repostFrequency: text("repost_frequency").notNull().default("weekly"), // "daily", "weekly", "all_time"
  active: boolean("active").notNull().default(true),
  autoRepost: boolean("auto_repost").notNull().default(false), // Enable automatic reposting
  lastAutoRepost: timestamp("last_auto_repost") // Track when last auto-repost occurred
});

// Posts tracked from LinkedIn
export const posts = pgTable("posts", {
  id: serial("id").primaryKey(),
  companyPageId: integer("company_page_id").notNull().references(() => companyPages.id),
  postUrl: text("post_url").notNull(),
  content: text("content").notNull(),
  postType: text("post_type").notNull().default("article"), // "article", "image", "video", etc.
  publishedAt: timestamp("published_at").notNull(),
  engagement: integer("engagement").default(0),
  repostCount: integer("repost_count").default(0)
});

// AI-generated comment suggestions
export const commentSuggestions = pgTable("comment_suggestions", {
  id: serial("id").primaryKey(),
  postId: integer("post_id").notNull().references(() => posts.id),
  commentText: text("comment_text").notNull(),
  used: boolean("used").notNull().default(false),
  generatedAt: timestamp("generated_at").defaultNow()
});

// Reposts by influencers
export const reposts = pgTable("reposts", {
  id: serial("id").primaryKey(),
  postId: integer("post_id").notNull().references(() => posts.id),
  userId: integer("user_id").notNull().references(() => users.id),
  comment: text("comment"),
  repostedAt: timestamp("reposted_at").defaultNow(),
  impressions: integer("impressions").default(0),
  engagementRate: text("engagement_rate").default("0")
});

// Analytics data
export const analytics = pgTable("analytics", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id),
  date: timestamp("date").defaultNow(),
  totalImpressions: integer("total_impressions").default(0),
  totalReposts: integer("total_reposts").default(0),
  engagementRate: text("engagement_rate").default("0"),
  activeInfluencers: integer("active_influencers").default(0),
  dailyData: json("daily_data")
});

// Referrals tracking
export const referrals = pgTable("referrals", {
  id: serial("id").primaryKey(),
  referrerId: integer("referrer_id").notNull().references(() => users.id),
  referredEmail: text("referred_email").notNull(),
  referredUserId: integer("referred_user_id").references(() => users.id),
  status: text("status").notNull().default("pending"), // "pending", "completed", "expired"
  createdAt: timestamp("created_at").defaultNow(),
  completedAt: timestamp("completed_at"),
  bonusApplied: boolean("bonus_applied").notNull().default(false)
});

// Insert schemas
export const insertUserSchema = createInsertSchema(users)
  .pick({
    username: true,
    password: true,
    email: true,
    fullName: true,
    company: true,
    linkedinId: true,
    linkedinAccessToken: true,
    linkedinTokenExpiry: true,
    profilePicture: true,
    role: true,
    referredBy: true,
    stripeCustomerId: true,
    stripeSubscriptionId: true,
    subscriptionStatus: true,
    subscriptionTier: true
  });

export const insertCompanyPageSchema = createInsertSchema(companyPages)
  .pick({
    userId: true,
    linkedinPageUrl: true,
    pageName: true,
    repostFrequency: true,
    active: true,
    autoRepost: true
  });

export const updateCompanyPageSchema = createInsertSchema(companyPages)
  .pick({
    linkedinPageUrl: true,
    pageName: true,
    repostFrequency: true,
    active: true,
    autoRepost: true,
    lastAutoRepost: true,
    lastChecked: true
  })
  .partial();

export const insertPostSchema = createInsertSchema(posts)
  .pick({
    companyPageId: true,
    postUrl: true,
    content: true,
    postType: true,
    publishedAt: true
  });

export const insertCommentSuggestionSchema = createInsertSchema(commentSuggestions)
  .pick({
    postId: true,
    commentText: true
  });

export const insertRepostSchema = createInsertSchema(reposts)
  .pick({
    postId: true,
    userId: true,
    comment: true
  });

export const insertAnalyticsSchema = createInsertSchema(analytics)
  .pick({
    userId: true,
    totalImpressions: true,
    totalReposts: true,
    engagementRate: true,
    activeInfluencers: true,
    dailyData: true
  });

export const insertReferralSchema = createInsertSchema(referrals)
  .pick({
    referrerId: true,
    referredEmail: true,
    referredUserId: true,
    status: true
  });

// Types
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

export type InsertCompanyPage = z.infer<typeof insertCompanyPageSchema>;
export type CompanyPage = typeof companyPages.$inferSelect;

export type InsertPost = z.infer<typeof insertPostSchema>;
export type Post = typeof posts.$inferSelect;

export type InsertCommentSuggestion = z.infer<typeof insertCommentSuggestionSchema>;
export type CommentSuggestion = typeof commentSuggestions.$inferSelect;

export type InsertRepost = z.infer<typeof insertRepostSchema>;
export type Repost = typeof reposts.$inferSelect;

export type InsertAnalytics = z.infer<typeof insertAnalyticsSchema>;
export type Analytics = typeof analytics.$inferSelect;

export type InsertReferral = z.infer<typeof insertReferralSchema>;
export type Referral = typeof referrals.$inferSelect;
