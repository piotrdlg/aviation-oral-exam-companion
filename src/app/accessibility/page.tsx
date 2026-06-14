import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Accessibility — HeyDPE',
  description: 'Accessibility statement for HeyDPE.',
};

/** W6.5 — honest current-state accessibility statement. */
export default function AccessibilityPage() {
  return (
    <div className="min-h-screen bg-c-bg text-c-text">
      <main className="max-w-[65ch] mx-auto px-6 py-16">
        <p className="font-mono text-xs text-c-cyan tracking-[0.3em] uppercase mb-3">// Accessibility</p>
        <h1 className="font-bold text-4xl sm:text-5xl text-c-text tracking-tight mb-3">
          Accessibility statement
        </h1>
        <p className="text-sm text-c-muted mb-12">Last updated: June 10, 2026</p>

        <section className="mb-12">
          <h2 className="font-bold text-2xl text-c-text tracking-tight mb-4">Our commitment</h2>
          <p className="text-base text-c-text leading-relaxed">
            HeyDPE aims to be usable by every student pilot. We are early in our accessibility journey
            and believe in stating our current status honestly rather than claiming a conformance level
            we have not verified.
          </p>
        </section>

        <section className="mb-12">
          <h2 className="font-bold text-2xl text-c-text tracking-tight mb-4">Current state</h2>
          <ul className="text-base text-c-text leading-relaxed space-y-4">
            <li>
              <strong className="font-semibold text-c-text">Voice-first interaction</strong>
              <span className="text-c-muted"> — the core exam can be taken entirely by speaking and listening, which benefits users who find extended typing or reading difficult.</span>
            </li>
            <li>
              <strong className="font-semibold text-c-text">Keyboard navigation</strong>
              <span className="text-c-muted"> — primary flows (login, session setup, answering by text, settings) are operable by keyboard; we have not yet audited every secondary surface.</span>
            </li>
            <li>
              <strong className="font-semibold text-c-text">Screen readers</strong>
              <span className="text-c-muted"> — not yet systematically tested. Semantic HTML and labels are used in most components, but we do not claim screen-reader conformance today.</span>
            </li>
            <li>
              <strong className="font-semibold text-c-text">Contrast</strong>
              <span className="text-c-muted"> — the dark cockpit theme targets readable contrast for body text; some decorative monospace labels may fall below WCAG AA. A review is on our roadmap.</span>
            </li>
            <li>
              <strong className="font-semibold text-c-text">Captions and transcripts</strong>
              <span className="text-c-muted"> — every spoken examiner question also appears as on-screen text, and full session transcripts are available afterwards.</span>
            </li>
          </ul>
        </section>

        <section className="mb-12">
          <h2 className="font-bold text-2xl text-c-text tracking-tight mb-4">Report an issue</h2>
          <p className="text-base text-c-text leading-relaxed">
            If something blocks you from using HeyDPE, email{' '}
            <a href="mailto:pd@imagineflying.com" className="text-c-cyan-readable hover:text-c-cyan underline underline-offset-2 transition-colors">
              pd@imagineflying.com
            </a>{' '}
            with the page and assistive technology involved. Accessibility reports are treated as bugs,
            not feature requests.
          </p>
        </section>
      </main>
    </div>
  );
}
