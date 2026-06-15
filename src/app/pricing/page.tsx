'use client';

import Link from 'next/link';
import { useState, useEffect } from 'react';
import UTMCapture from '@/components/UTMCapture';
import Footer from '@/components/Footer';
import { Logo } from '@/components/Brand';
import { createClient } from '@/lib/supabase/client';

const plans = [
  {
    id: 'monthly' as const,
    name: 'Monthly',
    price: '$39',
    period: '/mo',
    description: 'Full access, billed monthly, cancel anytime',
    features: [
      'Unlimited exam sessions',
      'All 3 ratings: Private, Commercial, Instrument',
      'AI-powered answer assessment with FAA sources',
      'Full voice mode — speak your answers, hear a realistic DPE',
      'Progress tracking & ACS coverage map',
      'Session resume across devices',
      'Cross-browser support',
    ],
    cta: 'Upgrade to Paid',
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
    cta: 'Upgrade to Paid',
    popular: true,
  },
];

const faqs = [
  {
    q: 'Is there a free trial?',
    a: 'Yes — and it\'s genuinely free. Every new account gets a 7-day free trial with 3 full practice exams, no credit card required. The free trial and the free tier are the same thing: full voice mode, AI assessment, and progress tracking, with nothing to enter up front. Upgrade to a paid plan whenever you want unlimited exams.',
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
    a: 'Voice mode lets you speak your answers naturally, just like a real oral exam. The AI examiner responds with a realistic DPE voice. It works across modern browsers (Chrome, Safari, Edge, Firefox) on desktop and tablet — voice is included on every plan, including the free trial.',
  },
  {
    q: 'Do I get another free trial when I subscribe?',
    a: 'No — the free trial happens up front, before you ever enter a card. When you upgrade to a paid plan, your first month (or year) is billed immediately and your access continues uninterrupted. You can cancel anytime from Settings.',
  },
  {
    q: 'What payment methods do you accept?',
    a: 'We accept all major credit and debit cards via Stripe. Your payment information is securely processed by Stripe and never stored on our servers.',
  },
];

// W3.3: rows now match enforced reality (decision D1). The free trial gets the
// FULL product — including voice and resume — for 3 exams; the paid plan
// removes the count limit and raises the usage budgets.
const featureComparison = [
  { feature: 'Practice exams', free: '3 free', paid: 'Unlimited' },
  { feature: 'Certificate ratings', free: 'All 3', paid: 'All 3' },
  { feature: 'AI answer assessment', free: true, paid: true },
  { feature: 'FAA source references', free: true, paid: true },
  { feature: 'Voice mode (TTS + STT)', free: 'In trial', paid: 'Unlimited' },
  { feature: 'Progress tracking', free: true, paid: true },
  { feature: 'Session resume', free: true, paid: true },
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
  const [userTier, setUserTier] = useState<string | null>(null);
  const [subscriptionStatus, setSubscriptionStatus] = useState<string | null>(null);

  useEffect(() => {
    async function checkUserTier() {
      try {
        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        const { data } = await supabase
          .from('user_profiles')
          .select('tier, subscription_status')
          .eq('user_id', user.id)
          .single();

        if (data) {
          setUserTier(data.tier);
          setSubscriptionStatus(data.subscription_status);
        }
      } catch {
        // Ignore — treat as anonymous
      }
    }
    checkUserTier();
  }, []);

  const isActiveSubscriber = userTier === 'dpe_live' &&
    (subscriptionStatus === 'active' || subscriptionStatus === 'trialing');

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
          <Logo size="md" href="/" glow />
          <div className="flex items-center gap-2 sm:gap-5">
            <Link href="/" className="text-sm text-c-muted hover:text-c-text transition-colors px-2">
              Home
            </Link>
            <Link href="/login" className="text-sm text-c-muted hover:text-c-text transition-colors px-2">
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

      <div className="max-w-4xl mx-auto px-4 pt-28 pb-16">
        {/* ─── 1. Headline ─── */}
        <div className="text-center mb-4">
          <p className="font-mono text-xs text-c-cyan tracking-[0.3em] uppercase text-center mb-4">// Pricing</p>
          <h1 className="font-bold text-4xl sm:text-5xl text-c-text tracking-tight mb-5">
            Simple pricing for serious<br className="hidden sm:block" /> checkride prep
          </h1>
          <p className="text-base text-c-muted max-w-xl mx-auto leading-relaxed">
            Unlimited AI-powered oral exam practice. Start free — a 7-day trial with 3 exams, no credit card required. Upgrade when you&apos;re ready.
          </p>
        </div>

        {/* Value anchor */}
        <p className="text-center text-sm text-c-cyan-readable mb-12">
          Less than the cost of one CFI hour — practice as many times as you need.
        </p>

        {error && (
          <div className="max-w-md mx-auto mb-8 bg-c-red-dim/30 border border-c-red/40 rounded-lg p-3 text-c-red text-sm text-center">
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
                  <span className="font-mono text-[11px] bg-c-amber text-c-bg font-semibold px-3 py-1 rounded-full uppercase tracking-wide">
                    Best value
                  </span>
                </div>
              )}

              <div className="mb-4">
                <h2 className="font-semibold text-lg text-c-text">{plan.name}</h2>
                <p className="text-sm text-c-muted mt-1">{plan.description}</p>
              </div>

              <div className="mb-1">
                <span className="font-mono font-bold text-5xl text-c-amber glow-a tabular-nums">{plan.price}</span>
                <span className="text-c-muted ml-1.5">{plan.period}</span>
              </div>
              {plan.savings && (
                <p className="text-sm text-c-green-readable mb-5">That&apos;s {plan.savings} — billed annually</p>
              )}
              {!plan.savings && <div className="mb-5" />}

              <ul className="space-y-3 mb-8 flex-1">
                {plan.features.map((feature, i) => (
                  <li key={i} className="flex items-start gap-2.5 text-sm">
                    <span className="text-c-green mt-0.5 shrink-0">&#10003;</span>
                    <span className="text-c-text leading-relaxed">{feature}</span>
                  </li>
                ))}
              </ul>

              <button
                onClick={() => isActiveSubscriber ? window.location.href = '/settings' : handleCheckout(plan.id)}
                disabled={loadingPlan !== null}
                className={`w-full py-3 rounded-lg font-semibold transition-colors text-[15px] ${
                  plan.popular
                    ? 'bg-c-amber hover:bg-c-amber-bright text-c-bg shadow-lg shadow-c-amber/20'
                    : 'bg-c-bezel hover:bg-c-border text-c-text border border-c-border'
                } disabled:opacity-50 disabled:cursor-not-allowed`}
              >
                {loadingPlan === plan.id
                  ? 'Redirecting to checkout…'
                  : isActiveSubscriber
                    ? 'Manage subscription'
                    : plan.cta}
              </button>
            </div>
          ))}
        </div>

        {/* Trial + guarantee messaging */}
        <div className="max-w-3xl mx-auto text-center mb-16">
          <div className="flex flex-col sm:flex-row items-center justify-center gap-x-6 gap-y-2 text-sm text-c-muted">
            <span className="flex items-center gap-1.5">
              <span className="text-c-green">&#10003;</span>
              7-day free trial &mdash; no credit card required
            </span>
            <span className="flex items-center gap-1.5">
              <span className="text-c-green">&#10003;</span>
              Cancel anytime, no questions asked
            </span>
            <span className="flex items-center gap-1.5">
              <span className="text-c-green">&#10003;</span>
              Secure payment via Stripe
            </span>
          </div>
        </div>

        {/* ─── 3. Feature comparison ─── */}
        <div className="max-w-2xl mx-auto mb-20" id="compare">
          <p className="font-mono text-xs text-c-cyan tracking-[0.3em] uppercase text-center mb-3">// Comparison</p>
          <h2 className="font-bold text-3xl text-c-text text-center mb-3 tracking-tight">Compare plans</h2>
          <p className="text-c-muted text-center text-base mb-8">Start free &mdash; no card required. Upgrade when you&apos;re ready.</p>

          <div className="bezel rounded-xl border border-c-border overflow-hidden">
            <div className="grid grid-cols-3 px-5 py-3 border-b border-c-border font-mono text-[11px] font-semibold uppercase tracking-wider">
              <span className="text-c-dim">Feature</span>
              <span className="text-c-dim text-center">Free</span>
              <span className="text-c-amber text-center">Paid</span>
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
          <p className="font-mono text-xs text-c-cyan tracking-[0.3em] uppercase text-center mb-3">// Value</p>
          <h2 className="font-bold text-3xl text-c-text text-center mb-3 tracking-tight">HeyDPE vs. a CFI mock oral</h2>
          <p className="text-c-muted text-center text-base mb-8">
            HeyDPE doesn&apos;t replace your CFI — it supplements your training so you walk into the checkride prepared.
          </p>

          <div className="bezel rounded-xl border border-c-border overflow-hidden">
            <div className="grid grid-cols-3 px-5 py-3 border-b border-c-border font-mono text-[11px] font-semibold uppercase tracking-wider">
              <span className="text-c-dim"></span>
              <span className="text-c-amber text-center">HeyDPE</span>
              <span className="text-c-dim text-center">CFI mock oral</span>
            </div>
            {valueComparison.map((row, i) => (
              <div key={i} className={`grid grid-cols-3 px-5 py-3 text-sm ${i < valueComparison.length - 1 ? 'border-b border-c-border/50' : ''}`}>
                <span className="text-c-muted">{row.attribute}</span>
                <span className="text-c-text text-center font-mono font-semibold">{row.heydpe}</span>
                <span className="text-c-muted text-center">{row.cfi}</span>
              </div>
            ))}
          </div>

          <p className="text-xs text-c-dim text-center mt-4 max-w-lg mx-auto leading-relaxed">
            Average CFI rates based on national estimates. HeyDPE cost calculated at ~30 sessions/month on the monthly plan. Your CFI remains essential for flight training — HeyDPE handles the oral exam repetition.
          </p>
        </div>

        {/* ─── 5. FAQ ─── */}
        <div className="max-w-2xl mx-auto mb-20">
          <p className="font-mono text-xs text-c-cyan tracking-[0.3em] uppercase text-center mb-3">// FAQ</p>
          <h2 className="font-bold text-3xl text-c-text text-center mb-8 tracking-tight">Frequently asked questions</h2>
          <div className="space-y-3">
            {faqs.map((faq, i) => (
              <details key={i} className="group bezel rounded-xl border border-c-border open:border-c-border-hi transition-colors">
                <summary className="px-5 py-4 cursor-pointer text-[15px] font-semibold text-c-text flex items-center justify-between list-none gap-4">
                  {faq.q}
                  <span className="text-c-muted transition-transform group-open:rotate-180 shrink-0 text-xs">&#9660;</span>
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
          <p className="font-mono text-xs text-c-cyan tracking-[0.3em] uppercase text-center mb-4">// Get started</p>
          <h2 className="font-bold text-3xl sm:text-4xl text-c-text mb-4 tracking-tight">
            Start practicing today
          </h2>
          <p className="text-c-muted mb-8 max-w-md mx-auto text-base">
            Start free &mdash; 7-day trial, 3 exams, no credit card. Walk into your checkride knowing you&apos;ve covered every ACS area.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            {isActiveSubscriber ? (
              <button
                onClick={() => window.location.href = '/settings'}
                className="px-8 py-3.5 bg-c-amber hover:bg-c-amber-bright text-c-bg rounded-lg font-semibold text-[15px] transition-colors shadow-lg shadow-c-amber/20"
              >
                Manage your subscription
              </button>
            ) : (
              <>
                <button
                  onClick={() => handleCheckout('annual')}
                  disabled={loadingPlan !== null}
                  className="px-8 py-3.5 bg-c-amber hover:bg-c-amber-bright text-c-bg rounded-lg font-semibold text-[15px] transition-colors shadow-lg shadow-c-amber/20 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loadingPlan === 'annual' ? 'Redirecting…' : 'Upgrade to Paid — Annual (best value)'}
                </button>
                <button
                  onClick={() => handleCheckout('monthly')}
                  disabled={loadingPlan !== null}
                  className="px-8 py-3.5 bg-c-bezel hover:bg-c-border text-c-text rounded-lg font-medium text-[15px] border border-c-border transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loadingPlan === 'monthly' ? 'Redirecting…' : 'Upgrade to Paid — Monthly'}
                </button>
              </>
            )}
          </div>
          {!isActiveSubscriber && (
            <p className="mt-6 text-sm text-c-dim">
              Not ready to upgrade? <Link href="/signup" className="text-c-cyan-readable hover:text-c-cyan transition-colors">Start your free trial</Link> &mdash; 7 days, 3 exams, no credit card.
            </p>
          )}
        </div>

      </div>
      <Footer variant="public" />
    </div>
  );
}
