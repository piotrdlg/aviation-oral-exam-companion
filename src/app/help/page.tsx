import type { Metadata } from 'next';
import Link from 'next/link';
import Footer from '@/components/Footer';

export const metadata: Metadata = {
  title: 'Help & FAQ — HeyDPE',
  description:
    'Get help with HeyDPE, the AI checkride oral exam simulator. FAQs about study modes, ratings, examiner profiles, results, billing, and more.',
  metadataBase: new URL('https://aviation-oral-exam-companion.vercel.app'),
  alternates: {
    canonical: '/help',
  },
};

const faqs: { q: string; a: string }[] = [
  {
    q: 'What is HeyDPE?',
    a: 'HeyDPE is an AI-powered oral exam simulator that helps you prepare for your FAA checkride. It simulates a Designated Pilot Examiner (DPE) asking you questions based on the FAA Airman Certification Standards (ACS), assesses your answers, and tracks your progress across all knowledge areas.',
  },
  {
    q: 'Who is HeyDPE for?',
    a: 'HeyDPE is for student pilots preparing for Private Pilot, Commercial Pilot, or Instrument Rating checkrides. Whether you are studying for your first checkride or brushing up before a practical test, HeyDPE gives you realistic practice with immediate feedback.',
  },
  {
    q: 'What ratings are supported?',
    a: 'HeyDPE currently supports three ratings: Private Pilot Airplane (FAA-S-ACS-6C) with 61 ACS tasks, Commercial Pilot Airplane (FAA-S-ACS-7B) with 60 tasks, and Instrument Rating (FAA-S-ACS-8C) with 22 tasks. Each rating covers the knowledge areas tested during the oral portion of your checkride.',
  },
  {
    q: 'What study modes are available?',
    a: 'There are four study modes. Full Exam simulates a complete oral exam covering all ACS areas in order. Topic Focus lets you drill into a single ACS area of your choice. Cross-ACS uses your progress data to walk across related topics and strengthen weak connections. Quick Drill generates a short 5-question session targeting your weakest areas.',
  },
  {
    q: 'How do examiner profiles work?',
    a: 'HeyDPE includes four AI examiner personas, each with a distinct questioning style: Maria Torres (methodical, structured), Bob Mitchell (supportive, encouraging), Jim Hayes (strict, by-the-book), and Karen Sullivan (scenario-based, practical). You can choose your preferred examiner in Settings or let the system pick one for each session.',
  },
  {
    q: 'How are my answers assessed?',
    a: 'Each answer is evaluated by the AI examiner as Satisfactory, Unsatisfactory, or Partial. The assessment considers factual accuracy, completeness, use of correct aviation terminology, and relevance to the question asked. FAA source references are provided with each assessment so you can verify the information.',
  },
  {
    q: 'How do results and weak areas work?',
    a: 'After each exam, you receive a detailed score breakdown by ACS area. The Progress page shows your overall readiness score, ACS coverage percentage, and identifies weak elements that need more practice. Use the Quick Drill mode or the "Weak Areas" button to target those specific topics.',
  },
  {
    q: 'Is this a substitute for flight instructor (CFI) instruction?',
    a: 'No. HeyDPE is a study aid and practice tool only. It is not a substitute for instruction from a Certificated Flight Instructor (CFI), nor does it replace an actual DPE checkride. Always verify information against current FAA publications (ACS, AIM, FARs). The AI can make mistakes — use it as one tool among many in your preparation.',
  },
  {
    q: 'What does the free trial include?',
    a: 'New accounts get 3 free exam sessions with no credit card required. Free sessions include all study modes, all ratings, voice interaction, and progress tracking. After using your free sessions, you can subscribe to continue practicing.',
  },
  {
    q: 'How much does HeyDPE cost?',
    a: 'HeyDPE offers two plans: Monthly at $39/month and Annual at $299/year (saving 36%). Both plans include unlimited exam sessions, all ratings and study modes, voice interaction, progress tracking, and all examiner profiles. All paid plans start with a 7-day free trial.',
  },
  {
    q: 'How do I manage my subscription?',
    a: 'Go to Settings and scroll to the Subscription section. You can view your current plan, open the Stripe customer portal to update payment methods, change plans, or cancel your subscription. Cancellations take effect at the end of your current billing period.',
  },
  {
    q: 'Does voice mode work in all browsers?',
    a: 'Voice input (speech-to-text) uses the Web Speech API, which is best supported in Google Chrome. Other browsers like Safari and Firefox may have limited or no speech recognition support. Text-to-speech (examiner voice) works in all modern browsers. If voice is not working, visit Settings and use the Voice Diagnostics tool to troubleshoot.',
  },
];

export default function HelpPage() {
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
      <div className="pt-24 pb-16 px-4">
        <div className="max-w-3xl mx-auto">
          <h1 className="font-mono text-3xl font-bold text-c-amber mb-2 tracking-wide">
            HELP & FAQ
          </h1>
          <p className="text-c-muted font-mono text-sm mb-12">
            Everything you need to know about using HeyDPE for checkride preparation.
          </p>

          {/* FAQ Section */}
          <div className="space-y-6">
            {faqs.map((faq, i) => (
              <div key={i} className="border border-c-border rounded-lg p-5">
                <h2 className="font-mono text-sm font-semibold text-c-text mb-2 tracking-wide">
                  {faq.q}
                </h2>
                <p className="text-c-muted text-sm leading-relaxed">
                  {faq.a}
                </p>
              </div>
            ))}
          </div>

          {/* Something Wrong Section */}
          <div className="mt-16 border border-c-amber/30 rounded-lg p-6 bg-c-amber/5">
            <h2 className="font-mono text-lg font-bold text-c-amber mb-3 tracking-wide">
              SOMETHING NOT WORKING?
            </h2>
            <p className="text-c-muted text-sm leading-relaxed mb-4">
              If the AI examiner gives an incorrect answer, you can report it directly during your exam
              session using the report button on any examiner message. This helps us improve accuracy.
            </p>
            <p className="text-c-muted text-sm leading-relaxed mb-4">
              For bugs, account issues, billing questions, or general feedback, you can:
            </p>
            <ul className="space-y-2 text-sm text-c-muted mb-4">
              <li className="flex items-start gap-2">
                <span className="text-c-amber mt-0.5">{'>'}</span>
                <span>
                  Use the feedback form in{' '}
                  <Link href="/settings" className="text-c-cyan hover:underline">Settings</Link>
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-c-amber mt-0.5">{'>'}</span>
                <span>
                  Email us at{' '}
                  <a href="mailto:support@heydpe.com" className="text-c-cyan hover:underline">
                    support@heydpe.com
                  </a>
                </span>
              </li>
            </ul>
            <p className="text-c-muted text-xs">
              We typically respond within 24 hours.
            </p>
          </div>

          {/* Educational Disclaimer */}
          <div className="mt-12 border border-c-border rounded-lg p-5">
            <h2 className="font-mono text-sm font-semibold text-c-text mb-2 tracking-wide">
              EDUCATIONAL USE & LIMITATIONS
            </h2>
            <p className="text-c-muted text-sm leading-relaxed mb-3">
              HeyDPE is a study aid designed to supplement your checkride preparation. It uses
              AI to simulate examiner questions based on the FAA Airman Certification Standards (ACS).
              While we strive for accuracy, the AI can and does make mistakes.
            </p>
            <p className="text-c-muted text-sm leading-relaxed">
              HeyDPE is not affiliated with, endorsed by, or authorized by the Federal Aviation
              Administration (FAA). All FAA references (ACS, AIM, FARs, Advisory Circulars) are
              public domain. Always cross-reference answers with current FAA publications and consult
              your CFI for authoritative guidance.
            </p>
          </div>

          {/* Quick Links */}
          <div className="mt-12 flex flex-wrap gap-4 text-xs font-mono">
            <Link href="/privacy" className="text-c-muted hover:text-c-amber transition-colors">
              PRIVACY POLICY
            </Link>
            <Link href="/terms" className="text-c-muted hover:text-c-amber transition-colors">
              TERMS OF SERVICE
            </Link>
            <Link href="/pricing" className="text-c-muted hover:text-c-amber transition-colors">
              PRICING
            </Link>
            <a href="mailto:support@heydpe.com" className="text-c-muted hover:text-c-amber transition-colors">
              CONTACT US
            </a>
          </div>
        </div>
      </div>

      <Footer />
    </div>
  );
}
