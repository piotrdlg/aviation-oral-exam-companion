import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Accessibility — HeyDPE',
  description: 'Accessibility statement for HeyDPE.',
};

/** W6.5 — honest current-state accessibility statement. */
export default function AccessibilityPage() {
  return (
    <div className="min-h-screen bg-c-bg text-c-text">
      <div className="max-w-3xl mx-auto px-6 py-16">
        <h1 className="font-mono font-bold text-2xl text-c-amber glow-a uppercase tracking-widest mb-2">
          Accessibility
        </h1>
        <p className="font-mono text-xs text-c-muted mb-10 uppercase">Last updated: June 10, 2026</p>

        <section className="mb-10">
          <h2 className="font-mono font-bold text-lg text-c-amber uppercase mb-4">Our commitment</h2>
          <p className="text-sm text-c-text/80 leading-relaxed">
            HeyDPE aims to be usable by every student pilot. We are early in our accessibility journey
            and believe in stating our current status honestly rather than claiming a conformance level
            we have not verified.
          </p>
        </section>

        <section className="mb-10">
          <h2 className="font-mono font-bold text-lg text-c-amber uppercase mb-4">Current state</h2>
          <ul className="text-sm text-c-text/80 leading-relaxed list-disc pl-5 space-y-2">
            <li><strong>Voice-first interaction</strong> — the core exam can be taken entirely by speaking and listening, which benefits users who find extended typing or reading difficult.</li>
            <li><strong>Keyboard navigation</strong> — primary flows (login, session setup, answering by text, settings) are operable by keyboard; we have not yet audited every secondary surface.</li>
            <li><strong>Screen readers</strong> — not yet systematically tested. Semantic HTML and labels are used in most components, but we do not claim screen-reader conformance today.</li>
            <li><strong>Contrast</strong> — the dark cockpit theme targets readable contrast for body text; some decorative monospace labels may fall below WCAG AA. A review is on our roadmap.</li>
            <li><strong>Captions/transcripts</strong> — every spoken examiner question also appears as on-screen text, and full session transcripts are available afterwards.</li>
          </ul>
        </section>

        <section className="mb-10">
          <h2 className="font-mono font-bold text-lg text-c-amber uppercase mb-4">Report an issue</h2>
          <p className="text-sm text-c-text/80 leading-relaxed">
            If something blocks you from using HeyDPE, email{' '}
            <a href="mailto:pd@imagineflying.com" className="text-c-cyan hover:text-c-amber underline underline-offset-2">
              pd@imagineflying.com
            </a>{' '}
            with the page and assistive technology involved. Accessibility reports are treated as bugs,
            not feature requests.
          </p>
        </section>
      </div>
    </div>
  );
}
