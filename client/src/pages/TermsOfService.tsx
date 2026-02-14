import { Link } from "wouter";

export default function TermsOfService() {
  return (
    <div className="min-h-screen bg-neutral-50">
      <div className="max-w-4xl mx-auto px-4 py-12">
        <div className="bg-white rounded-lg shadow-sm border border-neutral-200 p-8 md:p-12">
          <div className="mb-8">
            <Link href="/login" className="text-primary hover:underline flex items-center gap-2">
              <i className="fas fa-arrow-left"></i>
              Back to Login
            </Link>
          </div>
          
          <h1 className="text-3xl font-bold text-neutral-900 mb-8">Terms of Service</h1>
          
          <div className="prose prose-neutral max-w-none">
            <p className="text-neutral-600 mb-6">
              Last updated: January 2, 2026
            </p>
            
            <section className="mb-8">
              <h2 className="text-xl font-semibold text-neutral-900 mb-4">1. Acceptance of Terms</h2>
              <p className="text-neutral-700 mb-4">
                By accessing or using NexaShare ("the Service"), you agree to be bound by these Terms of Service. If you do not agree to these terms, please do not use our Service.
              </p>
            </section>
            
            <section className="mb-8">
              <h2 className="text-xl font-semibold text-neutral-900 mb-4">2. Description of Service</h2>
              <p className="text-neutral-700 mb-4">
                NexaShare is a B2B content amplification platform that helps companies increase their reach through LinkedIn content sharing and influencer partnerships. Our services include:
              </p>
              <ul className="list-disc pl-6 text-neutral-700 space-y-2 mb-4">
                <li>Campaign management for content amplification</li>
                <li>Analytics and performance tracking</li>
                <li>Influencer discovery and collaboration tools</li>
                <li>AI-powered content optimization suggestions</li>
              </ul>
            </section>
            
            <section className="mb-8">
              <h2 className="text-xl font-semibold text-neutral-900 mb-4">3. User Accounts</h2>
              <p className="text-neutral-700 mb-4">
                To use our Service, you must create an account using LinkedIn OAuth. You are responsible for:
              </p>
              <ul className="list-disc pl-6 text-neutral-700 space-y-2 mb-4">
                <li>Maintaining the confidentiality of your account</li>
                <li>All activities that occur under your account</li>
                <li>Notifying us immediately of any unauthorized use</li>
              </ul>
            </section>
            
            <section className="mb-8">
              <h2 className="text-xl font-semibold text-neutral-900 mb-4">4. Subscription and Payments</h2>
              <p className="text-neutral-700 mb-4">
                NexaShare offers a freemium model:
              </p>
              <ul className="list-disc pl-6 text-neutral-700 space-y-2 mb-4">
                <li><strong>Free Tier:</strong> Limited to managing 1 company's content</li>
                <li><strong>Premium Tier ($19.90/month):</strong> Unlimited companies, advanced analytics, priority support</li>
              </ul>
              <p className="text-neutral-700 mb-4">
                Payments are processed securely through Stripe. Subscriptions renew automatically unless cancelled before the renewal date.
              </p>
            </section>
            
            <section className="mb-8">
              <h2 className="text-xl font-semibold text-neutral-900 mb-4">5. Acceptable Use</h2>
              <p className="text-neutral-700 mb-4">You agree not to:</p>
              <ul className="list-disc pl-6 text-neutral-700 space-y-2 mb-4">
                <li>Violate any applicable laws or regulations</li>
                <li>Infringe on intellectual property rights of others</li>
                <li>Share content that is false, misleading, or harmful</li>
                <li>Attempt to gain unauthorized access to our systems</li>
                <li>Use the Service for spam or unsolicited communications</li>
                <li>Violate LinkedIn's Terms of Service</li>
              </ul>
            </section>
            
            <section className="mb-8">
              <h2 className="text-xl font-semibold text-neutral-900 mb-4">6. Intellectual Property</h2>
              <p className="text-neutral-700 mb-4">
                The Service and its original content, features, and functionality are owned by NexaShare and are protected by international copyright, trademark, and other intellectual property laws.
              </p>
            </section>
            
            <section className="mb-8">
              <h2 className="text-xl font-semibold text-neutral-900 mb-4">7. User Content</h2>
              <p className="text-neutral-700 mb-4">
                You retain ownership of content you create or share through our Service. By using our platform, you grant us a license to display and distribute your content as necessary to provide the Service.
              </p>
            </section>
            
            <section className="mb-8">
              <h2 className="text-xl font-semibold text-neutral-900 mb-4">8. Limitation of Liability</h2>
              <p className="text-neutral-700 mb-4">
                NexaShare shall not be liable for any indirect, incidental, special, consequential, or punitive damages resulting from your use of the Service. Our total liability shall not exceed the amount you paid us in the twelve months preceding the claim.
              </p>
            </section>
            
            <section className="mb-8">
              <h2 className="text-xl font-semibold text-neutral-900 mb-4">9. Termination</h2>
              <p className="text-neutral-700 mb-4">
                We may terminate or suspend your account at any time for violations of these Terms. You may cancel your account at any time through your account settings or by contacting support.
              </p>
            </section>
            
            <section className="mb-8">
              <h2 className="text-xl font-semibold text-neutral-900 mb-4">10. Changes to Terms</h2>
              <p className="text-neutral-700 mb-4">
                We reserve the right to modify these Terms at any time. We will notify users of significant changes via email or through the Service. Continued use after changes constitutes acceptance of the new Terms.
              </p>
            </section>
            
            <section className="mb-8">
              <h2 className="text-xl font-semibold text-neutral-900 mb-4">11. Contact Us</h2>
              <p className="text-neutral-700 mb-4">
                If you have questions about these Terms, please contact us at:
              </p>
              <p className="text-neutral-700">
                <strong>Email:</strong> legal@nexashare.com<br />
                <strong>Website:</strong> www.nexashare.com
              </p>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
