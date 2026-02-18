import Link from 'next/link';

export default function Home() {
  return (
    <div className="min-h-screen bg-c-bg">
      {/* Nav */}
      <nav className="fixed top-0 inset-x-0 z-50 border-b border-c-border bg-c-bg/80 backdrop-blur-lg">
        <div className="max-w-5xl mx-auto px-4 flex items-center justify-between h-14">
          <span className="font-mono font-bold text-c-amber glow-a text-sm tracking-widest">HEYDPE</span>
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

      {/* Hero */}
      <section className="pt-28 pb-20 px-4 relative noise">
        <div className="max-w-3xl mx-auto text-center relative z-10">
          <p className="s1 font-mono text-xs text-c-green glow-g tracking-[0.3em] uppercase mb-4">
            // CHECKRIDE SIMULATION SYSTEM
          </p>
          <h1 className="s2 font-mono font-bold text-4xl sm:text-5xl lg:text-6xl text-c-amber glow-a leading-tight tracking-tight uppercase">
            YOUR DPE<br />IS READY
          </h1>
          <p className="s3 mt-6 text-base sm:text-lg text-c-text/70 max-w-2xl mx-auto leading-relaxed font-light">
            Practice your FAA checkride oral exam with an AI examiner that follows
            ACS standards. Speak your answers, get instant feedback, and track every
            weak spot.
          </p>
          <div className="s4 mt-10 flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              href="/signup"
              className="px-8 py-3.5 bg-c-amber hover:bg-c-amber/90 text-c-bg rounded-lg font-mono font-semibold text-sm tracking-wide transition-colors shadow-lg shadow-c-amber/20"
            >
              START PRACTICING FREE
            </Link>
            <Link
              href="/pricing"
              className="px-8 py-3.5 bg-c-bezel hover:bg-c-border text-c-text rounded-lg font-mono font-medium text-sm border border-c-border tracking-wide transition-colors"
            >
              VIEW PRICING
            </Link>
          </div>
          <p className="s5 mt-4 text-xs text-c-muted font-mono">
            NO CREDIT CARD REQUIRED. FREE SESSIONS INCLUDED.
          </p>
        </div>
      </section>

      {/* Social Proof Gauges */}
      <section className="py-12 border-y border-c-border bg-c-panel/50">
        <div className="max-w-4xl mx-auto px-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-6 text-center">
            <div className="s1">
              <div
                className="w-20 h-20 mx-auto rounded-full border-2 border-c-amber/40 flex items-center justify-center gauge"
                style={{ '--gc': '#f5a623', '--gp': '85%' } as React.CSSProperties}
              >
                <div className="w-16 h-16 rounded-full bg-c-panel flex items-center justify-center">
                  <span className="font-mono font-bold text-c-amber text-lg glow-a">143+</span>
                </div>
              </div>
              <p className="text-xs text-c-muted mt-2 font-mono">ACS TASKS</p>
            </div>
            <div className="s2">
              <div
                className="w-20 h-20 mx-auto rounded-full border-2 border-c-green/40 flex items-center justify-center gauge"
                style={{ '--gc': '#00ff41', '--gp': '60%' } as React.CSSProperties}
              >
                <div className="w-16 h-16 rounded-full bg-c-panel flex items-center justify-center">
                  <span className="font-mono font-bold text-c-green text-lg glow-g">3</span>
                </div>
              </div>
              <p className="text-xs text-c-muted mt-2 font-mono">RATINGS</p>
            </div>
            <div className="s3">
              <div
                className="w-20 h-20 mx-auto rounded-full border-2 border-c-cyan/40 flex items-center justify-center gauge"
                style={{ '--gc': '#00d4ff', '--gp': '70%' } as React.CSSProperties}
              >
                <div className="w-16 h-16 rounded-full bg-c-panel flex items-center justify-center">
                  <span className="font-mono font-bold text-c-cyan text-lg glow-c">6</span>
                </div>
              </div>
              <p className="text-xs text-c-muted mt-2 font-mono">FAA DOCS</p>
            </div>
            <div className="s4">
              <div
                className="w-20 h-20 mx-auto rounded-full border-2 border-c-amber/40 flex items-center justify-center gauge"
                style={{ '--gc': '#f5a623', '--gp': '100%' } as React.CSSProperties}
              >
                <div className="w-16 h-16 rounded-full bg-c-panel flex items-center justify-center">
                  <span className="font-mono font-bold text-c-amber text-sm glow-a">24/7</span>
                </div>
              </div>
              <p className="text-xs text-c-muted mt-2 font-mono">AVAILABLE</p>
            </div>
          </div>
          <div className="mt-8 flex flex-wrap justify-center gap-2">
            <span className="px-3 py-1 text-xs font-mono bg-c-panel text-c-green/80 rounded border border-c-green/20">
              PPL &mdash; FAA-S-ACS-6C
            </span>
            <span className="px-3 py-1 text-xs font-mono bg-c-panel text-c-cyan/80 rounded border border-c-cyan/20">
              CPL &mdash; FAA-S-ACS-7B
            </span>
            <span className="px-3 py-1 text-xs font-mono bg-c-panel text-c-amber/80 rounded border border-c-amber/20">
              IR &mdash; FAA-S-ACS-8C
            </span>
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="py-20 px-4">
        <div className="max-w-4xl mx-auto">
          <p className="font-mono text-xs text-c-cyan glow-c tracking-[0.3em] uppercase text-center mb-2">
            // PROCEDURE
          </p>
          <h2 className="font-mono font-bold text-2xl text-c-amber glow-a text-center mb-4 uppercase">
            THREE STEPS TO CHECKRIDE CONFIDENCE
          </h2>
          <p className="text-c-muted text-center mb-14 max-w-lg mx-auto text-sm">
            Set up once, then practice as often as you need.
          </p>
          <div className="grid sm:grid-cols-3 gap-6">
            <div className="bezel rounded-lg p-6 text-center border border-c-border ipulse">
              <div className="w-12 h-12 mx-auto mb-4 rounded-full border-2 border-c-amber/50 flex items-center justify-center">
                <span className="font-mono font-bold text-c-amber glow-a">01</span>
              </div>
              <h3 className="font-mono font-semibold text-c-amber text-sm mb-2 uppercase">SET YOUR RATING</h3>
              <p className="text-c-muted text-xs leading-relaxed">
                Choose Private, Commercial, or Instrument and your aircraft class. Saved in Settings.
              </p>
            </div>
            <div className="bezel rounded-lg p-6 text-center border border-c-border ipulse">
              <div className="w-12 h-12 mx-auto mb-4 rounded-full border-2 border-c-green/50 flex items-center justify-center">
                <span className="font-mono font-bold text-c-green glow-g">02</span>
              </div>
              <h3 className="font-mono font-semibold text-c-green text-sm mb-2 uppercase">PRACTICE WITH AI DPE</h3>
              <p className="text-c-muted text-xs leading-relaxed">
                Answer questions by voice or text. The examiner assesses each response naturally.
              </p>
            </div>
            <div className="bezel rounded-lg p-6 text-center border border-c-border ipulse">
              <div className="w-12 h-12 mx-auto mb-4 rounded-full border-2 border-c-cyan/50 flex items-center justify-center">
                <span className="font-mono font-bold text-c-cyan glow-c">03</span>
              </div>
              <h3 className="font-mono font-semibold text-c-cyan text-sm mb-2 uppercase">TRACK PROGRESS</h3>
              <p className="text-c-muted text-xs leading-relaxed">
                See which ACS areas are strong, which need work, and get study recommendations.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Demo Chat */}
      <section className="py-16 px-4 bg-c-panel/30 border-y border-c-border">
        <div className="max-w-2xl mx-auto">
          <p className="font-mono text-xs text-c-green glow-g tracking-[0.3em] uppercase text-center mb-2">
            // LIVE FEED
          </p>
          <h2 className="font-mono font-bold text-xl text-c-amber glow-a text-center mb-2 uppercase">
            SEE IT IN ACTION
          </h2>
          <p className="text-c-muted text-center mb-8 text-xs">
            A practice session looks and feels like the real thing.
          </p>
          <div className="bezel rounded-lg border border-c-border overflow-hidden">
            {/* Header bar */}
            <div className="px-4 py-3 border-b border-c-border flex items-center justify-between">
              <div>
                <p className="text-xs font-mono font-semibold text-c-green glow-g">ORAL EXAM // ACTIVE</p>
                <p className="text-xs text-c-muted font-mono">Preflight Preparation &gt; Weather Information</p>
              </div>
              <span className="text-xs text-c-muted font-mono">3 XCHG</span>
            </div>

            {/* Chat messages */}
            <div className="p-4 space-y-4">
              {/* Examiner message */}
              <div className="flex justify-start">
                <div className="max-w-[80%] bg-c-bezel rounded-lg px-4 py-3 border-l-2 border-c-amber/50">
                  <p className="text-[10px] font-mono text-c-amber mb-1">DPE EXAMINER</p>
                  <p className="text-sm text-c-text leading-relaxed">
                    You&apos;re planning a cross-country flight from Jacksonville to Savannah tomorrow morning.
                    Walk me through how you would obtain and interpret the weather information for this flight.
                  </p>
                </div>
              </div>

              {/* Applicant message */}
              <div className="flex justify-end">
                <div className="max-w-[80%] bg-c-cyan-lo/40 rounded-lg px-4 py-3 border-r-2 border-c-cyan/50">
                  <p className="text-[10px] font-mono text-c-cyan mb-1">APPLICANT</p>
                  <p className="text-sm text-c-text leading-relaxed">
                    I&apos;d start by checking the METARs and TAFs for both airports and any fields along my route.
                    I&apos;d also pull up the area forecast and look at the prog charts...
                  </p>
                  <div className="mt-2 pt-2 border-t border-c-border">
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-c-green-lo/40 text-c-green border border-c-green/20">
                      SATISFACTORY
                    </span>
                  </div>
                </div>
              </div>

              {/* Examiner follow-up */}
              <div className="flex justify-start">
                <div className="max-w-[80%] bg-c-bezel rounded-lg px-4 py-3 border-l-2 border-c-amber/50">
                  <p className="text-[10px] font-mono text-c-amber mb-1">DPE EXAMINER</p>
                  <p className="text-sm text-c-text leading-relaxed">
                    Good start. Now, the TAF shows &quot;TEMPO 1215/1218 1SM +TSRA.&quot;
                    What does that tell you, and how would it affect your go/no-go decision?
                  </p>
                </div>
              </div>
            </div>

            {/* Input bar (visual only) */}
            <div className="px-4 py-3 border-t border-c-border flex gap-2">
              <div className="flex-1 px-4 py-2.5 bg-c-bezel border border-c-border rounded-lg text-c-muted font-mono text-xs">
                Type your answer...
              </div>
              <div className="px-5 py-2.5 bg-c-amber rounded-lg text-c-bg font-mono text-xs font-semibold cursor-pointer hover:bg-c-amber/90 transition-colors">
                SEND
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Feature Cards */}
      <section className="py-20 px-4">
        <div className="max-w-4xl mx-auto">
          <p className="font-mono text-xs text-c-cyan glow-c tracking-[0.3em] uppercase text-center mb-2">
            // SYSTEMS
          </p>
          <h2 className="font-mono font-bold text-2xl text-c-amber glow-a text-center mb-4 uppercase">
            BUILT FOR SERIOUS CHECKRIDE PREP
          </h2>
          <p className="text-c-muted text-center mb-14 max-w-lg mx-auto text-sm">
            Every feature designed to simulate the real oral exam experience.
          </p>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <div className="bezel rounded-lg p-5 border border-c-border hover:border-c-amber/30 transition-colors group">
              <div className="w-8 h-8 rounded bg-c-amber-lo border border-c-amber/20 flex items-center justify-center mb-3">
                <span className="text-c-amber text-sm">&#10003;</span>
              </div>
              <h3 className="font-mono font-semibold text-c-amber text-xs mb-1.5 uppercase">ACS-ALIGNED QUESTIONS</h3>
              <p className="text-c-muted text-xs leading-relaxed">
                Every question maps to a specific ACS task and element code.
              </p>
            </div>
            <div className="bezel rounded-lg p-5 border border-c-border hover:border-c-green/30 transition-colors group">
              <div className="w-8 h-8 rounded bg-c-green-lo border border-c-green/20 flex items-center justify-center mb-3">
                <span className="text-c-green text-sm">&#9678;</span>
              </div>
              <h3 className="font-mono font-semibold text-c-green text-xs mb-1.5 uppercase">VOICE-FIRST EXPERIENCE</h3>
              <p className="text-c-muted text-xs leading-relaxed">
                Speak your answers like a real oral exam. Type when you prefer.
              </p>
            </div>
            <div className="bezel rounded-lg p-5 border border-c-border hover:border-c-cyan/30 transition-colors group">
              <div className="w-8 h-8 rounded bg-c-cyan-lo border border-c-cyan/20 flex items-center justify-center mb-3">
                <span className="text-c-cyan text-sm">&#9636;</span>
              </div>
              <h3 className="font-mono font-semibold text-c-cyan text-xs mb-1.5 uppercase">PROGRESS TRACKING</h3>
              <p className="text-c-muted text-xs leading-relaxed">
                Visual ACS coverage map, weak-area analysis, and study recs.
              </p>
            </div>
            <div className="bezel rounded-lg p-5 border border-c-border hover:border-c-amber/30 transition-colors group">
              <div className="w-8 h-8 rounded bg-c-amber-lo border border-c-amber/20 flex items-center justify-center mb-3">
                <span className="text-c-amber text-sm">&#9776;</span>
              </div>
              <h3 className="font-mono font-semibold text-c-amber text-xs mb-1.5 uppercase">FAA SOURCE REFERENCES</h3>
              <p className="text-c-muted text-xs leading-relaxed">
                Every assessment cites PHAK, AFH, AIM, and CFR sources.
              </p>
            </div>
            <div className="bezel rounded-lg p-5 border border-c-border hover:border-c-green/30 transition-colors group">
              <div className="w-8 h-8 rounded bg-c-green-lo border border-c-green/20 flex items-center justify-center mb-3">
                <span className="text-c-green text-sm">&#9881;</span>
              </div>
              <h3 className="font-mono font-semibold text-c-green text-xs mb-1.5 uppercase">PERSONALIZED DEFAULTS</h3>
              <p className="text-c-muted text-xs leading-relaxed">
                Save your rating and aircraft class. Start instantly.
              </p>
            </div>
            <div className="bezel rounded-lg p-5 border border-c-border hover:border-c-cyan/30 transition-colors group">
              <div className="w-8 h-8 rounded bg-c-cyan-lo border border-c-cyan/20 flex items-center justify-center mb-3">
                <span className="text-c-cyan text-sm">&#8634;</span>
              </div>
              <h3 className="font-mono font-semibold text-c-cyan text-xs mb-1.5 uppercase">SESSION RESUME</h3>
              <p className="text-c-muted text-xs leading-relaxed">
                Pause mid-exam and pick up later. Progress never lost.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Secondary CTA */}
      <section className="py-20 px-4 bg-c-panel/30 border-t border-c-border relative noise">
        <div className="max-w-2xl mx-auto text-center relative z-10">
          <h2 className="font-mono font-bold text-2xl text-c-amber glow-a mb-4 uppercase">
            READY TO ACE YOUR ORAL EXAM?
          </h2>
          <p className="text-c-muted mb-8 max-w-lg mx-auto text-sm">
            Join pilots using HeyDPE to prepare for their checkrides.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              href="/signup"
              className="px-8 py-3.5 bg-c-amber hover:bg-c-amber/90 text-c-bg rounded-lg font-mono font-semibold text-sm tracking-wide transition-colors shadow-lg shadow-c-amber/20"
            >
              GET STARTED FREE
            </Link>
            <Link
              href="/login"
              className="px-8 py-3.5 bg-c-bezel hover:bg-c-border text-c-text rounded-lg font-mono font-medium text-sm border border-c-border tracking-wide transition-colors"
            >
              SIGN IN
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-10 px-4 border-t border-c-border">
        <div className="max-w-4xl mx-auto">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mb-6">
            <span className="font-mono font-bold text-c-amber glow-a text-sm tracking-widest">HEYDPE</span>
            <div className="flex items-center gap-6 text-xs font-mono text-c-muted">
              <Link href="/pricing" className="hover:text-c-amber transition-colors">PRICING</Link>
              <Link href="/login" className="hover:text-c-text transition-colors">SIGN IN</Link>
              <Link href="/signup" className="hover:text-c-text transition-colors">GET STARTED</Link>
            </div>
          </div>
          <p className="text-[10px] text-c-muted text-center leading-relaxed max-w-xl mx-auto font-mono">
            FOR STUDY PURPOSES ONLY. NOT A SUBSTITUTE FOR INSTRUCTION FROM A CERTIFICATED
            FLIGHT INSTRUCTOR (CFI) OR AN ACTUAL DPE CHECKRIDE. ALWAYS VERIFY INFORMATION
            AGAINST CURRENT FAA PUBLICATIONS. HEYDPE IS A PRODUCT OF IMAGINE FLYING LLC,
            JACKSONVILLE, FL.
          </p>
        </div>
      </footer>
    </div>
  );
}
