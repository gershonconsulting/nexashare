import { apiRequest } from "./queryClient";

// User API
export const fetchCurrentUser = async () => {
  const res = await apiRequest("GET", "/api/auth/me", undefined);
  return res.json();
};

export const loginWithLinkedIn = async (code: string) => {
  const res = await apiRequest("POST", "/api/auth/linkedin-callback", { code });
  return res.json();
};

export const logout = async () => {
  const res = await apiRequest("POST", "/api/auth/logout", undefined);
  return res.json();
};

// Company Pages API
export const fetchCompanyPages = async () => {
  const res = await apiRequest("GET", "/api/company-pages", undefined);
  return res.json();
};

export const createCompanyPage = async (data: {
  linkedinPageUrl: string;
  pageName: string;
  repostFrequency: string;
}) => {
  const res = await apiRequest("POST", "/api/company-pages", data);
  return res.json();
};

export const updateCompanyPage = async (id: number, data: {
  linkedinPageUrl?: string;
  pageName?: string;
  repostFrequency?: string;
  active?: boolean;
}) => {
  const res = await apiRequest("PUT", `/api/company-pages/${id}`, data);
  return res.json();
};

export const deleteCompanyPage = async (id: number) => {
  const res = await apiRequest("DELETE", `/api/company-pages/${id}`, undefined);
  return res.json();
};

// Posts API
export const fetchPosts = async (companyPageId?: number) => {
  const url = companyPageId ? `/api/posts?companyPageId=${companyPageId}` : "/api/posts";
  const res = await apiRequest("GET", url, undefined);
  return res.json();
};

// Comment Suggestions API
export const fetchCommentSuggestions = async (postId: number) => {
  const res = await apiRequest("GET", `/api/comment-suggestions?postId=${postId}`, undefined);
  return res.json();
};

export const generateCommentSuggestion = async (postId: number) => {
  const res = await apiRequest("POST", "/api/comment-suggestions", { postId });
  return res.json();
};

export const useCommentSuggestion = async (id: number) => {
  const res = await apiRequest("PUT", `/api/comment-suggestions/${id}/use`, undefined);
  return res.json();
};

// Reposts API
export const createRepost = async (data: {
  postId: number;
  comment?: string;
}) => {
  const res = await apiRequest("POST", "/api/reposts", data);
  return res.json();
};

export const fetchReposts = async (postId?: number) => {
  const url = postId ? `/api/reposts?postId=${postId}` : "/api/reposts";
  const res = await apiRequest("GET", url, undefined);
  return res.json();
};

// Analytics API
export const fetchAnalytics = async () => {
  const res = await apiRequest("GET", "/api/analytics", undefined);
  return res.json();
};

// Subscription API
export const fetchSubscription = async () => {
  const res = await apiRequest("GET", "/api/subscription", undefined);
  return res.json();
};

export const createPaymentIntent = async (amount: number) => {
  const res = await apiRequest("POST", "/api/create-payment-intent", { amount });
  return res.json();
};

export const createSubscription = async () => {
  const res = await apiRequest("POST", "/api/create-subscription", undefined);
  return res.json();
};

export const cancelSubscription = async () => {
  const res = await apiRequest("POST", "/api/subscription/cancel", undefined);
  return res.json();
};

export const reactivateSubscription = async () => {
  const res = await apiRequest("POST", "/api/subscription/reactivate", undefined);
  return res.json();
};

// Referrals API
export const fetchReferrals = async () => {
  const res = await apiRequest("GET", "/api/referrals", undefined);
  return res.json();
};

export const inviteByEmail = async (email: string) => {
  const res = await apiRequest("POST", "/api/referrals/invite", { email });
  return res.json();
};

export const validateReferralCode = async (code: string) => {
  const res = await apiRequest("GET", `/api/referrals/validate/${code}`, undefined);
  return res.json();
};

export const redeemReferralCode = async (data: {
  referralCode: string;
  userId: number;
  email?: string;
}) => {
  const res = await apiRequest("POST", "/api/referrals/redeem", data);
  return res.json();
};
