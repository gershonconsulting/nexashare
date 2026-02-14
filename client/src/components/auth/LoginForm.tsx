import { Button } from "@/components/ui/button";
import { useAuth } from "@/context/AuthContext";

export function LoginForm() {
  const { linkedinLogin, isLoading } = useAuth();
  
  return (
    <div className="max-w-md w-full px-8 py-12 bg-white shadow-md rounded-lg">
      <div className="text-center mb-8">
        <div className="inline-flex items-center justify-center h-12 w-12 bg-primary rounded-lg mb-4">
          <i className="fas fa-share-nodes text-white text-xl"></i>
        </div>
        <h2 className="text-2xl font-bold text-neutral-900">Welcome to Hexashare</h2>
        <p className="text-neutral-600 mt-2">B2B Content Amplification Platform</p>
      </div>
      
      <Button
        type="button"
        className="w-full bg-[#0A66C2] hover:bg-[#084e94] text-white py-6 px-4 rounded-md flex items-center justify-center font-medium"
        onClick={linkedinLogin}
        disabled={isLoading}
      >
        {isLoading ? (
          <i className="fas fa-spinner fa-spin mr-3"></i>
        ) : (
          <i className="fab fa-linkedin mr-3"></i>
        )}
        Continue with LinkedIn
      </Button>
      
      <div className="mt-6 text-center">
        <p className="text-sm text-neutral-600">
          By continuing, you agree to our <a href="/TermsOfService" className="text-primary hover:underline">Terms of Service</a> and <a href="/PrivacyPolicy" className="text-primary hover:underline">Privacy Policy</a>.
        </p>
      </div>
    </div>
  );
}
