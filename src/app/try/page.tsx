import Link from 'next/link';
import type { Metadata } from 'next';
import UTMCapture from '@/components/UTMCapture';
import Footer from '@/components/Footer';

export const metadata: Metadata = {
  title: "Try HeyDPE Free — AI Checkride Oral Exam Practice",
  description: "Practice your checkride oral with an AI DPE who actually listens. 3 free sessions, no credit card. Voice-first, ACS-scored.",
  alternates: { canonical: 'https://heydpe.com/try' },
};

export default function TryPage() {
  return (
    <div className="min-h-screen bg-c-bg">
      <UTMCapture />
      {/* Minimal Header — Logo only, no nav links */}
      <header className="fixed top-0 inset-x-0 z-50 border-b border-c-border bg-c-bg/80 backdrop-blur-lg">
        <div className="max-w-5xl mx-auto px-4 flex items-center h-14">
          <span className="font-mono font-bold text-c-amber glow-a text-sm tracking-widest">HEYDPE</span>
        </div>
      </header>

      {/* Hero */}
      <section className="pt-28 pb-20 px-4 relative noise">
        <div className="max-w-3xl mx-auto text-center relative z-10">
          <p className="s1 font-mono text-xs text-c-green glow-g tracking-[0.3em] uppercase mb-4">
            // VOICE-FIRST CHECKRIDE PREP
          </p>
          <h1 className="s2 font-mono font-bold text-3xl sm:text-4xl lg:text-5xl text-c-amber glow-a leading-tight tracking-tight uppercase">
            PRACTICE YOUR CHECKRIDE ORAL OUT LOUD
          </h1>
          <p className="s3 mt-6 text-base sm:text-lg text-c-text/70 max-w-2xl mx-auto leading-relaxed font-light">
            The only AI examiner you can actually talk to. Real-time voice, ACS-scored, PPL + CPL + IR.
          </p>
          <div className="s4 mt-10 flex flex-col items-center">
            <Link
              href="/signup"
              className="px-8 py-3.5 bg-c-amber hover:bg-c-amber/90 text-c-bg rounded-lg font-mono font-semibold text-sm tracking-wide transition-colors shadow-lg shadow-c-amber/20"
            >
              LET&apos;S TALK &mdash; START FREE
            </Link>
            <p className="mt-3 text-xs text-c-muted font-mono">
              3 FREE SESSIONS. NO CREDIT CARD REQUIRED.
            </p>
          </div>

          {/* Demo video placeholder */}
          <div className="s5 mt-12 bezel rounded-lg border border-c-border overflow-hidden">
            <div className="aspect-video flex flex-col items-center justify-center gap-4 p-8">
              <div className="w-16 h-16 rounded-full border-2 border-c-amber/40 flex items-center justify-center">
                <svg
                  className="w-7 h-7 text-c-amber ml-1"
                  fill="currentColor"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <path d="M8 5v14l11-7z" />
                </svg>
              </div>
              <p className="font-mono text-xs text-c-muted tracking-wide">DEMO VIDEO COMING SOON</p>
            </div>
          </div>
        </div>
      </section>

      {/* How It Works — Three Bullets */}
      <section className="py-20 px-4 border-t border-c-border">
        <div className="max-w-4xl mx-auto">
          <p className="font-mono text-xs text-c-cyan glow-c tracking-[0.3em] uppercase text-center mb-2">
            // HOW IT WORKS
          </p>
          <div className="grid sm:grid-cols-3 gap-6 mt-12">
            <div className="bezel rounded-lg p-6 text-center border border-c-border ipulse">
              <div className="w-12 h-12 mx-auto mb-4 rounded-full border-2 border-c-amber/50 flex items-center justify-center">
                <svg className="w-5 h-5 text-c-amber" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z" />
                </svg>
              </div>
              <h3 className="font-mono font-semibold text-c-amber text-sm mb-2 uppercase">SPEAK TO AN AI DPE</h3>
              <p className="text-c-muted text-xs leading-relaxed">
                Answer questions naturally, just like sitting across from a real examiner. Voice-first with text fallback.
              </p>
            </div>
            <div className="bezel rounded-lg p-6 text-center border border-c-border ipulse">
              <div className="w-12 h-12 mx-auto mb-4 rounded-full border-2 border-c-green/50 flex items-center justify-center">
                <svg className="w-5 h-5 text-c-green" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <h3 className="font-mono font-semibold text-c-green text-sm mb-2 uppercase">GET ACS-LEVEL SCORING</h3>
              <p className="text-c-muted text-xs leading-relaxed">
                Every answer scored as satisfactory, partial, or unsatisfactory against specific ACS knowledge elements.
              </p>
            </div>
            <div className="bezel rounded-lg p-6 text-center border border-c-border ipulse">
              <div className="w-12 h-12 mx-auto mb-4 rounded-full border-2 border-c-cyan/50 flex items-center justify-center">
                <svg className="w-5 h-5 text-c-cyan" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
                </svg>
              </div>
              <h3 className="font-mono font-semibold text-c-cyan text-sm mb-2 uppercase">TRACK EVERY WEAK SPOT</h3>
              <p className="text-c-muted text-xs leading-relaxed">
                Visual progress map shows exactly which ACS areas need more work. PPL, Commercial, and Instrument included.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Comparison Table */}
      <section className="py-20 px-4 bg-c-panel/30 border-y border-c-border">
        <div className="max-w-4xl mx-auto">
          <p className="font-mono text-xs text-c-cyan glow-c tracking-[0.3em] uppercase text-center mb-2">
            // WHY HEYDPE
          </p>
          <h2 className="font-mono font-bold text-2xl text-c-amber glow-a text-center mb-12 uppercase">
            NOT YOUR TYPICAL STUDY TOOL
          </h2>

          {/* Desktop table */}
          <div className="hidden sm:block bezel rounded-lg border border-c-border overflow-hidden">
            <table className="w-full text-xs font-mono">
              <thead>
                <tr className="border-b border-c-border">
                  <th className="text-left px-4 py-3 text-c-muted font-medium uppercase tracking-wide">Feature</th>
                  <th className="px-4 py-3 text-c-amber font-semibold uppercase tracking-wide">HeyDPE</th>
                  <th className="px-4 py-3 text-c-muted font-medium uppercase tracking-wide">CFI Mock Oral</th>
                  <th className="px-4 py-3 text-c-muted font-medium uppercase tracking-wide">Text AI Chatbots</th>
                  <th className="px-4 py-3 text-c-muted font-medium uppercase tracking-wide">Flashcards</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-c-border">
                <tr>
                  <td className="px-4 py-3 text-c-text">Voice interaction</td>
                  <td className="px-4 py-3 text-center text-c-green">&#10003;</td>
                  <td className="px-4 py-3 text-center text-c-green">&#10003;</td>
                  <td className="px-4 py-3 text-center text-c-muted">&#10005;</td>
                  <td className="px-4 py-3 text-center text-c-muted">&#10005;</td>
                </tr>
                <tr>
                  <td className="px-4 py-3 text-c-text">ACS scoring</td>
                  <td className="px-4 py-3 text-center text-c-green">&#10003;</td>
                  <td className="px-4 py-3 text-center text-c-muted">Varies</td>
                  <td className="px-4 py-3 text-center text-c-muted">&#10005;</td>
                  <td className="px-4 py-3 text-center text-c-muted">&#10005;</td>
                </tr>
                <tr>
                  <td className="px-4 py-3 text-c-text">Available 24/7</td>
                  <td className="px-4 py-3 text-center text-c-green">&#10003;</td>
                  <td className="px-4 py-3 text-center text-c-muted">&#10005;</td>
                  <td className="px-4 py-3 text-center text-c-green">&#10003;</td>
                  <td className="px-4 py-3 text-center text-c-green">&#10003;</td>
                </tr>
                <tr>
                  <td className="px-4 py-3 text-c-text">Follow-up questions</td>
                  <td className="px-4 py-3 text-center text-c-green">&#10003;</td>
                  <td className="px-4 py-3 text-center text-c-green">&#10003;</td>
                  <td className="px-4 py-3 text-center text-c-green">&#10003;</td>
                  <td className="px-4 py-3 text-center text-c-muted">&#10005;</td>
                </tr>
                <tr>
                  <td className="px-4 py-3 text-c-text">Progress tracking</td>
                  <td className="px-4 py-3 text-center text-c-green">&#10003;</td>
                  <td className="px-4 py-3 text-center text-c-muted">&#10005;</td>
                  <td className="px-4 py-3 text-center text-c-muted">&#10005;</td>
                  <td className="px-4 py-3 text-center text-c-muted">Some</td>
                </tr>
                <tr>
                  <td className="px-4 py-3 text-c-text">Cost per session</td>
                  <td className="px-4 py-3 text-center text-c-green font-semibold">~$1</td>
                  <td className="px-4 py-3 text-center text-c-muted">$50&ndash;150</td>
                  <td className="px-4 py-3 text-center text-c-muted">$20/mo</td>
                  <td className="px-4 py-3 text-center text-c-muted">$0&ndash;30</td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Mobile comparison cards */}
          <div className="sm:hidden space-y-4">
            {/* HeyDPE card */}
            <div className="bezel rounded-lg border border-c-amber/30 p-4">
              <h3 className="font-mono font-semibold text-c-amber text-sm mb-3 uppercase">HeyDPE</h3>
              <div className="space-y-2 text-xs">
                <div className="flex justify-between"><span className="text-c-muted">Voice interaction</span><span className="text-c-green">&#10003;</span></div>
                <div className="flex justify-between"><span className="text-c-muted">ACS scoring</span><span className="text-c-green">&#10003;</span></div>
                <div className="flex justify-between"><span className="text-c-muted">Available 24/7</span><span className="text-c-green">&#10003;</span></div>
                <div className="flex justify-between"><span className="text-c-muted">Follow-up questions</span><span className="text-c-green">&#10003;</span></div>
                <div className="flex justify-between"><span className="text-c-muted">Progress tracking</span><span className="text-c-green">&#10003;</span></div>
                <div className="flex justify-between"><span className="text-c-muted">Cost per session</span><span className="text-c-green font-semibold">~$1</span></div>
              </div>
            </div>
            {/* CFI Mock Oral card */}
            <div className="bezel rounded-lg border border-c-border p-4">
              <h3 className="font-mono font-semibold text-c-muted text-sm mb-3 uppercase">CFI Mock Oral</h3>
              <div className="space-y-2 text-xs">
                <div className="flex justify-between"><span className="text-c-muted">Voice interaction</span><span className="text-c-green">&#10003;</span></div>
                <div className="flex justify-between"><span className="text-c-muted">ACS scoring</span><span className="text-c-muted">Varies</span></div>
                <div className="flex justify-between"><span className="text-c-muted">Available 24/7</span><span className="text-c-muted">&#10005;</span></div>
                <div className="flex justify-between"><span className="text-c-muted">Follow-up questions</span><span className="text-c-green">&#10003;</span></div>
                <div className="flex justify-between"><span className="text-c-muted">Progress tracking</span><span className="text-c-muted">&#10005;</span></div>
                <div className="flex justify-between"><span className="text-c-muted">Cost per session</span><span className="text-c-muted">$50&ndash;150</span></div>
              </div>
            </div>
            {/* Text AI Chatbots card */}
            <div className="bezel rounded-lg border border-c-border p-4">
              <h3 className="font-mono font-semibold text-c-muted text-sm mb-3 uppercase">Text AI Chatbots</h3>
              <div className="space-y-2 text-xs">
                <div className="flex justify-between"><span className="text-c-muted">Voice interaction</span><span className="text-c-muted">&#10005;</span></div>
                <div className="flex justify-between"><span className="text-c-muted">ACS scoring</span><span className="text-c-muted">&#10005;</span></div>
                <div className="flex justify-between"><span className="text-c-muted">Available 24/7</span><span className="text-c-green">&#10003;</span></div>
                <div className="flex justify-between"><span className="text-c-muted">Follow-up questions</span><span className="text-c-green">&#10003;</span></div>
                <div className="flex justify-between"><span className="text-c-muted">Progress tracking</span><span className="text-c-muted">&#10005;</span></div>
                <div className="flex justify-between"><span className="text-c-muted">Cost per session</span><span className="text-c-muted">$20/mo</span></div>
              </div>
            </div>
            {/* Flashcards card */}
            <div className="bezel rounded-lg border border-c-border p-4">
              <h3 className="font-mono font-semibold text-c-muted text-sm mb-3 uppercase">Flashcards</h3>
              <div className="space-y-2 text-xs">
                <div className="flex justify-between"><span className="text-c-muted">Voice interaction</span><span className="text-c-muted">&#10005;</span></div>
                <div className="flex justify-between"><span className="text-c-muted">ACS scoring</span><span className="text-c-muted">&#10005;</span></div>
                <div className="flex justify-between"><span className="text-c-muted">Available 24/7</span><span className="text-c-green">&#10003;</span></div>
                <div className="flex justify-between"><span className="text-c-muted">Follow-up questions</span><span className="text-c-muted">&#10005;</span></div>
                <div className="flex justify-between"><span className="text-c-muted">Progress tracking</span><span className="text-c-muted">Some</span></div>
                <div className="flex justify-between"><span className="text-c-muted">Cost per session</span><span className="text-c-muted">$0&ndash;30</span></div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Social Proof */}
      <section className="py-16 px-4 border-b border-c-border">
        <div className="max-w-3xl mx-auto text-center">
          <p className="font-mono text-xs text-c-green glow-g tracking-[0.3em] uppercase mb-4">
            // COMMS CHECK
          </p>
          <p className="text-c-muted text-sm max-w-lg mx-auto">
            Trusted by student pilots preparing for their checkrides.
          </p>
          {/* TODO: Add testimonial cards here when available.
              Suggested format:
              <div className="bezel rounded-lg border border-c-border p-6 mt-8">
                <p className="text-c-text text-sm italic leading-relaxed">"Quote..."</p>
                <p className="mt-3 font-mono text-xs text-c-amber">— Name, Rating, Location</p>
              </div>
          */}
        </div>
      </section>

      {/* Final CTA */}
      <section className="py-20 px-4 relative noise">
        <div className="max-w-2xl mx-auto text-center relative z-10">
          <h2 className="s1 font-mono font-bold text-2xl sm:text-3xl text-c-amber glow-a mb-4 uppercase">
            YOUR DPE IS READY WHEN YOU ARE
          </h2>
          <p className="s2 text-c-muted mb-8 max-w-lg mx-auto text-sm">
            3 free sessions. No credit card. Cancel anytime.
          </p>
          <div className="s3 flex flex-col items-center">
            <Link
              href="/signup"
              className="px-8 py-3.5 bg-c-amber hover:bg-c-amber/90 text-c-bg rounded-lg font-mono font-semibold text-sm tracking-wide transition-colors shadow-lg shadow-c-amber/20"
            >
              LET&apos;S TALK &mdash; START FREE
            </Link>
            <p className="mt-4 text-xs text-c-muted font-mono max-w-sm">
              LESS THAN 1 HOUR OF FLIGHT TIME PER MONTH. $39/MO AFTER FREE TRIAL.
            </p>
          </div>
        </div>
      </section>

      <Footer variant="compact" />
    </div>
  );
}
