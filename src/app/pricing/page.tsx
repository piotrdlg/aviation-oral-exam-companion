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
      'AI-powered answer assessment',
      'Voice mode with premium TTS',
      'Cross-browser support (all tiers)',
      'Progress tracking & session history',
      'FAA ACS-aligned questions',
    ],
    cta: 'Start 7-Day Free Trial',
    popular: false,
  },
  {
    id: 'annual' as const,
    name: 'Annual',
    price: '$299',
    period: '/yr',
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
    a: 'Yes! Both plans include a 7-day free trial. You won\'t be charged until the trial ends, and you can cancel anytime before that.',
  },
  {
    q: 'What ratings are supported?',
    a: 'We support Private Pilot (FAA-S-ACS-6C), Commercial Pilot (FAA-S-ACS-7B), and Instrument Rating (FAA-S-ACS-8C). ATP is coming soon.',
  },
  {
    q: 'How does voice mode work?',
    a: 'Voice mode lets you speak your answers naturally, just like a real oral exam. The AI examiner responds with a realistic voice. Works best in Chrome, with cross-browser support on paid tiers.',
  },
  {
    q: 'Can I cancel anytime?',
    a: 'Absolutely. Cancel from your Settings page at any time. You\'ll retain access until the end of your current billing period.',
  },
  {
    q: 'Is there a free tier?',
    a: 'Yes, new accounts get limited free sessions to try the platform. Upgrade when you\'re ready for unlimited practice.',
  },
  {
    q: 'What payment methods do you accept?',
    a: 'We accept all major credit and debit cards via Stripe. Your payment information is securely processed and never stored on our servers.',
  },
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
        // Not logged in — redirect to login first
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
    <div className="min-h-screen bg-gray-950 px-4 py-16">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="text-center mb-12">
          <Link href="/" className="text-sm text-gray-500 hover:text-gray-300 transition-colors mb-4 inline-block">
            &larr; Back to home
          </Link>
          <h1 className="text-4xl font-bold text-white mb-3">Simple, transparent pricing</h1>
          <p className="text-lg text-gray-400 max-w-xl mx-auto">
            Practice for your FAA checkride with unlimited AI-powered oral exam sessions.
            Start with a 7-day free trial.
          </p>
        </div>

        {error && (
          <div className="max-w-md mx-auto mb-8 bg-red-900/30 border border-red-800 rounded-lg p-3 text-red-300 text-sm text-center">
            {error}
          </div>
        )}

        {/* Pricing Cards */}
        <div className="grid md:grid-cols-2 gap-6 mb-16 max-w-3xl mx-auto">
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

              <div className="mb-6">
                <span className="text-4xl font-bold text-white">{plan.price}</span>
                <span className="text-gray-400 ml-1">{plan.period}</span>
              </div>

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
                className={`w-full py-3 rounded-lg font-medium transition-colors text-sm ${
                  plan.popular
                    ? 'bg-blue-600 hover:bg-blue-700 text-white'
                    : 'bg-gray-800 hover:bg-gray-700 text-white border border-gray-700'
                } disabled:opacity-50 disabled:cursor-not-allowed`}
              >
                {loadingPlan === plan.id ? 'Redirecting to checkout...' : plan.cta}
              </button>
            </div>
          ))}
        </div>

        {/* FAQ */}
        <div className="max-w-2xl mx-auto">
          <h2 className="text-2xl font-bold text-white text-center mb-8">Frequently Asked Questions</h2>
          <div className="space-y-4">
            {faqs.map((faq, i) => (
              <details key={i} className="group bg-gray-900 rounded-lg border border-gray-800">
                <summary className="px-5 py-4 cursor-pointer text-white font-medium text-sm flex items-center justify-between list-none">
                  {faq.q}
                  <svg
                    className="w-4 h-4 text-gray-400 transition-transform group-open:rotate-180"
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

        {/* Footer */}
        <p className="mt-16 text-center text-xs text-gray-600 max-w-md mx-auto leading-relaxed">
          All prices in USD. Subscriptions are billed through Stripe. Cancel anytime from your Settings page.
          For study purposes only. Not a substitute for instruction from a certificated flight instructor.
        </p>
      </div>
    </div>
  );
}
