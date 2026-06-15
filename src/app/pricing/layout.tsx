import type { Metadata } from 'next';
import JsonLd from '@/components/JsonLd';

export const metadata: Metadata = {
  title: "Pricing — HeyDPE | $39/mo Unlimited Practice",
  description: "Unlimited AI oral exam sessions for $39/month or $299/year. PPL, CPL, and IR. 7-day free trial with 3 exams — no credit card required.",
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
              "text": "Yes — and it's genuinely free. Every new account gets a 7-day free trial with 3 full practice exams, no credit card required. The free trial and the free tier are the same thing: full voice mode, AI assessment, and progress tracking, with nothing to enter up front. Upgrade to a paid plan whenever you want unlimited exams."
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
              "text": "Voice mode lets you speak your answers naturally, just like a real oral exam. The AI examiner responds with a realistic DPE voice. It works across modern browsers (Chrome, Safari, Edge, Firefox) on desktop and tablet — voice is included on every plan, including the free trial."
            }
          },
          {
            "@type": "Question",
            "name": "Do I get another free trial when I subscribe?",
            "acceptedAnswer": {
              "@type": "Answer",
              "text": "No — the free trial happens up front, before you ever enter a card. When you upgrade to a paid plan, your first month (or year) is billed immediately and your access continues uninterrupted. You can cancel anytime from Settings."
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
