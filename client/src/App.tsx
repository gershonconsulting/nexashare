import { Switch, Route, useLocation } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import Dashboard from "@/pages/Dashboard";
import Login from "@/pages/Login";
import Onboarding from "@/pages/Onboarding";
import Subscribe from "@/pages/Subscribe";
import Campaigns from "@/pages/Campaigns";
import Influencers from "@/pages/Influencers";
import Analytics from "@/pages/Analytics";
import Settings from "@/pages/Settings";
import Content from "@/pages/Content";
import AuthCallback from "@/pages/AuthCallback";
import PrivacyPolicy from "@/pages/PrivacyPolicy";
import TermsOfService from "@/pages/TermsOfService";
import { useAuth, AuthProvider } from "./context/AuthContext";
import { useEffect } from "react";

function Router() {
  const { isAuthenticated, user, checkAuth } = useAuth();
  const [location, setLocation] = useLocation();

  useEffect(() => {
    // Check authentication status on mount
    checkAuth();
  }, [checkAuth]);

  useEffect(() => {
    // Skip redirect logic for public routes
    const publicRoutes = ["/auth/callback", "/PrivacyPolicy", "/TermsOfService"];
    if (publicRoutes.includes(location)) {
      return;
    }
    
    // Redirect based on auth status and onboarding completion
    if (isAuthenticated === false && location !== "/login") {
      setLocation("/login");
    } else if (isAuthenticated && user && !user.company && location !== "/onboarding") {
      setLocation("/onboarding");
    } else if (isAuthenticated && user && user.company && location === "/login") {
      setLocation("/");
    }
  }, [isAuthenticated, user, location, setLocation]);

  return (
    <Switch>
      <Route path="/" component={Dashboard} />
      <Route path="/login" component={Login} />
      <Route path="/auth/callback" component={AuthCallback} />
      <Route path="/PrivacyPolicy" component={PrivacyPolicy} />
      <Route path="/TermsOfService" component={TermsOfService} />
      <Route path="/onboarding" component={Onboarding} />
      <Route path="/campaigns" component={Campaigns} />
      <Route path="/influencers" component={Influencers} />
      <Route path="/content" component={Content} />
      <Route path="/analytics" component={Analytics} />
      <Route path="/settings" component={Settings} />
      <Route path="/subscribe" component={Subscribe} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <AuthProvider>
          <Toaster />
          <Router />
        </AuthProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
