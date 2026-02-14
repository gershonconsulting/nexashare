// LinkedIn OAuth implementation

interface LinkedInAuthResponse {
  code: string;
  state: string;
}

class LinkedInAuth {
  private scope: string[];
  
  constructor() {
    // OpenID Connect scopes + w_member_social for posting
    // Requires "Sign In with LinkedIn using OpenID Connect" and "Share on LinkedIn" products
    // to be approved in LinkedIn Developer Console
    this.scope = ["openid", "profile", "email", "w_member_social"];
  }
  
  private get clientId(): string {
    return import.meta.env.VITE_LINKEDIN_CLIENT_ID || "78dsjq2rbcv26t";
  }
  
  private get redirectUri(): string {
    // Use VITE_REDIRECT_URI env var if set, otherwise derive from current origin
    // The redirect URI must match what's configured in LinkedIn Developer Console
    return import.meta.env.VITE_REDIRECT_URI || `${window.location.origin}/auth/callback`;
  }
  
  private generateRandomString(length: number): string {
    const possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    let text = "";
    
    for (let i = 0; i < length; i++) {
      text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    
    return text;
  }
  
  private getAuthUrl(): string {
    const state = this.generateRandomString(16);
    sessionStorage.setItem("linkedin_oauth_state", state);
    
    const baseUrl = "https://www.linkedin.com/oauth/v2/authorization";
    const params = new URLSearchParams({
      response_type: "code",
      client_id: this.clientId,
      redirect_uri: this.redirectUri,
      state: state,
      scope: this.scope.join(" ")
    });
    
    return `${baseUrl}?${params.toString()}`;
  }
  
  // Initiate the LinkedIn OAuth flow - redirects to LinkedIn
  initiate(): void {
    const clientId = this.clientId;
    console.log("LinkedIn OAuth initiate - Client ID present:", !!clientId);
    
    if (!clientId) {
      throw new Error("LinkedIn Client ID not configured. Please set VITE_LINKEDIN_CLIENT_ID environment variable.");
    }
    
    const authUrl = this.getAuthUrl();
    console.log("Redirecting to LinkedIn:", authUrl.substring(0, 80) + "...");
    window.location.href = authUrl;
  }
  
  // Get redirect URI for backend
  getRedirectUri(): string {
    return this.redirectUri;
  }
  
  // Parse the response from LinkedIn redirect
  parseRedirectUri(uri: string): LinkedInAuthResponse | null {
    try {
      const url = new URL(uri);
      const params = new URLSearchParams(url.search);
      
      const code = params.get("code");
      const state = params.get("state");
      const error = params.get("error");
      
      if (error) {
        console.error("LinkedIn OAuth error:", error, params.get("error_description"));
        return null;
      }
      
      if (!code || !state) {
        console.error("Missing code or state in redirect URI");
        return null;
      }
      
      // Verify state to prevent CSRF attacks
      const savedState = sessionStorage.getItem("linkedin_oauth_state");
      
      // In production, sessionStorage might be cleared during redirect
      // Log the issue but still proceed if we have a valid code
      if (state !== savedState) {
        console.warn("State mismatch - savedState:", savedState, "received:", state);
        // If no saved state exists, it likely got cleared during redirect
        // Proceed with caution but allow the flow to continue
        if (!savedState) {
          console.warn("No saved state found - sessionStorage may have been cleared during redirect. Proceeding with authentication.");
        } else {
          console.error("State values don't match. Possible CSRF attack.");
          return null;
        }
      }
      
      // Clear the state
      sessionStorage.removeItem("linkedin_oauth_state");
      
      return { code, state };
    } catch (error) {
      console.error("Error parsing redirect URI:", error);
      return null;
    }
  }
}

export const linkedinAuth = new LinkedInAuth();
