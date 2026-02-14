import { useEffect, useState, useRef } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/context/AuthContext";
import { linkedinAuth } from "@/lib/linkedinAuth";

export default function AuthCallback() {
  const [, setLocation] = useLocation();
  const { handleLinkedInCallback } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const processedRef = useRef(false);

  useEffect(() => {
    // Prevent double-processing (React StrictMode or re-renders)
    if (processedRef.current) {
      console.log("AuthCallback: Already processed, skipping");
      return;
    }
    processedRef.current = true;
    
    const processCallback = async () => {
      console.log("AuthCallback: Processing LinkedIn callback");
      const authResponse = linkedinAuth.parseRedirectUri(window.location.href);
      
      if (!authResponse) {
        setError("Failed to process LinkedIn authentication");
        setTimeout(() => setLocation("/login"), 3000);
        return;
      }
      
      console.log("AuthCallback: Exchanging code for token");
      const success = await handleLinkedInCallback(authResponse.code);
      
      if (success) {
        console.log("AuthCallback: Success, redirecting to home");
        setLocation("/");
      } else {
        setError("LinkedIn authentication failed");
        setTimeout(() => setLocation("/login"), 3000);
      }
    };
    
    processCallback();
  }, [handleLinkedInCallback, setLocation]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-neutral-50">
      <div className="text-center">
        {error ? (
          <>
            <div className="text-red-500 mb-4">
              <i className="fas fa-exclamation-circle text-4xl"></i>
            </div>
            <h2 className="text-xl font-semibold text-neutral-900 mb-2">{error}</h2>
            <p className="text-neutral-600">Redirecting to login...</p>
          </>
        ) : (
          <>
            <div className="text-primary mb-4">
              <i className="fas fa-spinner fa-spin text-4xl"></i>
            </div>
            <h2 className="text-xl font-semibold text-neutral-900 mb-2">Completing sign in...</h2>
            <p className="text-neutral-600">Please wait while we verify your LinkedIn account.</p>
          </>
        )}
      </div>
    </div>
  );
}
