import type { Metadata } from 'next';
import Link from 'next/link';
import Footer from '@/components/Footer';
import { Logo } from '@/components/Brand';

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
          <Logo size="md" href="/" glow />
          <div className="flex items-center gap-2 sm:gap-5">
            <Link
              href="/pricing"
              className="text-sm text-c-muted hover:text-c-text transition-colors px-2"
            >
              Pricing
            </Link>
            <Link
              href="/login"
              className="text-sm text-c-muted hover:text-c-text transition-colors px-2"
            >
              Sign in
            </Link>
            <Link
              href="/signup"
              className="text-sm px-4 py-1.5 bg-c-amber hover:bg-c-amber-bright text-c-bg rounded-lg font-semibold transition-colors"
            >
              Get started
            </Link>
          </div>
        </div>
      </nav>

      {/* Content */}
      <main className="pt-24 pb-20 px-4">
        <div className="max-w-3xl mx-auto">
          <p className="font-mono text-xs text-c-cyan tracking-[0.3em] uppercase mb-4">
            // Legal
          </p>
          <h1 className="font-bold text-4xl sm:text-5xl text-c-text leading-tight tracking-tight mb-4">
            Privacy policy
          </h1>
          <p className="text-sm text-c-muted mb-2">
            Effective date: February 18, 2026 &nbsp;|&nbsp; Last updated: June 15, 2026
          </p>
          <p className="text-sm text-c-muted mb-12">
            Also see our{' '}
            <Link href="/terms" className="text-c-cyan-readable hover:text-c-cyan transition-colors underline underline-offset-2">
              Terms of Service
            </Link>
            .
          </p>

          {/* 1. Introduction */}
          <section className="mb-12">
            <h2 className="font-bold text-xl sm:text-2xl text-c-text tracking-tight mb-4">
              1. Introduction
            </h2>
            <p className="text-sm text-c-muted leading-relaxed mb-3">
              Imagine Flying LLC (&quot;we,&quot; &quot;us,&quot; or &quot;our&quot;), a limited liability company based in
              Jacksonville, Florida, operates <strong className="text-c-text">HeyDPE</strong> (&quot;the Service&quot;), an
              AI-powered web application that simulates FAA Designated Pilot Examiner (DPE) oral
              examinations for checkride preparation.
            </p>
            <p className="text-sm text-c-muted leading-relaxed mb-3">
              This Privacy Policy explains how we collect, use, disclose, and safeguard your
              information when you visit our website at{' '}
              <span className="text-c-cyan-readable font-mono text-xs">aviation-oral-exam-companion.vercel.app</span>{' '}
              or use our Service.
            </p>
            <p className="text-sm text-c-muted leading-relaxed">
              By using HeyDPE, you agree to the collection and use of information in accordance with
              this policy. If you do not agree, please do not use the Service.
            </p>
          </section>

          {/* 2. Information We Collect */}
          <section className="mb-12">
            <h2 className="font-bold text-xl sm:text-2xl text-c-text tracking-tight mb-4">
              2. Information we collect
            </h2>
            <p className="text-sm text-c-muted leading-relaxed mb-4">
              We collect the following categories of information:
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm border border-c-border rounded-lg overflow-hidden">
                <thead>
                  <tr className="bg-c-panel border-b border-c-border">
                    <th className="text-left px-4 py-2.5 text-sm font-semibold text-c-text">Data</th>
                    <th className="text-left px-4 py-2.5 text-sm font-semibold text-c-text">Source</th>
                    <th className="text-left px-4 py-2.5 text-sm font-semibold text-c-text">Purpose</th>
                  </tr>
                </thead>
                <tbody className="text-c-muted">
                  <tr className="border-b border-c-border/50">
                    <td className="px-4 py-2.5">Email address</td>
                    <td className="px-4 py-2.5 text-c-muted">Registration</td>
                    <td className="px-4 py-2.5 text-c-muted">Contract performance</td>
                  </tr>
                  <tr className="border-b border-c-border/50 bg-c-panel/30">
                    <td className="px-4 py-2.5">Authentication method</td>
                    <td className="px-4 py-2.5 text-c-muted">One-time email code or OAuth (Google / Apple / Microsoft)</td>
                    <td className="px-4 py-2.5 text-c-muted">Passwordless sign-in — we do not store passwords</td>
                  </tr>
                  <tr className="border-b border-c-border/50">
                    <td className="px-4 py-2.5">Exam session data</td>
                    <td className="px-4 py-2.5 text-c-muted">App usage</td>
                    <td className="px-4 py-2.5 text-c-muted">Progress tracking</td>
                  </tr>
                  <tr className="border-b border-c-border/50 bg-c-panel/30">
                    <td className="px-4 py-2.5">Voice input (transient)</td>
                    <td className="px-4 py-2.5 text-c-muted">Microphone</td>
                    <td className="px-4 py-2.5 text-c-muted">Streamed to Deepgram for speech-to-text; raw audio not stored</td>
                  </tr>
                  <tr className="border-b border-c-border/50">
                    <td className="px-4 py-2.5">Conversation transcripts</td>
                    <td className="px-4 py-2.5 text-c-muted">App usage</td>
                    <td className="px-4 py-2.5 text-c-muted">Sent to Anthropic Claude for examiner responses &amp; assessment; stored as exam history</td>
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
                    <td className="px-4 py-2.5 text-c-muted">PostHog, Google Analytics 4</td>
                    <td className="px-4 py-2.5 text-c-muted">Product analytics</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          {/* 3. How We Use Your Information */}
          <section className="mb-12">
            <h2 className="font-bold text-xl sm:text-2xl text-c-text tracking-tight mb-4">
              3. How we use your information
            </h2>
            <p className="text-sm text-c-muted leading-relaxed mb-3">
              We use the information we collect for the following purposes:
            </p>
            <ul className="list-disc list-outside ml-5 space-y-2 text-sm text-c-muted leading-relaxed">
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
            <h2 className="font-bold text-xl sm:text-2xl text-c-text tracking-tight mb-4">
              4. Third-party services
            </h2>
            <p className="text-sm text-c-muted leading-relaxed mb-4">
              We share data with the following third-party service providers (sub-processors), each
              under their own privacy policies and our agreements with them:
            </p>
            {/* LAWYER REVIEW: this table reflects the sub-processors actually integrated in the
                product as of June 2026. Confirm that data-processing agreements (DPAs) are in place
                for each, and that none use customer content to train their models in a way that
                requires additional disclosure or consent. */}
            <div className="overflow-x-auto">
              <table className="w-full text-sm border border-c-border rounded-lg overflow-hidden">
                <thead>
                  <tr className="bg-c-panel border-b border-c-border">
                    <th className="text-left px-4 py-2.5 text-sm font-semibold text-c-text">Provider</th>
                    <th className="text-left px-4 py-2.5 text-sm font-semibold text-c-text">Data shared</th>
                    <th className="text-left px-4 py-2.5 text-sm font-semibold text-c-text">Purpose</th>
                  </tr>
                </thead>
                <tbody className="text-c-muted">
                  <tr className="border-b border-c-border/50">
                    <td className="px-4 py-2.5 font-medium text-c-text">Supabase</td>
                    <td className="px-4 py-2.5 text-c-muted">Email, authentication data, exam transcripts &amp; session data</td>
                    <td className="px-4 py-2.5 text-c-muted">Database, authentication &amp; storage</td>
                  </tr>
                  <tr className="border-b border-c-border/50 bg-c-panel/30">
                    <td className="px-4 py-2.5 font-medium text-c-text">Anthropic (Claude API)</td>
                    <td className="px-4 py-2.5 text-c-muted">Conversation transcripts, your answers, retrieved reference text</td>
                    <td className="px-4 py-2.5 text-c-muted">AI examiner questions &amp; answer assessment</td>
                  </tr>
                  <tr className="border-b border-c-border/50">
                    <td className="px-4 py-2.5 font-medium text-c-text">Deepgram</td>
                    <td className="px-4 py-2.5 text-c-muted">Voice audio (speech-to-text); examiner text (text-to-speech)</td>
                    <td className="px-4 py-2.5 text-c-muted">Speech recognition (Nova-3) &amp; speech synthesis (Aura-2)</td>
                  </tr>
                  <tr className="border-b border-c-border/50 bg-c-panel/30">
                    <td className="px-4 py-2.5 font-medium text-c-text">OpenAI</td>
                    <td className="px-4 py-2.5 text-c-muted">Exam text (embeddings); examiner text (TTS fallback)</td>
                    <td className="px-4 py-2.5 text-c-muted">Document retrieval (RAG) &amp; backup speech synthesis</td>
                  </tr>
                  <tr className="border-b border-c-border/50">
                    <td className="px-4 py-2.5 font-medium text-c-text">Stripe</td>
                    <td className="px-4 py-2.5 text-c-muted">Payment details</td>
                    <td className="px-4 py-2.5 text-c-muted">Billing &amp; subscriptions</td>
                  </tr>
                  <tr className="border-b border-c-border/50 bg-c-panel/30">
                    <td className="px-4 py-2.5 font-medium text-c-text">Resend</td>
                    <td className="px-4 py-2.5 text-c-muted">Email address</td>
                    <td className="px-4 py-2.5 text-c-muted">Transactional &amp; notification email</td>
                  </tr>
                  <tr className="border-b border-c-border/50">
                    <td className="px-4 py-2.5 font-medium text-c-text">Vercel</td>
                    <td className="px-4 py-2.5 text-c-muted">IP address, request headers</td>
                    <td className="px-4 py-2.5 text-c-muted">Hosting &amp; delivery</td>
                  </tr>
                  <tr className="border-b border-c-border/50 bg-c-panel/30">
                    <td className="px-4 py-2.5 font-medium text-c-text">Google Analytics 4 (via Google Tag Manager)</td>
                    <td className="px-4 py-2.5 text-c-muted">Anonymized usage events</td>
                    <td className="px-4 py-2.5 text-c-muted">Traffic analysis (consent-gated)</td>
                  </tr>
                  <tr className="border-b border-c-border/50">
                    <td className="px-4 py-2.5 font-medium text-c-text">Google Ads (via Google Tag Manager)</td>
                    <td className="px-4 py-2.5 text-c-muted">Conversion events</td>
                    <td className="px-4 py-2.5 text-c-muted">Advertising attribution (consent-gated)</td>
                  </tr>
                  <tr className="border-b border-c-border/50 bg-c-panel/30">
                    <td className="px-4 py-2.5 font-medium text-c-text">PostHog</td>
                    <td className="px-4 py-2.5 text-c-muted">Product usage events</td>
                    <td className="px-4 py-2.5 text-c-muted">Product analytics (consent-gated)</td>
                  </tr>
                  <tr>
                    <td className="px-4 py-2.5 font-medium text-c-text">Sentry</td>
                    <td className="px-4 py-2.5 text-c-muted">Error / diagnostic context (no personal data)</td>
                    <td className="px-4 py-2.5 text-c-muted">Error monitoring (when enabled)</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          {/* 5. Voice Data */}
          <section className="mb-12">
            <h2 className="font-bold text-xl sm:text-2xl text-c-text tracking-tight mb-4">
              5. Voice data
            </h2>
            <div className="bezel rounded-lg p-5 border border-c-border mb-4">
              <p className="text-sm font-semibold text-c-text mb-2">
                Important disclosure
              </p>
              <p className="text-sm text-c-muted leading-relaxed">
                HeyDPE offers an optional voice mode. Here is exactly what happens with your voice
                data:
              </p>
            </div>
            <ul className="list-disc list-outside ml-5 space-y-2 text-sm text-c-muted leading-relaxed">
              <li>
                <strong className="text-c-text">Your speech is transcribed by Deepgram.</strong> When
                you use voice mode, your microphone audio is streamed over an encrypted connection to
                Deepgram, our speech-to-text provider (the Deepgram Nova-3 model), which converts it
                to text. Transcription happens on Deepgram&apos;s servers, not in your browser.
              </li>
              <li>
                <strong className="text-c-text">HeyDPE does NOT store your audio recordings.</strong>{' '}
                Your audio is streamed for real-time transcription only and is not saved by HeyDPE.
                {/* LAWYER REVIEW: HeyDPE does not retain raw audio. Deepgram processes the audio
                    under its own privacy terms / our agreement; confirm whether to state Deepgram's
                    retention or model-training posture explicitly. */}
              </li>
              <li>
                <strong className="text-c-text">The text transcript is sent to Anthropic.</strong>{' '}
                Once your speech is converted to text, the transcript is sent to the Anthropic Claude
                API to generate examiner questions and assess your answers, and is stored in your
                exam history so you can review your progress.
              </li>
              <li>
                <strong className="text-c-text">Examiner replies are synthesized as speech.</strong>{' '}
                The examiner&apos;s text responses are converted to audio by Deepgram&apos;s
                text-to-speech service (the Aura-2 model), with OpenAI used as an automatic fallback
                if Deepgram is briefly unavailable.
              </li>
              <li>
                <strong className="text-c-text">You can always use text input instead.</strong> Voice
                mode is optional. You may type your answers at any time, in which case no microphone
                audio is captured or transmitted.
              </li>
            </ul>
          </section>

          {/* 6. Data Retention */}
          <section className="mb-12">
            <h2 className="font-bold text-xl sm:text-2xl text-c-text tracking-tight mb-4">
              6. Data retention
            </h2>
            <ul className="list-disc list-outside ml-5 space-y-2 text-sm text-c-muted leading-relaxed">
              <li>
                <strong className="text-c-text">Account &amp; exam data</strong> — including your
                conversation transcripts and progress, retained while your account is active, plus 30
                days after account deletion to allow for recovery.
              </li>
              <li>
                <strong className="text-c-text">Payment records</strong> — retained for 7 years as
                required by tax and financial regulations.
              </li>
              <li>
                <strong className="text-c-text">Analytics data</strong> — retained per our analytics
                providers&apos; default retention periods (e.g., Google Analytics&apos; 26-month default).
              </li>
              <li>
                <strong className="text-c-text">Voice recordings (raw audio)</strong> — not retained.
                Audio is streamed to Deepgram for transcription only and is never stored by HeyDPE
                (see Section 5). Text transcripts of your answers are retained with your exam history.
              </li>
            </ul>
          </section>

          {/* 7. Your Rights */}
          <section className="mb-12">
            <h2 className="font-bold text-xl sm:text-2xl text-c-text tracking-tight mb-4">
              7. Your rights
            </h2>
            <p className="text-sm text-c-muted leading-relaxed mb-4">
              Depending on your jurisdiction, you may have the following rights regarding your
              personal data:
            </p>

            <h3 className="font-semibold text-base text-c-text tracking-tight mb-3 mt-6">
              General rights
            </h3>
            <ul className="list-disc list-outside ml-5 space-y-2 text-sm text-c-muted leading-relaxed mb-6">
              <li><strong className="text-c-text">Access</strong> — request a copy of the personal data we hold about you.</li>
              <li><strong className="text-c-text">Correction</strong> — request that we correct inaccurate or incomplete data.</li>
              <li><strong className="text-c-text">Deletion</strong> — request that we delete your personal data.</li>
              <li><strong className="text-c-text">Export</strong> — receive your data in a portable, machine-readable format.</li>
              <li><strong className="text-c-text">Opt-out of analytics</strong> — disable analytics and advertising tracking (PostHog, Google Analytics, Google Ads) via the cookie-consent banner or your browser settings.</li>
            </ul>

            <h3 className="font-semibold text-base text-c-text tracking-tight mb-3">
              CCPA rights (California residents)
            </h3>
            <ul className="list-disc list-outside ml-5 space-y-2 text-sm text-c-muted leading-relaxed mb-4">
              <li><strong className="text-c-text">Right to know</strong> — what personal information we collect, use, and disclose.</li>
              <li><strong className="text-c-text">Right to delete</strong> — request deletion of your personal information.</li>
              <li><strong className="text-c-text">Right to opt-out of sale</strong> — HeyDPE does <strong className="text-c-green">NOT</strong> sell your personal data to third parties.</li>
              <li><strong className="text-c-text">Non-discrimination</strong> — we will not discriminate against you for exercising your CCPA rights.</li>
            </ul>

            <h3 className="font-semibold text-base text-c-text tracking-tight mb-3">
              GDPR rights (EEA/UK residents)
            </h3>
            {/* LAWYER REVIEW: several sub-processors (Anthropic, Deepgram, OpenAI, Stripe, Vercel,
                Google) process data in the United States. Confirm whether an international-transfer
                mechanism (e.g., Standard Contractual Clauses) and a transfer disclosure should be
                added here for EEA/UK users. */}
            <ul className="list-disc list-outside ml-5 space-y-2 text-sm text-c-muted leading-relaxed">
              <li><strong className="text-c-text">Data portability</strong> — receive your data in a structured, commonly used format.</li>
              <li><strong className="text-c-text">Restrict processing</strong> — request that we limit how we use your data.</li>
              <li><strong className="text-c-text">Object to processing</strong> — object to our processing of your personal data.</li>
              <li><strong className="text-c-text">Lodge a complaint</strong> — file a complaint with your local data protection authority.</li>
              <li><strong className="text-c-text">Withdraw consent</strong> — withdraw your consent at any time where processing is based on consent.</li>
            </ul>

            <p className="text-sm text-c-muted leading-relaxed mt-4">
              To exercise any of these rights, contact us at{' '}
              <a href="mailto:pd@imagineflying.com" className="text-c-cyan-readable hover:text-c-cyan transition-colors underline underline-offset-2">
                pd@imagineflying.com
              </a>.
            </p>
          </section>

          {/* 8. Children's Privacy */}
          <section className="mb-12">
            <h2 className="font-bold text-xl sm:text-2xl text-c-text tracking-tight mb-4">
              8. Children&apos;s privacy
            </h2>
            <p className="text-sm text-c-muted leading-relaxed">
              HeyDPE is not directed at children under the age of 13. We do not knowingly collect
              personal information from children under 13. If you are a parent or guardian and believe
              your child has provided us with personal data, please contact us at{' '}
              <a href="mailto:pd@imagineflying.com" className="text-c-cyan-readable hover:text-c-cyan transition-colors underline underline-offset-2">
                pd@imagineflying.com
              </a>{' '}
              and we will take steps to delete such information.
            </p>
          </section>

          {/* 9. Security */}
          <section className="mb-12">
            <h2 className="font-bold text-xl sm:text-2xl text-c-text tracking-tight mb-4">
              9. Security
            </h2>
            <p className="text-sm text-c-muted leading-relaxed mb-3">
              We implement industry-standard security measures to protect your personal data:
            </p>
            <ul className="list-disc list-outside ml-5 space-y-2 text-sm text-c-muted leading-relaxed">
              <li><strong className="text-c-text">TLS encryption</strong> — all data in transit is encrypted using TLS (HTTPS).</li>
              <li><strong className="text-c-text">Encryption at rest</strong> — database data is encrypted at rest via Supabase infrastructure.</li>
              <li><strong className="text-c-text">Passwordless authentication</strong> — sign-in uses one-time email codes or OAuth (Google, Apple, Microsoft) via Supabase Auth; we do not store passwords.</li>
              <li><strong className="text-c-text">Row-Level Security (RLS)</strong> — database access policies ensure users can only access their own data.</li>
            </ul>
            <p className="text-sm text-c-muted leading-relaxed mt-3">
              While we strive to use commercially acceptable means to protect your personal data, no
              method of transmission over the Internet or electronic storage is 100% secure.
            </p>
          </section>

          {/* 10. Changes to This Policy */}
          <section className="mb-12">
            <h2 className="font-bold text-xl sm:text-2xl text-c-text tracking-tight mb-4">
              10. Changes to this policy
            </h2>
            <p className="text-sm text-c-muted leading-relaxed">
              We may update this Privacy Policy from time to time. When we do, we will notify you by
              email at the address associated with your account and update the &quot;Last Updated&quot; date
              at the top of this page. Your continued use of the Service after any changes constitutes
              your acceptance of the updated policy. We encourage you to review this page periodically.
            </p>
          </section>

          {/* 11. Contact */}
          <section className="mb-4">
            <h2 className="font-bold text-xl sm:text-2xl text-c-text tracking-tight mb-4">
              11. Contact
            </h2>
            <p className="text-sm text-c-muted leading-relaxed mb-3">
              If you have questions or concerns about this Privacy Policy, please contact us:
            </p>
            <div className="bezel rounded-lg p-5 border border-c-border">
              <p className="text-sm text-c-text leading-relaxed">
                <strong>Imagine Flying LLC</strong>
                <br />
                Jacksonville, FL
                <br />
                Email:{' '}
                <a href="mailto:pd@imagineflying.com" className="text-c-cyan-readable hover:text-c-cyan transition-colors underline underline-offset-2">
                  pd@imagineflying.com
                </a>
              </p>
            </div>
          </section>
        </div>
      </main>

      <Footer variant="public" />
    </div>
  );
}
