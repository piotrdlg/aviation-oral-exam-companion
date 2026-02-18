import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Terms of Service — HeyDPE',
  description:
    'Terms of Service for HeyDPE, the AI checkride oral exam simulator by Imagine Flying LLC. Review the terms governing your use of the Service.',
  metadataBase: new URL('https://aviation-oral-exam-companion.vercel.app'),
  alternates: {
    canonical: '/terms',
  },
};

export default function TermsOfServicePage() {
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
            TERMS OF SERVICE
          </h1>
          <p className="text-sm text-c-muted font-mono mb-2">
            Effective Date: February 18, 2026 &nbsp;|&nbsp; Last Updated: February 18, 2026
          </p>
          <p className="text-sm text-c-muted mb-12">
            Also see our{' '}
            <Link href="/privacy" className="text-c-cyan hover:text-c-amber transition-colors underline underline-offset-2">
              Privacy Policy
            </Link>
            .
          </p>

          {/* 1. Acceptance of Terms */}
          <section className="mb-12">
            <h2 className="font-mono font-bold text-lg text-c-amber uppercase mb-4">
              1. Acceptance of Terms
            </h2>
            <p className="text-sm text-c-text/80 leading-relaxed mb-3">
              By creating an account on HeyDPE (&quot;the Service&quot;), operated by Imagine Flying LLC
              (&quot;we,&quot; &quot;us,&quot; or &quot;our&quot;), you agree to be bound by these Terms of Service
              (&quot;Terms&quot;). If you do not agree to these Terms, do not create an account or use the
              Service.
            </p>
            <p className="text-sm text-c-text/80 leading-relaxed">
              You must be at least 13 years of age to use HeyDPE. By using the Service, you represent
              and warrant that you are at least 13 years old.
            </p>
          </section>

          {/* 2. Service Description */}
          <section className="mb-12">
            <h2 className="font-mono font-bold text-lg text-c-amber uppercase mb-4">
              2. Service Description
            </h2>
            <p className="text-sm text-c-text/80 leading-relaxed mb-3">
              HeyDPE is an AI-powered practice tool that simulates FAA Designated Pilot Examiner (DPE)
              oral examinations for checkride preparation. The Service supports Private Pilot
              (FAA-S-ACS-6C), Commercial Pilot (FAA-S-ACS-7B), and Instrument Rating (FAA-S-ACS-8C).
            </p>
            <div className="bezel rounded-lg p-5 border border-c-border">
              <p className="font-mono text-xs text-c-amber glow-a uppercase mb-2 tracking-wide">
                Important Disclaimers
              </p>
              <ul className="list-disc list-outside ml-5 space-y-2 text-sm text-c-text/80 leading-relaxed">
                <li>
                  HeyDPE is <strong className="text-c-text">NOT a substitute</strong> for instruction
                  from a Certificated Flight Instructor (CFI).
                </li>
                <li>
                  HeyDPE is <strong className="text-c-text">NOT an official FAA assessment</strong> and
                  does not grant any certificate, rating, or endorsement.
                </li>
                <li>
                  HeyDPE does <strong className="text-c-text">NOT guarantee</strong> success on any
                  checkride or practical test.
                </li>
                <li>
                  Always verify information against <strong className="text-c-text">current FAA
                  publications</strong> (PHAK, AFH, AIM, 14 CFR, ACS documents).
                </li>
              </ul>
            </div>
          </section>

          {/* 3. Account Terms */}
          <section className="mb-12">
            <h2 className="font-mono font-bold text-lg text-c-amber uppercase mb-4">
              3. Account Terms
            </h2>
            <ul className="list-disc list-outside ml-5 space-y-2 text-sm text-c-text/80 leading-relaxed">
              <li>
                <strong className="text-c-text">One account per person.</strong> Each account is for a
                single individual. You may not share your account credentials with others.
              </li>
              <li>
                <strong className="text-c-text">Account security.</strong> You are responsible for
                maintaining the security of your account and password. We cannot and will not be liable
                for any loss or damage from your failure to comply with this obligation.
              </li>
              <li>
                <strong className="text-c-text">Accurate information.</strong> You must provide accurate
                and complete information when creating your account and keep it up to date.
              </li>
            </ul>
          </section>

          {/* 4. Free Trial & Subscription */}
          <section className="mb-12">
            <h2 className="font-mono font-bold text-lg text-c-amber uppercase mb-4">
              4. Free Trial &amp; Subscription
            </h2>
            <p className="text-sm text-c-text/80 leading-relaxed mb-4">
              HeyDPE offers free limited sessions for new users. For full access, the following
              subscription plans are available:
            </p>
            <div className="overflow-x-auto mb-4">
              <table className="w-full text-sm border border-c-border rounded-lg overflow-hidden">
                <thead>
                  <tr className="bg-c-panel border-b border-c-border">
                    <th className="text-left px-4 py-2.5 font-mono text-xs text-c-amber uppercase tracking-wide">Plan</th>
                    <th className="text-left px-4 py-2.5 font-mono text-xs text-c-amber uppercase tracking-wide">Price</th>
                    <th className="text-left px-4 py-2.5 font-mono text-xs text-c-amber uppercase tracking-wide">Billing</th>
                  </tr>
                </thead>
                <tbody className="text-c-text/80">
                  <tr className="border-b border-c-border/50">
                    <td className="px-4 py-2.5 font-medium text-c-text">Monthly</td>
                    <td className="px-4 py-2.5">$39/month</td>
                    <td className="px-4 py-2.5 text-c-muted">Billed monthly</td>
                  </tr>
                  <tr>
                    <td className="px-4 py-2.5 font-medium text-c-text">Annual</td>
                    <td className="px-4 py-2.5">$299/year</td>
                    <td className="px-4 py-2.5 text-c-muted">Billed annually</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <ul className="list-disc list-outside ml-5 space-y-2 text-sm text-c-text/80 leading-relaxed">
              <li>All payments are processed securely through <strong className="text-c-text">Stripe</strong>.</li>
              <li>Subscriptions <strong className="text-c-text">auto-renew</strong> at the end of each billing period.</li>
              <li>You may <strong className="text-c-text">cancel at any time</strong> from your account settings.</li>
              <li>Upon cancellation, you retain access until the <strong className="text-c-text">end of your current billing period</strong>.</li>
            </ul>
          </section>

          {/* 5. Refund Policy */}
          <section className="mb-12">
            <h2 className="font-mono font-bold text-lg text-c-amber uppercase mb-4">
              5. Refund Policy
            </h2>
            <div className="bezel rounded-lg p-5 border border-c-border">
              <p className="text-sm text-c-text/80 leading-relaxed">
                We offer a <strong className="text-c-green">full refund within 7 days</strong> of your
                first payment, no questions asked. To request a refund, contact us at{' '}
                <a href="mailto:pd@imagineflying.com" className="text-c-cyan hover:text-c-amber transition-colors underline underline-offset-2">
                  pd@imagineflying.com
                </a>{' '}
                with your account email and we will process your refund promptly.
              </p>
            </div>
          </section>

          {/* 6. Acceptable Use */}
          <section className="mb-12">
            <h2 className="font-mono font-bold text-lg text-c-amber uppercase mb-4">
              6. Acceptable Use
            </h2>
            <p className="text-sm text-c-text/80 leading-relaxed mb-3">
              You agree to use HeyDPE only for its intended purpose: personal checkride preparation.
              You may not:
            </p>
            <ul className="list-disc list-outside ml-5 space-y-2 text-sm text-c-text/80 leading-relaxed">
              <li><strong className="text-c-text">Share your account</strong> or credentials with others.</li>
              <li><strong className="text-c-text">Reverse engineer</strong>, decompile, disassemble, or otherwise attempt to derive the source code of the Service.</li>
              <li><strong className="text-c-text">Use the Service for commercial purposes</strong> (e.g., reselling, training materials for sale) without a separate license from us.</li>
              <li><strong className="text-c-text">Submit harmful content</strong> — including content that is abusive, threatening, defamatory, or that could damage the Service or other users.</li>
              <li>Use the Service to <strong className="text-c-text">scrape, crawl, or extract data</strong> systematically.</li>
              <li>Attempt to <strong className="text-c-text">bypass security measures</strong> or access unauthorized areas of the Service.</li>
            </ul>
          </section>

          {/* 7. Intellectual Property */}
          <section className="mb-12">
            <h2 className="font-mono font-bold text-lg text-c-amber uppercase mb-4">
              7. Intellectual Property
            </h2>
            <ul className="list-disc list-outside ml-5 space-y-2 text-sm text-c-text/80 leading-relaxed">
              <li>
                <strong className="text-c-text">HeyDPE owns the Service.</strong> The Service, including
                its design, software, AI prompts, branding, and all related intellectual property, is
                owned by Imagine Flying LLC. All rights reserved.
              </li>
              <li>
                <strong className="text-c-text">ACS content is public domain.</strong> The FAA Airman
                Certification Standards (ACS) documents referenced by the Service are U.S. government
                publications in the public domain.
              </li>
              <li>
                <strong className="text-c-text">You own your answers.</strong> Your responses during exam
                sessions remain your property.
              </li>
              <li>
                <strong className="text-c-text">License for anonymized data.</strong> By using the
                Service, you grant HeyDPE a non-exclusive, royalty-free license to use anonymized,
                aggregated data derived from your usage to improve the Service.
              </li>
            </ul>
          </section>

          {/* 8. Disclaimer of Warranties */}
          <section className="mb-12">
            <h2 className="font-mono font-bold text-lg text-c-amber uppercase mb-4">
              8. Disclaimer of Warranties
            </h2>
            <div className="bezel rounded-lg p-5 border border-c-border">
              <p className="text-sm text-c-text/80 leading-relaxed mb-3">
                THE SERVICE IS PROVIDED <strong className="text-c-amber">&quot;AS IS&quot;</strong> AND{' '}
                <strong className="text-c-amber">&quot;AS AVAILABLE&quot;</strong> WITHOUT WARRANTIES OF ANY KIND,
                EITHER EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO WARRANTIES OF MERCHANTABILITY,
                FITNESS FOR A PARTICULAR PURPOSE, AND NON-INFRINGEMENT.
              </p>
              <ul className="list-disc list-outside ml-5 space-y-2 text-sm text-c-text/80 leading-relaxed">
                <li>
                  We make <strong className="text-c-text">no warranty regarding the accuracy</strong> of
                  AI-generated content. AI responses may contain errors or outdated information.
                </li>
                <li>
                  We make <strong className="text-c-text">no warranty regarding uptime</strong> or
                  uninterrupted availability of the Service.
                </li>
                <li>
                  We are <strong className="text-c-text">not responsible for checkride outcomes.</strong>{' '}
                  HeyDPE is a practice tool and your exam results depend on many factors beyond the
                  scope of this Service.
                </li>
              </ul>
            </div>
          </section>

          {/* 9. Limitation of Liability */}
          <section className="mb-12">
            <h2 className="font-mono font-bold text-lg text-c-amber uppercase mb-4">
              9. Limitation of Liability
            </h2>
            <p className="text-sm text-c-text/80 leading-relaxed mb-3">
              TO THE MAXIMUM EXTENT PERMITTED BY APPLICABLE LAW:
            </p>
            <ul className="list-disc list-outside ml-5 space-y-2 text-sm text-c-text/80 leading-relaxed">
              <li>
                Our total liability to you for all claims arising from or related to the Service shall
                not exceed the <strong className="text-c-text">total fees paid by you in the 12 months
                preceding the claim</strong>.
              </li>
              <li>
                We shall not be liable for any <strong className="text-c-text">indirect, incidental,
                special, consequential, or punitive damages</strong>, including but not limited to loss
                of profits, data, or goodwill.
              </li>
              <li>
                We shall not be liable for any damages arising from your{' '}
                <strong className="text-c-text">reliance on AI-generated content</strong>, including but
                not limited to decisions made based on AI responses during exam sessions.
              </li>
            </ul>
          </section>

          {/* 10. Indemnification */}
          <section className="mb-12">
            <h2 className="font-mono font-bold text-lg text-c-amber uppercase mb-4">
              10. Indemnification
            </h2>
            <p className="text-sm text-c-text/80 leading-relaxed">
              You agree to indemnify and hold harmless Imagine Flying LLC, its officers, directors,
              employees, and agents from any claims, damages, losses, liabilities, and expenses
              (including reasonable attorney&apos;s fees) arising out of or related to: (a) your use of the
              Service; (b) your violation of these Terms; or (c) your reliance on AI-generated content
              for any purpose, including checkride preparation.
            </p>
          </section>

          {/* 11. Governing Law */}
          <section className="mb-12">
            <h2 className="font-mono font-bold text-lg text-c-amber uppercase mb-4">
              11. Governing Law
            </h2>
            <p className="text-sm text-c-text/80 leading-relaxed">
              These Terms shall be governed by and construed in accordance with the laws of the{' '}
              <strong className="text-c-text">State of Florida</strong>, without regard to its conflict
              of law provisions. Any legal action or proceeding arising under these Terms shall be
              brought exclusively in the state or federal courts located in{' '}
              <strong className="text-c-text">Duval County, Florida</strong>, and you consent to the
              personal jurisdiction of such courts.
            </p>
          </section>

          {/* 12. Changes to Terms */}
          <section className="mb-12">
            <h2 className="font-mono font-bold text-lg text-c-amber uppercase mb-4">
              12. Changes to Terms
            </h2>
            <p className="text-sm text-c-text/80 leading-relaxed">
              We reserve the right to modify these Terms at any time. We will provide at least{' '}
              <strong className="text-c-text">30 days&apos; notice</strong> before any material changes take
              effect by sending an email to the address associated with your account. Your continued
              use of the Service after the effective date of any changes constitutes your acceptance
              of the updated Terms.
            </p>
          </section>

          {/* 13. Contact */}
          <section className="mb-4">
            <h2 className="font-mono font-bold text-lg text-c-amber uppercase mb-4">
              13. Contact
            </h2>
            <p className="text-sm text-c-text/80 leading-relaxed mb-3">
              If you have questions about these Terms, please contact us:
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
