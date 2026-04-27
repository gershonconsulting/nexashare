import { eq, desc, and } from "drizzle-orm";
import { db } from "./db";
import bcrypt from "bcrypt";
import {
  users, companyPages, posts, commentSuggestions, reposts, analytics, referrals,
  type User, type InsertUser,
  type CompanyPage, type InsertCompanyPage,
  type Post, type InsertPost,
  type CommentSuggestion, type InsertCommentSuggestion,
  type Repost, type InsertRepost,
  type Analytics, type InsertAnalytics,
  type Referral, type InsertReferral
} from "@shared/schema";

const SALT_ROUNDS = 10;

export interface IStorage {
  getUser(id: number): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  getUserByLinkedinId(linkedinId: string): Promise<User | undefined>;
  getUserByStripeCustomerId(stripeCustomerId: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  updateUser(id: number, data: Partial<User>): Promise<User | undefined>;
  updateStripeCustomerId(userId: number, stripeCustomerId: string): Promise<User | undefined>;
  updateStripeSubscription(userId: number, subscriptionId: string, status: string): Promise<User | undefined>;
  verifyPassword(plainPassword: string, hashedPassword: string | null): Promise<boolean>;
  
  getCompanyPages(userId: number): Promise<CompanyPage[]>;
  getCompanyPage(id: number): Promise<CompanyPage | undefined>;
  getCompanyPageByUrl(url: string, userId: number): Promise<CompanyPage | undefined>;
  createCompanyPage(companyPage: InsertCompanyPage): Promise<CompanyPage>;
  updateCompanyPage(id: number, data: Partial<CompanyPage>): Promise<CompanyPage | undefined>;
  deleteCompanyPage(id: number): Promise<boolean>;
  
  getPosts(companyPageId: number): Promise<Post[]>;
  getRecentPosts(limit: number): Promise<Post[]>;
  getPost(id: number): Promise<Post | undefined>;
  getPostByUrl(url: string): Promise<Post | undefined>;
  createPost(post: InsertPost): Promise<Post>;
  updatePostEngagement(id: number, engagement: number, repostCount: number): Promise<Post | undefined>;
  
  getCommentSuggestions(postId: number): Promise<CommentSuggestion[]>;
  createCommentSuggestion(suggestion: InsertCommentSuggestion): Promise<CommentSuggestion>;
  markCommentAsUsed(id: number): Promise<CommentSuggestion | undefined>;
  
  getReposts(postId: number): Promise<Repost[]>;
  getUserReposts(userId: number): Promise<Repost[]>;
  createRepost(repost: InsertRepost): Promise<Repost>;
  updateRepostMetrics(id: number, impressions: number, engagementRate: string): Promise<Repost | undefined>;
  
  getAnalytics(userId: number): Promise<Analytics | undefined>;
  createOrUpdateAnalytics(analytics: InsertAnalytics): Promise<Analytics>;

  getReferralsByUser(userId: number): Promise<Referral[]>;
  getUserByReferralCode(referralCode: string): Promise<User | undefined>;
  createReferral(referral: InsertReferral): Promise<Referral>;
  updateReferralStatus(id: number, status: string, referredUserId?: number): Promise<Referral | undefined>;
  incrementReferralCount(userId: number): Promise<User | undefined>;
}

export class DatabaseStorage implements IStorage {
  async getUser(id: number): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user;
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.email, email));
    return user;
  }

  async getUserByLinkedinId(linkedinId: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.linkedinId, linkedinId));
    return user;
  }

  async getUserByStripeCustomerId(stripeCustomerId: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.stripeCustomerId, stripeCustomerId));
    return user;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const referralCode = `HEX${Math.floor(100000 + Math.random() * 900000)}`;
    const hashedPassword = insertUser.password 
      ? await bcrypt.hash(insertUser.password, SALT_ROUNDS)
      : null;
    
    const [user] = await db.insert(users).values({
      ...insertUser,
      password: hashedPassword,
      referralCode,
      referralCount: 0
    }).returning();
    
    return user;
  }

  async updateUser(id: number, data: Partial<User>): Promise<User | undefined> {
    const [user] = await db.update(users).set(data).where(eq(users.id, id)).returning();
    return user;
  }

  async updateStripeCustomerId(userId: number, stripeCustomerId: string): Promise<User | undefined> {
    const [user] = await db.update(users)
      .set({ stripeCustomerId })
      .where(eq(users.id, userId))
      .returning();
    return user;
  }

  async updateStripeSubscription(userId: number, subscriptionId: string, status: string): Promise<User | undefined> {
    const subscriptionTier = status === "active" ? "premium" : "free";
    const [user] = await db.update(users)
      .set({ 
        stripeSubscriptionId: subscriptionId,
        subscriptionStatus: status,
        subscriptionTier
      })
      .where(eq(users.id, userId))
      .returning();
    return user;
  }

  async verifyPassword(plainPassword: string, hashedPassword: string | null): Promise<boolean> {
    if (!hashedPassword) {
      return false;
    }
    return bcrypt.compare(plainPassword, hashedPassword);
  }

  async getCompanyPages(userId: number): Promise<CompanyPage[]> {
    return db.select().from(companyPages).where(eq(companyPages.userId, userId));
  }

  async getCompanyPage(id: number): Promise<CompanyPage | undefined> {
    const [page] = await db.select().from(companyPages).where(eq(companyPages.id, id));
    return page;
  }

  async getCompanyPageByUrl(url: string, userId: number): Promise<CompanyPage | undefined> {
    const [page] = await db.select().from(companyPages)
      .where(and(
        eq(companyPages.linkedinPageUrl, url),
        eq(companyPages.userId, userId)
      ));
    return page;
  }

  async createCompanyPage(insertCompanyPage: InsertCompanyPage): Promise<CompanyPage> {
    const [page] = await db.insert(companyPages).values({
      ...insertCompanyPage,
      lastChecked: new Date()
    }).returning();
    return page;
  }

  async updateCompanyPage(id: number, data: Partial<CompanyPage>): Promise<CompanyPage | undefined> {
    const [page] = await db.update(companyPages).set(data).where(eq(companyPages.id, id)).returning();
    return page;
  }

  async deleteCompanyPage(id: number): Promise<boolean> {
    const result = await db.delete(companyPages).where(eq(companyPages.id, id));
    return true;
  }

  async getPosts(companyPageId: number): Promise<Post[]> {
    return db.select().from(posts)
      .where(eq(posts.companyPageId, companyPageId))
      .orderBy(desc(posts.publishedAt));
  }

  async getRecentPosts(limit: number): Promise<Post[]> {
    return db.select().from(posts)
      .orderBy(desc(posts.publishedAt))
      .limit(limit);
  }

  async getPost(id: number): Promise<Post | undefined> {
    const [post] = await db.select().from(posts).where(eq(posts.id, id));
    return post;
  }

  async getPostByUrl(url: string): Promise<Post | undefined> {
    const [post] = await db.select().from(posts).where(eq(posts.postUrl, url));
    return post;
  }

  async createPost(insertPost: InsertPost): Promise<Post> {
    const [post] = await db.insert(posts).values({
      ...insertPost,
      engagement: 0,
      repostCount: 0
    }).returning();
    return post;
  }

  async updatePostEngagement(id: number, engagement: number, repostCount: number): Promise<Post | undefined> {
    const [post] = await db.update(posts)
      .set({ engagement, repostCount })
      .where(eq(posts.id, id))
      .returning();
    return post;
  }

  async getCommentSuggestions(postId: number): Promise<CommentSuggestion[]> {
    return db.select().from(commentSuggestions).where(eq(commentSuggestions.postId, postId));
  }

  async createCommentSuggestion(insertSuggestion: InsertCommentSuggestion): Promise<CommentSuggestion> {
    const [suggestion] = await db.insert(commentSuggestions).values({
      ...insertSuggestion,
      used: false
    }).returning();
    return suggestion;
  }

  async markCommentAsUsed(id: number): Promise<CommentSuggestion | undefined> {
    const [suggestion] = await db.update(commentSuggestions)
      .set({ used: true })
      .where(eq(commentSuggestions.id, id))
      .returning();
    return suggestion;
  }

  async getReposts(postId: number): Promise<Repost[]> {
    return db.select().from(reposts).where(eq(reposts.postId, postId));
  }

  async getUserReposts(userId: number): Promise<Repost[]> {
    return db.select().from(reposts).where(eq(reposts.userId, userId));
  }

  async createRepost(insertRepost: InsertRepost): Promise<Repost> {
    const [repost] = await db.insert(reposts).values({
      ...insertRepost,
      impressions: 0,
      engagementRate: "0"
    }).returning();
    
    const post = await this.getPost(insertRepost.postId);
    if (post) {
      await this.updatePostEngagement(post.id, post.engagement || 0, (post.repostCount || 0) + 1);
    }
    
    return repost;
  }

  async updateRepostMetrics(id: number, impressions: number, engagementRate: string): Promise<Repost | undefined> {
    const [repost] = await db.update(reposts)
      .set({ impressions, engagementRate })
      .where(eq(reposts.id, id))
      .returning();
    return repost;
  }

  async getAnalytics(userId: number): Promise<Analytics | undefined> {
    const [result] = await db.select().from(analytics).where(eq(analytics.userId, userId));
    return result;
  }

  async createOrUpdateAnalytics(insertAnalytics: InsertAnalytics): Promise<Analytics> {
    const existing = await this.getAnalytics(insertAnalytics.userId);
    
    if (existing) {
      const [updated] = await db.update(analytics)
        .set({ ...insertAnalytics, date: new Date() })
        .where(eq(analytics.id, existing.id))
        .returning();
      return updated;
    } else {
      const [created] = await db.insert(analytics).values(insertAnalytics).returning();
      return created;
    }
  }

  async getReferralsByUser(userId: number): Promise<Referral[]> {
    return db.select().from(referrals).where(eq(referrals.referrerId, userId));
  }

  async getUserByReferralCode(referralCode: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.referralCode, referralCode));
    return user;
  }

  async createReferral(insertReferral: InsertReferral): Promise<Referral> {
    const [referral] = await db.insert(referrals).values({
      ...insertReferral,
      bonusApplied: false
    }).returning();
    return referral;
  }

  async updateReferralStatus(id: number, status: string, referredUserId?: number): Promise<Referral | undefined> {
    const referral = await db.select().from(referrals).where(eq(referrals.id, id)).then(r => r[0]);
    if (!referral) return undefined;

    const isCompleted = status === 'completed';
    const updateData: Partial<Referral> = {
      status,
      ...(isCompleted && { completedAt: new Date() }),
      ...(referredUserId && { referredUserId })
    };

    const [updated] = await db.update(referrals)
      .set(updateData)
      .where(eq(referrals.id, id))
      .returning();

    if (isCompleted && !referral.bonusApplied) {
      await this.incrementReferralCount(referral.referrerId);
      await db.update(referrals).set({ bonusApplied: true }).where(eq(referrals.id, id));
    }

    return updated;
  }

  async incrementReferralCount(userId: number): Promise<User | undefined> {
    const user = await this.getUser(userId);
    if (!user) return undefined;

    const [updated] = await db.update(users)
      .set({ referralCount: (user.referralCount || 0) + 1 })
      .where(eq(users.id, userId))
      .returning();
    return updated;
  }

  async seedDatabase(): Promise<void> {
    const adminUser = await this.getUserByUsername("admin");
    if (!adminUser) {
      const adminPassword = process.env.ADMIN_PASSWORD;
      if (!adminPassword) {
        console.log("Skipping admin user creation: ADMIN_PASSWORD not set");
        return;
      }
      console.log("Seeding database with admin user...");
      await this.createUser({
        username: "admin",
        password: adminPassword,
        email: "admin@nexashare.com",
        fullName: "Admin User",
        role: "admin"
      });
      console.log("Admin user created successfully");
    }
  }
}

export const storage = new DatabaseStorage();

storage.seedDatabase().catch(console.error);
