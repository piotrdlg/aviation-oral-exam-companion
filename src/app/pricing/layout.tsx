import type { Metadata } from 'next';
import JsonLd from '@/components/JsonLd';

export const metadata: Metadata = {
  title: "Pricing — HeyDPE | $39/mo Unlimited Practice",
  description: "Unlimited AI oral exam sessions for $39/month or $299/year. PPL, CPL, and IR. 3 free sessions, no credit card.",
  alternates: { canonical: 'https://heydpe.com/pricing' },
};

export default function PricingLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <JsonLd data={{
        "@context": "https://schema.org",
        "@type": "FAQPage",
        "mainEntity": [
          {
            "@type": "Question",
            "name": "Is there a free trial?",
            "acceptedAnswer": {
              "@type": "Answer",
              "text": "Yes! Both plans include a 7-day free trial. You won't be charged until the trial ends, and you can cancel anytime before that. No credit card tricks — we'll remind you before your trial expires."
            }
          },
          {
            "@type": "Question",
            "name": "Can I cancel anytime?",
            "acceptedAnswer": {
              "@type": "Answer",
              "text": "Absolutely. Cancel from your Settings page with one click. You'll retain full access until the end of your current billing period. No cancellation fees, no hassle."
            }
          },
          {
            "@type": "Question",
            "name": "What ratings are supported?",
            "acceptedAnswer": {
              "@type": "Answer",
              "text": "We support Private Pilot (FAA-S-ACS-6C), Commercial Pilot (FAA-S-ACS-7B), and Instrument Rating (FAA-S-ACS-8C) — 143+ ACS tasks total. ATP is coming soon."
            }
          },
          {
            "@type": "Question",
            "name": "How does voice mode work?",
            "acceptedAnswer": {
              "@type": "Answer",
              "text": "Voice mode lets you speak your answers naturally, just like a real oral exam. The AI examiner responds with a realistic DPE voice. Works in Chrome with the Web Speech API, and all paid tiers include cross-browser TTS support."
            }
          },
          {
            "@type": "Question",
            "name": "Is there a free tier?",
            "acceptedAnswer": {
              "@type": "Answer",
              "text": "Yes. New accounts get limited free sessions to explore the platform — no credit card required. Upgrade when you're ready for unlimited practice."
            }
          },
          {
            "@type": "Question",
            "name": "What payment methods do you accept?",
            "acceptedAnswer": {
              "@type": "Answer",
              "text": "We accept all major credit and debit cards via Stripe. Your payment information is securely processed by Stripe and never stored on our servers."
            }
          }
        ]
      }} />
      {children}
    </>
  );
}
