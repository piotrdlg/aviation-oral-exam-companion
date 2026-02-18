'use client';

import Link from 'next/link';
import { useState } from 'react';

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
    <div className="min-h-screen bg-gray-950">
      {/* ─── Sticky nav ─── */}
      <nav className="fixed top-0 inset-x-0 z-50 border-b border-gray-800/60 bg-gray-950/80 backdrop-blur-lg">
        <div className="max-w-5xl mx-auto px-4 flex items-center justify-between h-14">
          <Link href="/" className="text-white font-semibold text-sm tracking-tight">HeyDPE</Link>
          <div className="flex items-center gap-4">
            <Link href="/" className="text-sm text-gray-400 hover:text-white transition-colors">
              Home
            </Link>
            <Link href="/login" className="text-sm text-gray-400 hover:text-white transition-colors">
              Sign In
            </Link>
            <Link
              href="/signup"
              className="text-sm px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors"
            >
              Get Started
            </Link>
          </div>
        </div>
      </nav>

      <div className="max-w-4xl mx-auto px-4 pt-28 pb-16">
        {/* ─── 1. Headline ─── */}
        <div className="text-center mb-4">
          <h1 className="text-4xl sm:text-5xl font-bold text-white mb-4 tracking-tight">
            Simple Pricing for Serious<br className="hidden sm:block" /> Checkride Prep
          </h1>
          <p className="text-lg text-gray-400 max-w-xl mx-auto">
            Unlimited AI-powered oral exam practice. Start with a 7-day free trial — no charge until you decide.
          </p>
        </div>

        {/* Value anchor */}
        <p className="text-center text-sm text-blue-400 mb-12">
          Less than the cost of one CFI hour — practice as many times as you need.
        </p>

        {error && (
          <div className="max-w-md mx-auto mb-8 bg-red-900/30 border border-red-800 rounded-lg p-3 text-red-300 text-sm text-center">
            {error}
          </div>
        )}

        {/* ─── 2. Plan cards ─── */}
        <div className="grid md:grid-cols-2 gap-6 mb-6 max-w-3xl mx-auto">
          {plans.map((plan) => (
            <div
              key={plan.id}
              className={`relative bg-gray-900 rounded-xl border p-6 flex flex-col ${
                plan.popular
                  ? 'border-blue-500 ring-1 ring-blue-500/30'
                  : 'border-gray-800'
              }`}
            >
              {plan.popular && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <span className="bg-blue-600 text-white text-xs font-medium px-3 py-1 rounded-full">
                    Best Value
                  </span>
                </div>
              )}

              <div className="mb-4">
                <h2 className="text-lg font-semibold text-white">{plan.name}</h2>
                <p className="text-sm text-gray-400 mt-1">{plan.description}</p>
              </div>

              <div className="mb-1">
                <span className="text-4xl font-bold text-white">{plan.price}</span>
                <span className="text-gray-400 ml-1">{plan.period}</span>
              </div>
              {plan.savings && (
                <p className="text-xs text-green-400 mb-5">That&apos;s {plan.savings} — billed annually</p>
              )}
              {!plan.savings && <div className="mb-5" />}

              <ul className="space-y-3 mb-8 flex-1">
                {plan.features.map((feature, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm">
                    <svg className="w-4 h-4 text-green-400 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    <span className="text-gray-300">{feature}</span>
                  </li>
                ))}
              </ul>

              <button
                onClick={() => handleCheckout(plan.id)}
                disabled={loadingPlan !== null}
                className={`w-full py-3 rounded-xl font-semibold transition-colors text-sm ${
                  plan.popular
                    ? 'bg-blue-600 hover:bg-blue-700 text-white shadow-lg shadow-blue-600/20'
                    : 'bg-gray-800 hover:bg-gray-700 text-white border border-gray-700'
                } disabled:opacity-50 disabled:cursor-not-allowed`}
              >
                {loadingPlan === plan.id ? 'Redirecting to checkout...' : plan.cta}
              </button>
            </div>
          ))}
        </div>

        {/* Trial + guarantee messaging */}
        <div className="max-w-3xl mx-auto text-center mb-16">
          <div className="flex flex-col sm:flex-row items-center justify-center gap-6 text-sm text-gray-500">
            <span className="flex items-center gap-1.5">
              <svg className="w-4 h-4 text-green-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75m-3-7.036A11.959 11.959 0 0 1 3.598 6 11.99 11.99 0 0 0 3 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285Z" />
              </svg>
              7-day free trial on all plans
            </span>
            <span className="flex items-center gap-1.5">
              <svg className="w-4 h-4 text-green-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
              </svg>
              Cancel anytime, no questions asked
            </span>
            <span className="flex items-center gap-1.5">
              <svg className="w-4 h-4 text-green-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 0 0 2.25-2.25V6.75A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25v10.5A2.25 2.25 0 0 0 4.5 19.5Z" />
              </svg>
              Secure payment via Stripe
            </span>
          </div>
        </div>

        {/* ─── 3. Feature comparison ─── */}
        <div className="max-w-2xl mx-auto mb-20" id="compare">
          <h2 className="text-2xl font-bold text-white text-center mb-2">Compare Plans</h2>
          <p className="text-gray-400 text-center text-sm mb-8">Free tier included for everyone. Upgrade when you&apos;re ready.</p>

          <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
            <div className="grid grid-cols-3 px-5 py-3 border-b border-gray-800 text-xs font-medium uppercase tracking-wide">
              <span className="text-gray-500">Feature</span>
              <span className="text-gray-500 text-center">Free</span>
              <span className="text-blue-400 text-center">Paid</span>
            </div>
            {featureComparison.map((row, i) => (
              <div key={i} className={`grid grid-cols-3 px-5 py-3 text-sm ${i < featureComparison.length - 1 ? 'border-b border-gray-800/50' : ''}`}>
                <span className="text-gray-300">{row.feature}</span>
                <span className="text-center">
                  {row.free === true ? (
                    <svg className="w-4 h-4 text-green-400 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                  ) : row.free === false ? (
                    <svg className="w-4 h-4 text-gray-600 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                  ) : (
                    <span className="text-gray-400">{row.free}</span>
                  )}
                </span>
                <span className="text-center">
                  {row.paid === true ? (
                    <svg className="w-4 h-4 text-green-400 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                  ) : row.paid === false ? (
                    <svg className="w-4 h-4 text-gray-600 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                  ) : (
                    <span className="text-white font-medium">{row.paid}</span>
                  )}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* ─── 4. Value comparison: HeyDPE vs CFI Mock Oral ─── */}
        <div className="max-w-2xl mx-auto mb-20">
          <h2 className="text-2xl font-bold text-white text-center mb-2">HeyDPE vs. CFI Mock Oral</h2>
          <p className="text-gray-400 text-center text-sm mb-8">
            HeyDPE doesn&apos;t replace your CFI — it supplements your training so you walk into the checkride prepared.
          </p>

          <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
            <div className="grid grid-cols-3 px-5 py-3 border-b border-gray-800 text-xs font-medium uppercase tracking-wide">
              <span className="text-gray-500"></span>
              <span className="text-blue-400 text-center">HeyDPE</span>
              <span className="text-gray-500 text-center">CFI Mock Oral</span>
            </div>
            {valueComparison.map((row, i) => (
              <div key={i} className={`grid grid-cols-3 px-5 py-3 text-sm ${i < valueComparison.length - 1 ? 'border-b border-gray-800/50' : ''}`}>
                <span className="text-gray-400">{row.attribute}</span>
                <span className="text-white text-center font-medium">{row.heydpe}</span>
                <span className="text-gray-400 text-center">{row.cfi}</span>
              </div>
            ))}
          </div>

          <p className="text-xs text-gray-600 text-center mt-4 max-w-lg mx-auto">
            Average CFI rates based on national estimates. HeyDPE cost calculated at ~30 sessions/month on the monthly plan. Your CFI remains essential for flight training — HeyDPE handles the oral exam repetition.
          </p>
        </div>

        {/* ─── 5. FAQ ─── */}
        <div className="max-w-2xl mx-auto mb-20">
          <h2 className="text-2xl font-bold text-white text-center mb-8">Frequently Asked Questions</h2>
          <div className="space-y-3">
            {faqs.map((faq, i) => (
              <details key={i} className="group bg-gray-900 rounded-xl border border-gray-800">
                <summary className="px-5 py-4 cursor-pointer text-white font-medium text-sm flex items-center justify-between list-none">
                  {faq.q}
                  <svg
                    className="w-4 h-4 text-gray-400 transition-transform group-open:rotate-180 shrink-0 ml-4"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </summary>
                <div className="px-5 pb-4 text-sm text-gray-400 leading-relaxed">
                  {faq.a}
                </div>
              </details>
            ))}
          </div>
        </div>

        {/* ─── 6. Final CTA ─── */}
        <div className="max-w-2xl mx-auto text-center py-16 border-t border-gray-800/60">
          <h2 className="text-3xl font-bold text-white mb-4">
            Start Practicing Today
          </h2>
          <p className="text-gray-400 mb-8 max-w-md mx-auto">
            7 days free. Cancel anytime. Walk into your checkride knowing you&apos;ve covered every ACS area.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <button
              onClick={() => handleCheckout('annual')}
              disabled={loadingPlan !== null}
              className="px-8 py-3.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-semibold text-base transition-colors shadow-lg shadow-blue-600/20 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loadingPlan === 'annual' ? 'Redirecting...' : 'Start Free Trial — Annual (Best Value)'}
            </button>
            <button
              onClick={() => handleCheckout('monthly')}
              disabled={loadingPlan !== null}
              className="px-8 py-3.5 bg-gray-800 hover:bg-gray-700 text-white rounded-xl font-medium text-base border border-gray-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loadingPlan === 'monthly' ? 'Redirecting...' : 'Start Free Trial — Monthly'}
            </button>
          </div>
          <p className="mt-6 text-xs text-gray-600">
            Not ready to commit? <Link href="/signup" className="text-blue-400 hover:text-blue-300 transition-colors">Create a free account</Link> and try limited sessions first.
          </p>
        </div>

        {/* ─── Footer ─── */}
        <p className="text-center text-xs text-gray-600 max-w-md mx-auto leading-relaxed pt-8 border-t border-gray-800/60">
          All prices in USD. Subscriptions are billed through Stripe. Cancel anytime from your Settings page.
          For study purposes only. Not a substitute for instruction from a certificated flight instructor.
          HeyDPE is a product of Imagine Flying LLC, Jacksonville, FL.
        </p>
      </div>
    </div>
  );
}
