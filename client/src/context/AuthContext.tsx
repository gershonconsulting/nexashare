import { createContext, useState, useContext, useCallback, ReactNode } from "react";
import { useToast } from "@/hooks/use-toast";
import { linkedinAuth } from "@/lib/linkedinAuth";
import { apiRequest } from "@/lib/queryClient";

interface User {
  id: number;
  username: string;
  email: string;
  fullName: string;
  company?: string;
  role: string;
  linkedinId?: string;
  profilePicture?: string;
  referralCode?: string;
  referralCount?: number;
  subscriptionTier?: string;
  subscriptionStatus?: string;
}

interface AuthContextType {
  isAuthenticated: boolean | null;
  user: User | null;
  isLoading: boolean;
  error: string | null;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  linkedinLogin: () => Promise<void>;
  handleLinkedInCallback: (code: string) => Promise<boolean>;
  updateUser: (userData: User) => Promise<void>;
  checkAuth: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();
  
  // Check if user is already authenticated
  const checkAuth = useCallback(async () => {
    try {
      setIsLoading(true);
      const response = await fetch("/api/auth/me", {
        credentials: "include"
      });
      
      if (response.ok) {
        const userData = await response.json();
        setUser(userData);
        setIsAuthenticated(true);
      } else {
        setUser(null);
        setIsAuthenticated(false);
      }
    } catch (err) {
      console.error("Authentication check failed:", err);
      setUser(null);
      setIsAuthenticated(false);
    } finally {
      setIsLoading(false);
    }
  }, []);
  
  // Login with username/password
  const login = async (username: string, password: string) => {
    try {
      setIsLoading(true);
      setError(null);
      
      const response = await apiRequest("POST", "/api/auth/login", { username, password });
      const userData = await response.json();
      
      setUser(userData);
      setIsAuthenticated(true);
      
      toast({
        title: "Login successful",
        description: `Welcome back, ${userData.fullName}!`,
      });
    } catch (err) {
      console.error("Login failed:", err);
      setError(err instanceof Error ? err.message : "Login failed");
      
      toast({
        title: "Login failed",
        description: err instanceof Error ? err.message : "Invalid credentials",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };
  
  // Logout
  const logout = async () => {
    try {
      setIsLoading(true);
      await apiRequest("POST", "/api/auth/logout", {});
      
      setUser(null);
      setIsAuthenticated(false);
      
      toast({
        title: "Logout successful",
        description: "You have been logged out.",
      });
    } catch (err) {
      console.error("Logout failed:", err);
      
      toast({
        title: "Logout failed",
        description: "Failed to log out. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };
  
  // Login with LinkedIn - redirects to LinkedIn OAuth page
  const linkedinLogin = async () => {
    try {
      setIsLoading(true);
      setError(null);
      
      // Redirect to LinkedIn OAuth page
      linkedinAuth.initiate();
    } catch (err) {
      console.error("LinkedIn login failed:", err);
      setError(err instanceof Error ? err.message : "LinkedIn login failed");
      setIsLoading(false);
      
      toast({
        title: "Login failed",
        description: err instanceof Error ? err.message : "LinkedIn authentication failed",
        variant: "destructive",
      });
    }
  };
  
  // Handle LinkedIn OAuth callback - wrapped in useCallback to prevent double-execution
  const handleLinkedInCallback = useCallback(async (code: string) => {
    try {
      setIsLoading(true);
      setError(null);
      
      const redirectUri = linkedinAuth.getRedirectUri();
      console.log("LinkedIn callback - code:", code.substring(0, 20) + "...", "redirectUri:", redirectUri);
      
      // Exchange code for user data
      const response = await apiRequest("POST", "/api/auth/linkedin-callback", { 
        code, 
        redirectUri 
      });
      const userData = await response.json();
      
      setUser(userData);
      setIsAuthenticated(true);
      
      toast({
        title: "Login successful",
        description: `Welcome, ${userData.fullName}!`,
      });
      
      return true;
    } catch (err) {
      console.error("LinkedIn login failed:", err);
      setError(err instanceof Error ? err.message : "LinkedIn login failed");
      
      toast({
        title: "Login failed",
        description: err instanceof Error ? err.message : "LinkedIn authentication failed",
        variant: "destructive",
      });
      
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [toast]);
  
  // Update user
  const updateUser = async (userData: User) => {
    try {
      setUser(userData);
    } catch (err) {
      console.error("Update user failed:", err);
      throw err;
    }
  };
  
  return (
    <AuthContext.Provider
      value={{
        isAuthenticated,
        user,
        isLoading,
        error,
        login,
        logout,
        linkedinLogin,
        handleLinkedInCallback,
        updateUser,
        checkAuth
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  
  return context;
}
