import { Link } from "wouter";

export default function PrivacyPolicy() {
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
          
          <h1 className="text-3xl font-bold text-neutral-900 mb-8">Privacy Policy</h1>
          
          <div className="prose prose-neutral max-w-none">
            <p className="text-neutral-600 mb-6">
              Last updated: January 2, 2026
            </p>
            
            <section className="mb-8">
              <h2 className="text-xl font-semibold text-neutral-900 mb-4">1. Introduction</h2>
              <p className="text-neutral-700 mb-4">
                Welcome to NexaShare ("we," "our," or "us"). We are committed to protecting your privacy and ensuring the security of your personal information. This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you use our B2B content amplification platform.
              </p>
            </section>
            
            <section className="mb-8">
              <h2 className="text-xl font-semibold text-neutral-900 mb-4">2. Information We Collect</h2>
              <p className="text-neutral-700 mb-4">We collect the following types of information:</p>
              <ul className="list-disc pl-6 text-neutral-700 space-y-2 mb-4">
                <li><strong>Account Information:</strong> Name, email address, company name, and profile picture when you register via LinkedIn OAuth.</li>
                <li><strong>LinkedIn Data:</strong> With your permission, we access your LinkedIn profile information to facilitate content sharing and amplification.</li>
                <li><strong>Usage Data:</strong> Information about how you use our platform, including campaign performance, analytics, and engagement metrics.</li>
                <li><strong>Payment Information:</strong> Billing details processed securely through Stripe for premium subscriptions.</li>
              </ul>
            </section>
            
            <section className="mb-8">
              <h2 className="text-xl font-semibold text-neutral-900 mb-4">3. How We Use Your Information</h2>
              <p className="text-neutral-700 mb-4">We use your information to:</p>
              <ul className="list-disc pl-6 text-neutral-700 space-y-2 mb-4">
                <li>Provide and maintain our content amplification services</li>
                <li>Process your subscription and payment transactions</li>
                <li>Send you important updates about your account and our services</li>
                <li>Analyze and improve our platform performance</li>
                <li>Comply with legal obligations and protect our rights</li>
              </ul>
            </section>
            
            <section className="mb-8">
              <h2 className="text-xl font-semibold text-neutral-900 mb-4">4. Data Sharing and Disclosure</h2>
              <p className="text-neutral-700 mb-4">
                We do not sell your personal information. We may share your data with:
              </p>
              <ul className="list-disc pl-6 text-neutral-700 space-y-2 mb-4">
                <li><strong>Service Providers:</strong> Third-party vendors who assist in operating our platform (e.g., Stripe for payments, hosting providers)</li>
                <li><strong>Legal Requirements:</strong> When required by law or to protect our rights</li>
                <li><strong>Business Transfers:</strong> In connection with a merger, acquisition, or sale of assets</li>
              </ul>
            </section>
            
            <section className="mb-8">
              <h2 className="text-xl font-semibold text-neutral-900 mb-4">5. Data Security</h2>
              <p className="text-neutral-700 mb-4">
                We implement industry-standard security measures to protect your data, including encryption, secure authentication, and regular security audits. However, no method of transmission over the Internet is 100% secure.
              </p>
            </section>
            
            <section className="mb-8">
              <h2 className="text-xl font-semibold text-neutral-900 mb-4">6. Your Rights</h2>
              <p className="text-neutral-700 mb-4">You have the right to:</p>
              <ul className="list-disc pl-6 text-neutral-700 space-y-2 mb-4">
                <li>Access and receive a copy of your personal data</li>
                <li>Correct inaccurate or incomplete information</li>
                <li>Request deletion of your personal data</li>
                <li>Withdraw consent for data processing</li>
                <li>Object to certain processing activities</li>
              </ul>
            </section>
            
            <section className="mb-8">
              <h2 className="text-xl font-semibold text-neutral-900 mb-4">7. Cookies and Tracking</h2>
              <p className="text-neutral-700 mb-4">
                We use cookies and similar technologies to maintain your session, remember your preferences, and analyze platform usage. You can control cookie settings through your browser.
              </p>
            </section>
            
            <section className="mb-8">
              <h2 className="text-xl font-semibold text-neutral-900 mb-4">8. Third-Party Links</h2>
              <p className="text-neutral-700 mb-4">
                Our platform may contain links to third-party websites, including LinkedIn. We are not responsible for the privacy practices of these external sites.
              </p>
            </section>
            
            <section className="mb-8">
              <h2 className="text-xl font-semibold text-neutral-900 mb-4">9. Changes to This Policy</h2>
              <p className="text-neutral-700 mb-4">
                We may update this Privacy Policy from time to time. We will notify you of significant changes by email or through our platform.
              </p>
            </section>
            
            <section className="mb-8">
              <h2 className="text-xl font-semibold text-neutral-900 mb-4">10. Contact Us</h2>
              <p className="text-neutral-700 mb-4">
                If you have questions about this Privacy Policy or our data practices, please contact us at:
              </p>
              <p className="text-neutral-700">
                <strong>Email:</strong> privacy@nexashare.com<br />
                <strong>Website:</strong> www.nexashare.com
              </p>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
