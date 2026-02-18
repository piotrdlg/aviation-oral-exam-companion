import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Privacy Policy — HeyDPE',
  description:
    'Privacy Policy for HeyDPE, the AI checkride oral exam simulator by Imagine Flying LLC. Learn how we collect, use, and protect your data.',
  metadataBase: new URL('https://aviation-oral-exam-companion.vercel.app'),
  alternates: {
    canonical: '/privacy',
  },
};

export default function PrivacyPolicyPage() {
  return (
    <div className="min-h-screen bg-c-bg">
      {/* Nav */}
      <nav className="fixed top-0 inset-x-0 z-50 border-b border-c-border bg-c-bg/80 backdrop-blur-lg">
        <div className="max-w-5xl mx-auto px-4 flex items-center justify-between h-14">
          <Link href="/" className="font-mono font-bold text-c-amber glow-a text-sm tracking-widest">
            HEYDPE
          </Link>
          <div className="flex items-center gap-4">
            <Link
              href="/pricing"
              className="font-mono text-xs text-c-muted hover:text-c-amber transition-colors tracking-wide"
            >
              PRICING
            </Link>
            <Link
              href="/login"
              className="font-mono text-xs text-c-muted hover:text-c-text transition-colors tracking-wide"
            >
              SIGN IN
            </Link>
            <Link
              href="/signup"
              className="font-mono text-xs px-4 py-1.5 bg-c-amber hover:bg-c-amber/90 text-c-bg rounded font-semibold tracking-wide transition-colors"
            >
              GET STARTED
            </Link>
          </div>
        </div>
      </nav>

      {/* Content */}
      <main className="pt-24 pb-20 px-4">
        <div className="max-w-3xl mx-auto">
          <p className="font-mono text-xs text-c-cyan glow-c tracking-[0.3em] uppercase mb-4">
            // LEGAL
          </p>
          <h1 className="font-mono font-bold text-3xl sm:text-4xl text-c-amber glow-a leading-tight tracking-tight uppercase mb-4">
            PRIVACY POLICY
          </h1>
          <p className="text-sm text-c-muted font-mono mb-2">
            Effective Date: February 18, 2026 &nbsp;|&nbsp; Last Updated: February 18, 2026
          </p>
          <p className="text-sm text-c-muted mb-12">
            Also see our{' '}
            <Link href="/terms" className="text-c-cyan hover:text-c-amber transition-colors underline underline-offset-2">
              Terms of Service
            </Link>
            .
          </p>

          {/* 1. Introduction */}
          <section className="mb-12">
            <h2 className="font-mono font-bold text-lg text-c-amber uppercase mb-4">
              1. Introduction
            </h2>
            <p className="text-sm text-c-text/80 leading-relaxed mb-3">
              Imagine Flying LLC (&quot;we,&quot; &quot;us,&quot; or &quot;our&quot;), a limited liability company based in
              Jacksonville, Florida, operates <strong className="text-c-text">HeyDPE</strong> (&quot;the Service&quot;), an
              AI-powered web application that simulates FAA Designated Pilot Examiner (DPE) oral
              examinations for checkride preparation.
            </p>
            <p className="text-sm text-c-text/80 leading-relaxed mb-3">
              This Privacy Policy explains how we collect, use, disclose, and safeguard your
              information when you visit our website at{' '}
              <span className="text-c-cyan font-mono text-xs">aviation-oral-exam-companion.vercel.app</span>{' '}
              or use our Service.
            </p>
            <p className="text-sm text-c-text/80 leading-relaxed">
              By using HeyDPE, you agree to the collection and use of information in accordance with
              this policy. If you do not agree, please do not use the Service.
            </p>
          </section>

          {/* 2. Information We Collect */}
          <section className="mb-12">
            <h2 className="font-mono font-bold text-lg text-c-amber uppercase mb-4">
              2. Information We Collect
            </h2>
            <p className="text-sm text-c-text/80 leading-relaxed mb-4">
              We collect the following categories of information:
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm border border-c-border rounded-lg overflow-hidden">
                <thead>
                  <tr className="bg-c-panel border-b border-c-border">
                    <th className="text-left px-4 py-2.5 font-mono text-xs text-c-amber uppercase tracking-wide">Data</th>
                    <th className="text-left px-4 py-2.5 font-mono text-xs text-c-amber uppercase tracking-wide">Source</th>
                    <th className="text-left px-4 py-2.5 font-mono text-xs text-c-amber uppercase tracking-wide">Purpose</th>
                  </tr>
                </thead>
                <tbody className="text-c-text/80">
                  <tr className="border-b border-c-border/50">
                    <td className="px-4 py-2.5">Email address</td>
                    <td className="px-4 py-2.5 text-c-muted">Registration</td>
                    <td className="px-4 py-2.5 text-c-muted">Contract performance</td>
                  </tr>
                  <tr className="border-b border-c-border/50 bg-c-panel/30">
                    <td className="px-4 py-2.5">Password (hashed)</td>
                    <td className="px-4 py-2.5 text-c-muted">Registration</td>
                    <td className="px-4 py-2.5 text-c-muted">Authentication</td>
                  </tr>
                  <tr className="border-b border-c-border/50">
                    <td className="px-4 py-2.5">Exam session data</td>
                    <td className="px-4 py-2.5 text-c-muted">App usage</td>
                    <td className="px-4 py-2.5 text-c-muted">Progress tracking</td>
                  </tr>
                  <tr className="border-b border-c-border/50 bg-c-panel/30">
                    <td className="px-4 py-2.5">Voice input (transient)</td>
                    <td className="px-4 py-2.5 text-c-muted">Microphone / STT</td>
                    <td className="px-4 py-2.5 text-c-muted">Processed client-side via Web Speech API; NOT stored</td>
                  </tr>
                  <tr className="border-b border-c-border/50">
                    <td className="px-4 py-2.5">Conversation transcripts</td>
                    <td className="px-4 py-2.5 text-c-muted">App usage</td>
                    <td className="px-4 py-2.5 text-c-muted">Sent to Anthropic API for AI assessment</td>
                  </tr>
                  <tr className="border-b border-c-border/50 bg-c-panel/30">
                    <td className="px-4 py-2.5">Payment information</td>
                    <td className="px-4 py-2.5 text-c-muted">Stripe checkout</td>
                    <td className="px-4 py-2.5 text-c-muted">Billing</td>
                  </tr>
                  <tr className="border-b border-c-border/50">
                    <td className="px-4 py-2.5">Device / browser info</td>
                    <td className="px-4 py-2.5 text-c-muted">Automatic (cookies)</td>
                    <td className="px-4 py-2.5 text-c-muted">Analytics</td>
                  </tr>
                  <tr className="border-b border-c-border/50 bg-c-panel/30">
                    <td className="px-4 py-2.5">IP address</td>
                    <td className="px-4 py-2.5 text-c-muted">Automatic</td>
                    <td className="px-4 py-2.5 text-c-muted">Security</td>
                  </tr>
                  <tr className="border-b border-c-border/50">
                    <td className="px-4 py-2.5">UTM parameters</td>
                    <td className="px-4 py-2.5 text-c-muted">URL query string</td>
                    <td className="px-4 py-2.5 text-c-muted">Marketing attribution</td>
                  </tr>
                  <tr>
                    <td className="px-4 py-2.5">Usage analytics</td>
                    <td className="px-4 py-2.5 text-c-muted">GA4, Clarity cookies</td>
                    <td className="px-4 py-2.5 text-c-muted">Product analytics</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          {/* 3. How We Use Your Information */}
          <section className="mb-12">
            <h2 className="font-mono font-bold text-lg text-c-amber uppercase mb-4">
              3. How We Use Your Information
            </h2>
            <p className="text-sm text-c-text/80 leading-relaxed mb-3">
              We use the information we collect for the following purposes:
            </p>
            <ul className="list-disc list-outside ml-5 space-y-2 text-sm text-c-text/80 leading-relaxed">
              <li>
                <strong className="text-c-text">Provide and maintain the Service</strong> — delivering
                AI-powered exam simulations, tracking your progress, and personalizing your experience.
              </li>
              <li>
                <strong className="text-c-text">Process payments</strong> — managing subscriptions,
                billing, and refunds through Stripe.
              </li>
              <li>
                <strong className="text-c-text">Analytics and improvement</strong> — understanding how
                users interact with the Service to improve features, performance, and user experience.
              </li>
              <li>
                <strong className="text-c-text">Fraud prevention and security</strong> — detecting and
                preventing unauthorized access, abuse, or security threats.
              </li>
              <li>
                <strong className="text-c-text">Legal obligations</strong> — complying with applicable
                laws, regulations, and legal processes.
              </li>
            </ul>
          </section>

          {/* 4. Third-Party Services */}
          <section className="mb-12">
            <h2 className="font-mono font-bold text-lg text-c-amber uppercase mb-4">
              4. Third-Party Services
            </h2>
            <p className="text-sm text-c-text/80 leading-relaxed mb-4">
              We share data with the following third-party service providers, each under their own
              privacy policies:
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm border border-c-border rounded-lg overflow-hidden">
                <thead>
                  <tr className="bg-c-panel border-b border-c-border">
                    <th className="text-left px-4 py-2.5 font-mono text-xs text-c-amber uppercase tracking-wide">Provider</th>
                    <th className="text-left px-4 py-2.5 font-mono text-xs text-c-amber uppercase tracking-wide">Data Shared</th>
                    <th className="text-left px-4 py-2.5 font-mono text-xs text-c-amber uppercase tracking-wide">Purpose</th>
                  </tr>
                </thead>
                <tbody className="text-c-text/80">
                  <tr className="border-b border-c-border/50">
                    <td className="px-4 py-2.5 font-medium text-c-text">Supabase</td>
                    <td className="px-4 py-2.5 text-c-muted">Email, auth data</td>
                    <td className="px-4 py-2.5 text-c-muted">Database &amp; authentication</td>
                  </tr>
                  <tr className="border-b border-c-border/50 bg-c-panel/30">
                    <td className="px-4 py-2.5 font-medium text-c-text">Anthropic Claude API</td>
                    <td className="px-4 py-2.5 text-c-muted">Conversation text</td>
                    <td className="px-4 py-2.5 text-c-muted">AI examiner responses</td>
                  </tr>
                  <tr className="border-b border-c-border/50">
                    <td className="px-4 py-2.5 font-medium text-c-text">OpenAI TTS API</td>
                    <td className="px-4 py-2.5 text-c-muted">Examiner text</td>
                    <td className="px-4 py-2.5 text-c-muted">Text-to-speech</td>
                  </tr>
                  <tr className="border-b border-c-border/50 bg-c-panel/30">
                    <td className="px-4 py-2.5 font-medium text-c-text">Stripe</td>
                    <td className="px-4 py-2.5 text-c-muted">Payment details</td>
                    <td className="px-4 py-2.5 text-c-muted">Billing</td>
                  </tr>
                  <tr className="border-b border-c-border/50">
                    <td className="px-4 py-2.5 font-medium text-c-text">Vercel</td>
                    <td className="px-4 py-2.5 text-c-muted">IP address, headers</td>
                    <td className="px-4 py-2.5 text-c-muted">Hosting</td>
                  </tr>
                  <tr className="border-b border-c-border/50 bg-c-panel/30">
                    <td className="px-4 py-2.5 font-medium text-c-text">Google Analytics (GA4)</td>
                    <td className="px-4 py-2.5 text-c-muted">Anonymized usage</td>
                    <td className="px-4 py-2.5 text-c-muted">Traffic analysis</td>
                  </tr>
                  <tr className="border-b border-c-border/50">
                    <td className="px-4 py-2.5 font-medium text-c-text">Google Ads</td>
                    <td className="px-4 py-2.5 text-c-muted">Conversion data</td>
                    <td className="px-4 py-2.5 text-c-muted">Ad attribution</td>
                  </tr>
                  <tr>
                    <td className="px-4 py-2.5 font-medium text-c-text">Microsoft Clarity</td>
                    <td className="px-4 py-2.5 text-c-muted">Click / scroll behavior</td>
                    <td className="px-4 py-2.5 text-c-muted">UX analysis</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          {/* 5. Voice Data */}
          <section className="mb-12">
            <h2 className="font-mono font-bold text-lg text-c-amber uppercase mb-4">
              5. Voice Data
            </h2>
            <div className="bezel rounded-lg p-5 border border-c-border mb-4">
              <p className="font-mono text-xs text-c-green glow-g uppercase mb-2 tracking-wide">
                Important Disclosure
              </p>
              <p className="text-sm text-c-text/80 leading-relaxed">
                HeyDPE offers an optional voice input feature powered by your browser&apos;s Web Speech
                API. Here is exactly what happens with your voice data:
              </p>
            </div>
            <ul className="list-disc list-outside ml-5 space-y-2 text-sm text-c-text/80 leading-relaxed">
              <li>
                <strong className="text-c-text">Speech recognition runs in your browser.</strong> When
                you use voice mode in Google Chrome, your audio is sent to Google&apos;s servers for
                speech-to-text conversion as part of Chrome&apos;s built-in Web Speech API. This is a
                browser feature, not a HeyDPE feature.
              </li>
              <li>
                <strong className="text-c-text">HeyDPE does NOT store your audio recordings.</strong>{' '}
                We never receive, store, or process raw audio data. Voice input is transient and
                processed entirely client-side.
              </li>
              <li>
                <strong className="text-c-text">The resulting text transcript IS sent to Anthropic.</strong>{' '}
                Once your speech is converted to text by the browser, the text is sent to the Anthropic
                Claude API to generate examiner responses and assessments.
              </li>
              <li>
                <strong className="text-c-text">You can always use text input instead.</strong> Voice
                mode is optional. You may type your answers at any time to avoid using the Web Speech
                API entirely.
              </li>
            </ul>
          </section>

          {/* 6. Data Retention */}
          <section className="mb-12">
            <h2 className="font-mono font-bold text-lg text-c-amber uppercase mb-4">
              6. Data Retention
            </h2>
            <ul className="list-disc list-outside ml-5 space-y-2 text-sm text-c-text/80 leading-relaxed">
              <li>
                <strong className="text-c-text">Account data</strong> — retained while your account is
                active, plus 30 days after account deletion to allow for recovery.
              </li>
              <li>
                <strong className="text-c-text">Payment records</strong> — retained for 7 years as
                required by tax and financial regulations.
              </li>
              <li>
                <strong className="text-c-text">Analytics data</strong> — retained for 26 months
                (Google Analytics default retention period).
              </li>
              <li>
                <strong className="text-c-text">Voice recordings</strong> — not retained. Audio is never
                stored by HeyDPE (see Section 5).
              </li>
            </ul>
          </section>

          {/* 7. Your Rights */}
          <section className="mb-12">
            <h2 className="font-mono font-bold text-lg text-c-amber uppercase mb-4">
              7. Your Rights
            </h2>
            <p className="text-sm text-c-text/80 leading-relaxed mb-4">
              Depending on your jurisdiction, you may have the following rights regarding your
              personal data:
            </p>

            <h3 className="font-mono font-semibold text-sm text-c-cyan uppercase mb-3 mt-6">
              General Rights
            </h3>
            <ul className="list-disc list-outside ml-5 space-y-2 text-sm text-c-text/80 leading-relaxed mb-6">
              <li><strong className="text-c-text">Access</strong> — request a copy of the personal data we hold about you.</li>
              <li><strong className="text-c-text">Correction</strong> — request that we correct inaccurate or incomplete data.</li>
              <li><strong className="text-c-text">Deletion</strong> — request that we delete your personal data.</li>
              <li><strong className="text-c-text">Export</strong> — receive your data in a portable, machine-readable format.</li>
              <li><strong className="text-c-text">Opt-out of analytics</strong> — disable Google Analytics and Clarity tracking via your browser settings or cookie preferences.</li>
            </ul>

            <h3 className="font-mono font-semibold text-sm text-c-cyan uppercase mb-3">
              CCPA Rights (California Residents)
            </h3>
            <ul className="list-disc list-outside ml-5 space-y-2 text-sm text-c-text/80 leading-relaxed mb-4">
              <li><strong className="text-c-text">Right to know</strong> — what personal information we collect, use, and disclose.</li>
              <li><strong className="text-c-text">Right to delete</strong> — request deletion of your personal information.</li>
              <li><strong className="text-c-text">Right to opt-out of sale</strong> — HeyDPE does <strong className="text-c-green">NOT</strong> sell your personal data to third parties.</li>
              <li><strong className="text-c-text">Non-discrimination</strong> — we will not discriminate against you for exercising your CCPA rights.</li>
            </ul>

            <h3 className="font-mono font-semibold text-sm text-c-cyan uppercase mb-3">
              GDPR Rights (EEA/UK Residents)
            </h3>
            <ul className="list-disc list-outside ml-5 space-y-2 text-sm text-c-text/80 leading-relaxed">
              <li><strong className="text-c-text">Data portability</strong> — receive your data in a structured, commonly used format.</li>
              <li><strong className="text-c-text">Restrict processing</strong> — request that we limit how we use your data.</li>
              <li><strong className="text-c-text">Object to processing</strong> — object to our processing of your personal data.</li>
              <li><strong className="text-c-text">Lodge a complaint</strong> — file a complaint with your local data protection authority.</li>
              <li><strong className="text-c-text">Withdraw consent</strong> — withdraw your consent at any time where processing is based on consent.</li>
            </ul>

            <p className="text-sm text-c-text/80 leading-relaxed mt-4">
              To exercise any of these rights, contact us at{' '}
              <a href="mailto:pd@imagineflying.com" className="text-c-cyan hover:text-c-amber transition-colors underline underline-offset-2">
                pd@imagineflying.com
              </a>.
            </p>
          </section>

          {/* 8. Children's Privacy */}
          <section className="mb-12">
            <h2 className="font-mono font-bold text-lg text-c-amber uppercase mb-4">
              8. Children&apos;s Privacy
            </h2>
            <p className="text-sm text-c-text/80 leading-relaxed">
              HeyDPE is not directed at children under the age of 13. We do not knowingly collect
              personal information from children under 13. If you are a parent or guardian and believe
              your child has provided us with personal data, please contact us at{' '}
              <a href="mailto:pd@imagineflying.com" className="text-c-cyan hover:text-c-amber transition-colors underline underline-offset-2">
                pd@imagineflying.com
              </a>{' '}
              and we will take steps to delete such information.
            </p>
          </section>

          {/* 9. Security */}
          <section className="mb-12">
            <h2 className="font-mono font-bold text-lg text-c-amber uppercase mb-4">
              9. Security
            </h2>
            <p className="text-sm text-c-text/80 leading-relaxed mb-3">
              We implement industry-standard security measures to protect your personal data:
            </p>
            <ul className="list-disc list-outside ml-5 space-y-2 text-sm text-c-text/80 leading-relaxed">
              <li><strong className="text-c-text">TLS encryption</strong> — all data in transit is encrypted using TLS (HTTPS).</li>
              <li><strong className="text-c-text">Encryption at rest</strong> — database data is encrypted at rest via Supabase infrastructure.</li>
              <li><strong className="text-c-text">Password hashing</strong> — passwords are hashed using bcrypt and never stored in plaintext.</li>
              <li><strong className="text-c-text">Row-Level Security (RLS)</strong> — database access policies ensure users can only access their own data.</li>
            </ul>
            <p className="text-sm text-c-text/80 leading-relaxed mt-3">
              While we strive to use commercially acceptable means to protect your personal data, no
              method of transmission over the Internet or electronic storage is 100% secure.
            </p>
          </section>

          {/* 10. Changes to This Policy */}
          <section className="mb-12">
            <h2 className="font-mono font-bold text-lg text-c-amber uppercase mb-4">
              10. Changes to This Policy
            </h2>
            <p className="text-sm text-c-text/80 leading-relaxed">
              We may update this Privacy Policy from time to time. When we do, we will notify you by
              email at the address associated with your account and update the &quot;Last Updated&quot; date
              at the top of this page. Your continued use of the Service after any changes constitutes
              your acceptance of the updated policy. We encourage you to review this page periodically.
            </p>
          </section>

          {/* 11. Contact */}
          <section className="mb-4">
            <h2 className="font-mono font-bold text-lg text-c-amber uppercase mb-4">
              11. Contact
            </h2>
            <p className="text-sm text-c-text/80 leading-relaxed mb-3">
              If you have questions or concerns about this Privacy Policy, please contact us:
            </p>
            <div className="bezel rounded-lg p-5 border border-c-border">
              <p className="text-sm text-c-text leading-relaxed">
                <strong>Imagine Flying LLC</strong>
                <br />
                Jacksonville, FL
                <br />
                Email:{' '}
                <a href="mailto:pd@imagineflying.com" className="text-c-cyan hover:text-c-amber transition-colors underline underline-offset-2">
                  pd@imagineflying.com
                </a>
              </p>
            </div>
          </section>
        </div>
      </main>

      {/* Footer */}
      <footer className="py-10 px-4 border-t border-c-border">
        <div className="max-w-4xl mx-auto">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mb-6">
            <Link href="/" className="font-mono font-bold text-c-amber glow-a text-sm tracking-widest">
              HEYDPE
            </Link>
            <div className="flex items-center gap-6 text-xs font-mono text-c-muted">
              <Link href="/pricing" className="hover:text-c-amber transition-colors">PRICING</Link>
              <Link href="/login" className="hover:text-c-text transition-colors">SIGN IN</Link>
              <Link href="/signup" className="hover:text-c-text transition-colors">GET STARTED</Link>
            </div>
          </div>
          <div className="flex justify-center gap-6 text-xs font-mono text-c-muted mb-6">
            <Link href="/privacy" className="hover:text-c-amber transition-colors">PRIVACY POLICY</Link>
            <Link href="/terms" className="hover:text-c-amber transition-colors">TERMS OF SERVICE</Link>
          </div>
          <p className="text-[10px] text-c-muted text-center leading-relaxed max-w-xl mx-auto font-mono">
            FOR STUDY PURPOSES ONLY. NOT A SUBSTITUTE FOR INSTRUCTION FROM A CERTIFICATED
            FLIGHT INSTRUCTOR (CFI) OR AN ACTUAL DPE CHECKRIDE. ALWAYS VERIFY INFORMATION
            AGAINST CURRENT FAA PUBLICATIONS. HEYDPE IS A PRODUCT OF IMAGINE FLYING LLC,
            JACKSONVILLE, FL.
          </p>
        </div>
      </footer>
    </div>
  );
}
