'use client';

import Link from 'next/link';
import { useState } from 'react';
import UTMCapture from '@/components/UTMCapture';

const plans = [
  {
    id: 'monthly' as const,
    name: 'Monthly',
    price: '$39',
    period: '/mo',
    description: 'Full access, cancel anytime',
    features: [
      'Unlimited exam sessions',
      'All 3 ratings: Private, Commercial, Instrument',
      'AI-powered answer assessment with FAA sources',
      'Voice mode with premium TTS',
      'Progress tracking & ACS coverage map',
      'Session resume across devices',
      'Cross-browser support',
    ],
    cta: 'Start 7-Day Free Trial',
    popular: false,
  },
  {
    id: 'annual' as const,
    name: 'Annual',
    price: '$299',
    period: '/yr',
    savings: '$24.92/mo',
    description: 'Save $169/year (36% off)',
    features: [
      'Everything in Monthly, plus:',
      'Priority support',
      '2 months free vs monthly billing',
      'Lock in your rate for 12 months',
    ],
    cta: 'Start 7-Day Free Trial',
    popular: true,
  },
];

const faqs = [
  {
    q: 'Is there a free trial?',
    a: 'Yes! Both plans include a 7-day free trial. You won\'t be charged until the trial ends, and you can cancel anytime before that. No credit card tricks — we\'ll remind you before your trial expires.',
  },
  {
    q: 'Can I cancel anytime?',
    a: 'Absolutely. Cancel from your Settings page with one click. You\'ll retain full access until the end of your current billing period. No cancellation fees, no hassle.',
  },
  {
    q: 'What ratings are supported?',
    a: 'We support Private Pilot (FAA-S-ACS-6C), Commercial Pilot (FAA-S-ACS-7B), and Instrument Rating (FAA-S-ACS-8C) — 143+ ACS tasks total. ATP is coming soon.',
  },
  {
    q: 'How does voice mode work?',
    a: 'Voice mode lets you speak your answers naturally, just like a real oral exam. The AI examiner responds with a realistic DPE voice. Works in Chrome with the Web Speech API, and all paid tiers include cross-browser TTS support.',
  },
  {
    q: 'Is there a free tier?',
    a: 'Yes. New accounts get limited free sessions to explore the platform — no credit card required. Upgrade when you\'re ready for unlimited practice.',
  },
  {
    q: 'What payment methods do you accept?',
    a: 'We accept all major credit and debit cards via Stripe. Your payment information is securely processed by Stripe and never stored on our servers.',
  },
];

const featureComparison = [
  { feature: 'ACS-aligned questions', free: 'Limited', paid: 'Unlimited' },
  { feature: 'Certificate ratings', free: 'All 3', paid: 'All 3' },
  { feature: 'AI answer assessment', free: true, paid: true },
  { feature: 'FAA source references', free: true, paid: true },
  { feature: 'Voice mode (TTS)', free: false, paid: true },
  { feature: 'Progress tracking', free: 'Basic', paid: 'Full' },
  { feature: 'Session resume', free: false, paid: true },
  { feature: 'Priority support', free: false, paid: 'Annual' },
];

const valueComparison = [
  { attribute: 'Cost per session', heydpe: '~$1.30/session', cfi: '$75-150/hour' },
  { attribute: 'Availability', heydpe: '24/7, on demand', cfi: 'By appointment' },
  { attribute: 'ACS coverage tracking', heydpe: 'Automatic', cfi: 'Manual notes' },
  { attribute: 'Repeat weak areas', heydpe: 'Unlimited', cfi: 'Costs more time' },
  { attribute: 'Consistent standard', heydpe: 'Always ACS-aligned', cfi: 'Varies by instructor' },
  { attribute: 'Replaces CFI?', heydpe: 'No — supplements', cfi: 'Essential' },
];

export default function PricingPage() {
  const [loadingPlan, setLoadingPlan] = useState<'monthly' | 'annual' | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleCheckout(plan: 'monthly' | 'annual') {
    setLoadingPlan(plan);
    setError(null);

    try {
      const res = await fetch('/api/stripe/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan }),
      });

      if (res.status === 401) {
        window.location.href = `/login?redirect=/pricing&plan=${plan}`;
        return;
      }

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Checkout failed');

      if (data.url) {
        window.location.href = data.url;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
      setLoadingPlan(null);
    }
  }

  return (
    <div className="min-h-screen bg-c-bg">
      <UTMCapture />
      {/* ─── Sticky nav ─── */}
      <nav className="fixed top-0 inset-x-0 z-50 border-b border-c-border bg-c-bg/80 backdrop-blur-lg">
        <div className="max-w-5xl mx-auto px-4 flex items-center justify-between h-14">
          <Link href="/" className="font-mono font-bold text-c-amber glow-a text-sm tracking-widest">HEYDPE</Link>
          <div className="flex items-center gap-4">
            <Link href="/" className="font-mono text-xs text-c-muted hover:text-c-amber transition-colors tracking-wide uppercase">
              HOME
            </Link>
            <Link href="/login" className="font-mono text-xs text-c-muted hover:text-c-text transition-colors tracking-wide uppercase">
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

      <div className="max-w-4xl mx-auto px-4 pt-28 pb-16">
        {/* ─── 1. Headline ─── */}
        <div className="text-center mb-4">
          <p className="font-mono text-xs text-c-cyan glow-c tracking-[0.3em] uppercase text-center mb-4">// PRICING</p>
          <h1 className="font-mono font-bold text-4xl sm:text-5xl text-c-amber glow-a tracking-tight uppercase mb-4">
            SIMPLE PRICING FOR SERIOUS<br className="hidden sm:block" /> CHECKRIDE PREP
          </h1>
          <p className="text-sm text-c-muted max-w-xl mx-auto leading-relaxed">
            Unlimited AI-powered oral exam practice. Start with a 7-day free trial — no charge until you decide.
          </p>
        </div>

        {/* Value anchor */}
        <p className="text-center font-mono text-xs text-c-cyan glow-c mb-12">
          Less than the cost of one CFI hour — practice as many times as you need.
        </p>

        {error && (
          <div className="max-w-md mx-auto mb-8 bg-c-red-dim/30 border border-c-red/40 rounded-lg p-3 text-c-red font-mono text-xs text-center uppercase">
            {error}
          </div>
        )}

        {/* ─── 2. Plan cards ─── */}
        <div className="grid md:grid-cols-2 gap-6 mb-6 max-w-3xl mx-auto">
          {plans.map((plan) => (
            <div
              key={plan.id}
              className={`relative bezel rounded-lg border p-6 flex flex-col ${
                plan.popular
                  ? 'border-c-amber ring-1 ring-c-amber/20'
                  : 'border-c-border'
              }`}
            >
              {plan.popular && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <span className="font-mono text-[10px] bg-c-amber text-c-bg font-semibold px-3 py-1 rounded-full uppercase tracking-wide">
                    BEST VALUE
                  </span>
                </div>
              )}

              <div className="mb-4">
                <h2 className="font-mono font-bold text-sm text-c-amber uppercase tracking-wider">{plan.name}</h2>
                <p className="text-xs text-c-muted mt-1">{plan.description}</p>
              </div>

              <div className="mb-1">
                <span className="font-mono font-bold text-4xl text-c-amber glow-a">{plan.price}</span>
                <span className="font-mono text-c-muted ml-1">{plan.period}</span>
              </div>
              {plan.savings && (
                <p className="font-mono text-xs text-c-green glow-g mb-5">That&apos;s {plan.savings} — billed annually</p>
              )}
              {!plan.savings && <div className="mb-5" />}

              <ul className="space-y-3 mb-8 flex-1">
                {plan.features.map((feature, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm">
                    <span className="text-c-green mt-0.5 shrink-0">&#10003;</span>
                    <span className="text-c-text">{feature}</span>
                  </li>
                ))}
              </ul>

              <button
                onClick={() => handleCheckout(plan.id)}
                disabled={loadingPlan !== null}
                className={`w-full py-3 rounded-lg font-mono font-semibold transition-colors text-sm uppercase tracking-wide ${
                  plan.popular
                    ? 'bg-c-amber hover:bg-c-amber/90 text-c-bg shadow-lg shadow-c-amber/20'
                    : 'bg-c-bezel hover:bg-c-border text-c-text border border-c-border'
                } disabled:opacity-50 disabled:cursor-not-allowed`}
              >
                {loadingPlan === plan.id ? 'REDIRECTING TO CHECKOUT...' : plan.cta.toUpperCase()}
              </button>
            </div>
          ))}
        </div>

        {/* Trial + guarantee messaging */}
        <div className="max-w-3xl mx-auto text-center mb-16">
          <div className="flex flex-col sm:flex-row items-center justify-center gap-6 font-mono text-xs text-c-dim uppercase">
            <span className="flex items-center gap-1.5">
              <span className="text-c-green">&#10003;</span>
              7-DAY FREE TRIAL ON ALL PLANS
            </span>
            <span className="flex items-center gap-1.5">
              <span className="text-c-green">&#10003;</span>
              CANCEL ANYTIME, NO QUESTIONS ASKED
            </span>
            <span className="flex items-center gap-1.5">
              <span className="text-c-green">&#10003;</span>
              SECURE PAYMENT VIA STRIPE
            </span>
          </div>
        </div>

        {/* ─── 3. Feature comparison ─── */}
        <div className="max-w-2xl mx-auto mb-20" id="compare">
          <p className="font-mono text-xs text-c-cyan glow-c tracking-[0.3em] uppercase text-center mb-2">// COMPARISON</p>
          <h2 className="font-mono font-bold text-2xl text-c-amber glow-a text-center mb-2 uppercase">COMPARE PLANS</h2>
          <p className="text-c-muted text-center text-sm mb-8">Free tier included for everyone. Upgrade when you&apos;re ready.</p>

          <div className="bezel rounded-lg border border-c-border overflow-hidden">
            <div className="grid grid-cols-3 px-5 py-3 border-b border-c-border font-mono text-[10px] font-semibold uppercase tracking-wider">
              <span className="text-c-dim">FEATURE</span>
              <span className="text-c-dim text-center">FREE</span>
              <span className="text-c-amber text-center">PAID</span>
            </div>
            {featureComparison.map((row, i) => (
              <div key={i} className={`grid grid-cols-3 px-5 py-3 text-sm ${i < featureComparison.length - 1 ? 'border-b border-c-border/50' : ''}`}>
                <span className="text-c-text">{row.feature}</span>
                <span className="text-center">
                  {row.free === true ? (
                    <span className="text-c-green">&#10003;</span>
                  ) : row.free === false ? (
                    <span className="text-c-dim">&times;</span>
                  ) : (
                    <span className="text-c-muted">{row.free}</span>
                  )}
                </span>
                <span className="text-center">
                  {row.paid === true ? (
                    <span className="text-c-green">&#10003;</span>
                  ) : row.paid === false ? (
                    <span className="text-c-dim">&times;</span>
                  ) : (
                    <span className="font-mono font-semibold text-c-text">{row.paid}</span>
                  )}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* ─── 4. Value comparison: HeyDPE vs CFI Mock Oral ─── */}
        <div className="max-w-2xl mx-auto mb-20">
          <p className="font-mono text-xs text-c-cyan glow-c tracking-[0.3em] uppercase text-center mb-2">// VALUE</p>
          <h2 className="font-mono font-bold text-2xl text-c-amber glow-a text-center mb-2 uppercase">HEYDPE VS. CFI MOCK ORAL</h2>
          <p className="text-c-muted text-center text-sm mb-8">
            HeyDPE doesn&apos;t replace your CFI — it supplements your training so you walk into the checkride prepared.
          </p>

          <div className="bezel rounded-lg border border-c-border overflow-hidden">
            <div className="grid grid-cols-3 px-5 py-3 border-b border-c-border font-mono text-[10px] font-semibold uppercase tracking-wider">
              <span className="text-c-dim"></span>
              <span className="text-c-amber text-center">HEYDPE</span>
              <span className="text-c-dim text-center">CFI MOCK ORAL</span>
            </div>
            {valueComparison.map((row, i) => (
              <div key={i} className={`grid grid-cols-3 px-5 py-3 text-sm ${i < valueComparison.length - 1 ? 'border-b border-c-border/50' : ''}`}>
                <span className="text-c-muted">{row.attribute}</span>
                <span className="text-c-text text-center font-mono font-semibold">{row.heydpe}</span>
                <span className="text-c-muted text-center">{row.cfi}</span>
              </div>
            ))}
          </div>

          <p className="text-[10px] text-c-dim font-mono text-center mt-4 max-w-lg mx-auto leading-relaxed">
            Average CFI rates based on national estimates. HeyDPE cost calculated at ~30 sessions/month on the monthly plan. Your CFI remains essential for flight training — HeyDPE handles the oral exam repetition.
          </p>
        </div>

        {/* ─── 5. FAQ ─── */}
        <div className="max-w-2xl mx-auto mb-20">
          <p className="font-mono text-xs text-c-cyan glow-c tracking-[0.3em] uppercase text-center mb-2">// FAQ</p>
          <h2 className="font-mono font-bold text-2xl text-c-amber glow-a text-center mb-8 uppercase">FREQUENTLY ASKED QUESTIONS</h2>
          <div className="space-y-3">
            {faqs.map((faq, i) => (
              <details key={i} className="group bezel rounded-lg border border-c-border">
                <summary className="px-5 py-4 cursor-pointer font-mono text-sm font-semibold text-c-text uppercase flex items-center justify-between list-none">
                  {faq.q.toUpperCase()}
                  <span className="text-c-muted transition-transform group-open:rotate-180 shrink-0 ml-4 text-xs">&#9660;</span>
                </summary>
                <div className="px-5 pb-4 text-sm text-c-muted leading-relaxed">
                  {faq.a}
                </div>
              </details>
            ))}
          </div>
        </div>

        {/* ─── 6. Final CTA ─── */}
        <div className="max-w-2xl mx-auto text-center py-16 border-t border-c-border">
          <p className="font-mono text-xs text-c-cyan glow-c tracking-[0.3em] uppercase text-center mb-4">// GET STARTED</p>
          <h2 className="font-mono font-bold text-3xl text-c-amber glow-a mb-4 uppercase">
            START PRACTICING TODAY
          </h2>
          <p className="text-c-muted mb-8 max-w-md mx-auto text-sm">
            7 days free. Cancel anytime. Walk into your checkride knowing you&apos;ve covered every ACS area.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <button
              onClick={() => handleCheckout('annual')}
              disabled={loadingPlan !== null}
              className="px-8 py-3.5 bg-c-amber hover:bg-c-amber/90 text-c-bg rounded-lg font-mono font-semibold text-sm transition-colors shadow-lg shadow-c-amber/20 uppercase tracking-wide disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loadingPlan === 'annual' ? 'REDIRECTING...' : 'START FREE TRIAL — ANNUAL (BEST VALUE)'}
            </button>
            <button
              onClick={() => handleCheckout('monthly')}
              disabled={loadingPlan !== null}
              className="px-8 py-3.5 bg-c-bezel hover:bg-c-border text-c-text rounded-lg font-mono font-medium text-sm border border-c-border transition-colors uppercase tracking-wide disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loadingPlan === 'monthly' ? 'REDIRECTING...' : 'START FREE TRIAL — MONTHLY'}
            </button>
          </div>
          <p className="mt-6 font-mono text-xs text-c-dim">
            Not ready to commit? <Link href="/signup" className="text-c-cyan hover:text-c-cyan/80 transition-colors">CREATE A FREE ACCOUNT</Link> and try limited sessions first.
          </p>
        </div>

        {/* ─── Footer ─── */}
        <p className="text-[10px] text-c-muted font-mono leading-relaxed text-center max-w-xl mx-auto pt-8 border-t border-c-border uppercase">
          ALL PRICES IN USD. SUBSCRIPTIONS ARE BILLED THROUGH STRIPE. CANCEL ANYTIME FROM YOUR SETTINGS PAGE.
          FOR STUDY PURPOSES ONLY. NOT A SUBSTITUTE FOR INSTRUCTION FROM A CERTIFICATED FLIGHT INSTRUCTOR.
          HEYDPE IS A PRODUCT OF IMAGINE FLYING LLC, JACKSONVILLE, FL.
        </p>
      </div>
    </div>
  );
}
