import Link from 'next/link';

export default function Home() {
  return (
    <div className="min-h-screen bg-gray-950">
      {/* ─── Sticky nav ─── */}
      <nav className="fixed top-0 inset-x-0 z-50 border-b border-gray-800/60 bg-gray-950/80 backdrop-blur-lg">
        <div className="max-w-5xl mx-auto px-4 flex items-center justify-between h-14">
          <span className="text-white font-semibold text-sm tracking-tight">HeyDPE</span>
          <div className="flex items-center gap-4">
            <Link href="/pricing" className="text-sm text-gray-400 hover:text-white transition-colors">
              Pricing
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

      {/* ─── 1. Hero ─── */}
      <section className="pt-32 pb-20 px-4">
        <div className="max-w-3xl mx-auto text-center">
          <h1 className="text-5xl sm:text-6xl font-bold text-white leading-tight tracking-tight">
            Your DPE Is Ready<br className="hidden sm:block" /> When You Are
          </h1>
          <p className="mt-6 text-lg sm:text-xl text-gray-400 max-w-2xl mx-auto leading-relaxed">
            Practice your FAA checkride oral exam with an AI examiner that follows
            ACS standards. Speak your answers, get instant feedback, and track every
            weak spot — on your schedule.
          </p>

          <div className="mt-10 flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              href="/signup"
              className="px-8 py-3.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-semibold text-base transition-colors shadow-lg shadow-blue-600/20"
            >
              Start Practicing Free
            </Link>
            <Link
              href="/pricing"
              className="px-8 py-3.5 bg-gray-800 hover:bg-gray-700 text-white rounded-xl font-medium text-base border border-gray-700 transition-colors"
            >
              View Pricing
            </Link>
          </div>

          <p className="mt-4 text-xs text-gray-600">No credit card required. Free sessions included.</p>
        </div>
      </section>

      {/* ─── 2. Social proof ─── */}
      <section className="py-12 border-y border-gray-800/60">
        <div className="max-w-4xl mx-auto px-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-8 text-center">
            <div>
              <p className="text-2xl font-bold text-white">143+</p>
              <p className="text-xs text-gray-500 mt-1">ACS Tasks Covered</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-white">3</p>
              <p className="text-xs text-gray-500 mt-1">Certificates &amp; Ratings</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-white">6</p>
              <p className="text-xs text-gray-500 mt-1">FAA Source Documents</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-white">24/7</p>
              <p className="text-xs text-gray-500 mt-1">Available Anytime</p>
            </div>
          </div>
          <div className="mt-8 flex flex-wrap justify-center gap-2">
            <span className="px-3 py-1 text-xs bg-gray-900 text-gray-400 rounded-full border border-gray-800">Private Pilot (FAA-S-ACS-6C)</span>
            <span className="px-3 py-1 text-xs bg-gray-900 text-gray-400 rounded-full border border-gray-800">Commercial Pilot (FAA-S-ACS-7B)</span>
            <span className="px-3 py-1 text-xs bg-gray-900 text-gray-400 rounded-full border border-gray-800">Instrument Rating (FAA-S-ACS-8C)</span>
          </div>
        </div>
      </section>

      {/* ─── 3. How it works ─── */}
      <section className="py-20 px-4">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-3xl font-bold text-white text-center mb-4">
            Three Steps to Checkride Confidence
          </h2>
          <p className="text-gray-400 text-center mb-14 max-w-lg mx-auto">
            Set up once, then practice as often as you need. No scheduling, no waiting.
          </p>

          <div className="grid sm:grid-cols-3 gap-8">
            <div className="text-center">
              <div className="w-12 h-12 mx-auto mb-4 rounded-xl bg-blue-600/10 border border-blue-500/20 flex items-center justify-center">
                <span className="text-blue-400 font-bold text-lg">1</span>
              </div>
              <h3 className="text-white font-semibold mb-2">Set Your Rating</h3>
              <p className="text-gray-400 text-sm leading-relaxed">
                Choose Private, Commercial, or Instrument and your aircraft class. Saved in Settings so every session is tailored to your checkride.
              </p>
            </div>
            <div className="text-center">
              <div className="w-12 h-12 mx-auto mb-4 rounded-xl bg-blue-600/10 border border-blue-500/20 flex items-center justify-center">
                <span className="text-blue-400 font-bold text-lg">2</span>
              </div>
              <h3 className="text-white font-semibold mb-2">Practice With Your AI DPE</h3>
              <p className="text-gray-400 text-sm leading-relaxed">
                Answer questions by voice or text. The examiner assesses each response, references FAA publications, and transitions between topics naturally.
              </p>
            </div>
            <div className="text-center">
              <div className="w-12 h-12 mx-auto mb-4 rounded-xl bg-blue-600/10 border border-blue-500/20 flex items-center justify-center">
                <span className="text-blue-400 font-bold text-lg">3</span>
              </div>
              <h3 className="text-white font-semibold mb-2">Track Your Progress</h3>
              <p className="text-gray-400 text-sm leading-relaxed">
                See which ACS areas are strong, which need work, and get study recommendations. Pick up where you left off between sessions.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ─── 4. Demo preview ─── */}
      <section className="py-16 px-4 bg-gray-900/40">
        <div className="max-w-2xl mx-auto">
          <h2 className="text-2xl font-bold text-white text-center mb-2">
            See It in Action
          </h2>
          <p className="text-gray-400 text-center mb-10 text-sm">
            A practice session looks and feels like the real thing.
          </p>

          {/* Simulated chat interface */}
          <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden shadow-2xl">
            {/* Header bar */}
            <div className="px-4 py-3 border-b border-gray-800 flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-white">Oral Exam in Progress</p>
                <p className="text-xs text-gray-500">Preflight Preparation &gt; Weather Information</p>
              </div>
              <span className="text-xs text-gray-600">3 exchanges</span>
            </div>

            {/* Chat messages */}
            <div className="p-4 space-y-4">
              {/* Examiner message */}
              <div className="flex justify-start">
                <div className="max-w-[80%] bg-gray-800 rounded-xl px-4 py-3">
                  <p className="text-xs font-medium text-gray-500 mb-1">DPE Examiner</p>
                  <p className="text-sm text-gray-100 leading-relaxed">
                    You&apos;re planning a cross-country flight from Jacksonville to Savannah tomorrow morning.
                    Walk me through how you would obtain and interpret the weather information for this flight.
                  </p>
                </div>
              </div>

              {/* Student message */}
              <div className="flex justify-end">
                <div className="max-w-[80%] bg-blue-600 rounded-xl px-4 py-3">
                  <p className="text-xs font-medium text-white/60 mb-1">You</p>
                  <p className="text-sm text-white leading-relaxed">
                    I&apos;d start by checking the METARs and TAFs for both airports and any fields along my route.
                    I&apos;d also pull up the area forecast and look at the prog charts...
                  </p>
                  <div className="mt-2 pt-2 border-t border-white/10">
                    <span className="text-xs px-2 py-0.5 rounded-full bg-green-900/40 text-green-400">satisfactory</span>
                  </div>
                </div>
              </div>

              {/* Examiner follow-up */}
              <div className="flex justify-start">
                <div className="max-w-[80%] bg-gray-800 rounded-xl px-4 py-3">
                  <p className="text-xs font-medium text-gray-500 mb-1">DPE Examiner</p>
                  <p className="text-sm text-gray-100 leading-relaxed">
                    Good start. Now, you check the TAF and it shows &quot;TEMPO 1215/1218 1SM +TSRA.&quot;
                    What does that tell you, and how would it affect your go/no-go decision?
                  </p>
                </div>
              </div>
            </div>

            {/* Input bar (visual only) */}
            <div className="px-4 py-3 border-t border-gray-800 flex gap-2">
              <div className="flex-1 px-4 py-2.5 bg-gray-800 border border-gray-700 rounded-xl text-gray-500 text-sm">
                Type your answer...
              </div>
              <div className="px-5 py-2.5 bg-blue-600 rounded-xl text-white text-sm font-medium">
                Send
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ─── 5. Feature cards ─── */}
      <section className="py-20 px-4">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-3xl font-bold text-white text-center mb-4">
            Built for Serious Checkride Prep
          </h2>
          <p className="text-gray-400 text-center mb-14 max-w-lg mx-auto">
            Every feature designed to simulate the real oral exam experience.
          </p>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
            <div className="p-5 bg-gray-900 rounded-xl border border-gray-800">
              <div className="w-9 h-9 rounded-lg bg-blue-600/10 flex items-center justify-center mb-3">
                <svg className="w-5 h-5 text-blue-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12c0 1.268-.63 2.39-1.593 3.068a3.745 3.745 0 0 1-1.043 3.296 3.745 3.745 0 0 1-3.296 1.043A3.745 3.745 0 0 1 12 21c-1.268 0-2.39-.63-3.068-1.593a3.746 3.746 0 0 1-3.296-1.043 3.745 3.745 0 0 1-1.043-3.296A3.745 3.745 0 0 1 3 12c0-1.268.63-2.39 1.593-3.068a3.745 3.745 0 0 1 1.043-3.296 3.746 3.746 0 0 1 3.296-1.043A3.746 3.746 0 0 1 12 3c1.268 0 2.39.63 3.068 1.593a3.746 3.746 0 0 1 3.296 1.043 3.745 3.745 0 0 1 1.043 3.296A3.745 3.745 0 0 1 21 12Z" />
                </svg>
              </div>
              <h3 className="text-white font-semibold mb-1.5">ACS-Aligned Questions</h3>
              <p className="text-gray-400 text-sm leading-relaxed">
                Every question maps to a specific ACS task and element code. The same standards your real DPE will use.
              </p>
            </div>

            <div className="p-5 bg-gray-900 rounded-xl border border-gray-800">
              <div className="w-9 h-9 rounded-lg bg-blue-600/10 flex items-center justify-center mb-3">
                <svg className="w-5 h-5 text-blue-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 0 0 6-6v-1.5m-6 7.5a6 6 0 0 1-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 0 1-3-3V4.5a3 3 0 1 1 6 0v8.25a3 3 0 0 1-3 3Z" />
                </svg>
              </div>
              <h3 className="text-white font-semibold mb-1.5">Voice-First Experience</h3>
              <p className="text-gray-400 text-sm leading-relaxed">
                Speak your answers like a real oral exam. The AI responds with a realistic DPE voice. Type when you prefer.
              </p>
            </div>

            <div className="p-5 bg-gray-900 rounded-xl border border-gray-800">
              <div className="w-9 h-9 rounded-lg bg-blue-600/10 flex items-center justify-center mb-3">
                <svg className="w-5 h-5 text-blue-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 0 1 3 19.875v-6.75ZM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V8.625ZM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V4.125Z" />
                </svg>
              </div>
              <h3 className="text-white font-semibold mb-1.5">Progress Tracking</h3>
              <p className="text-gray-400 text-sm leading-relaxed">
                Visual ACS coverage map, weak-area analysis, and study recommendations. See exactly where you stand.
              </p>
            </div>

            <div className="p-5 bg-gray-900 rounded-xl border border-gray-800">
              <div className="w-9 h-9 rounded-lg bg-blue-600/10 flex items-center justify-center mb-3">
                <svg className="w-5 h-5 text-blue-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 0 0 6 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 0 1 6 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 0 1 6-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0 0 18 18a8.967 8.967 0 0 0-6 2.292m0-14.25v14.25" />
                </svg>
              </div>
              <h3 className="text-white font-semibold mb-1.5">FAA Source References</h3>
              <p className="text-gray-400 text-sm leading-relaxed">
                Every assessment cites PHAK, AFH, AIM, and CFR sources so you can verify and study deeper.
              </p>
            </div>

            <div className="p-5 bg-gray-900 rounded-xl border border-gray-800">
              <div className="w-9 h-9 rounded-lg bg-blue-600/10 flex items-center justify-center mb-3">
                <svg className="w-5 h-5 text-blue-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28Z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
                </svg>
              </div>
              <h3 className="text-white font-semibold mb-1.5">Personalized Defaults</h3>
              <p className="text-gray-400 text-sm leading-relaxed">
                Save your certificate rating and aircraft class in Settings. Start sessions instantly with zero setup.
              </p>
            </div>

            <div className="p-5 bg-gray-900 rounded-xl border border-gray-800">
              <div className="w-9 h-9 rounded-lg bg-blue-600/10 flex items-center justify-center mb-3">
                <svg className="w-5 h-5 text-blue-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182" />
                </svg>
              </div>
              <h3 className="text-white font-semibold mb-1.5">Session Resume</h3>
              <p className="text-gray-400 text-sm leading-relaxed">
                Pause mid-exam and pick up later with full conversation history. Your progress is never lost.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ─── 6. Secondary CTA ─── */}
      <section className="py-20 px-4 bg-gray-900/40 border-t border-gray-800/60">
        <div className="max-w-2xl mx-auto text-center">
          <h2 className="text-3xl font-bold text-white mb-4">
            Ready to Ace Your Oral Exam?
          </h2>
          <p className="text-gray-400 mb-8 max-w-lg mx-auto">
            Join pilots who are using HeyDPE to prepare for their checkrides. Start with free sessions, upgrade when you&apos;re ready.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              href="/signup"
              className="px-8 py-3.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-semibold text-base transition-colors shadow-lg shadow-blue-600/20"
            >
              Get Started Free
            </Link>
            <Link
              href="/login"
              className="px-8 py-3.5 bg-gray-800 hover:bg-gray-700 text-white rounded-xl font-medium text-base border border-gray-700 transition-colors"
            >
              Sign In
            </Link>
          </div>
        </div>
      </section>

      {/* ─── 7. Footer ─── */}
      <footer className="py-10 px-4 border-t border-gray-800/60">
        <div className="max-w-4xl mx-auto">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mb-6">
            <span className="text-white font-semibold text-sm">HeyDPE</span>
            <div className="flex items-center gap-6 text-sm text-gray-500">
              <Link href="/pricing" className="hover:text-gray-300 transition-colors">Pricing</Link>
              <Link href="/login" className="hover:text-gray-300 transition-colors">Sign In</Link>
              <Link href="/signup" className="hover:text-gray-300 transition-colors">Get Started</Link>
            </div>
          </div>
          <p className="text-xs text-gray-600 text-center leading-relaxed max-w-xl mx-auto">
            For study purposes only. Not a substitute for instruction from a certificated
            flight instructor (CFI) or an actual DPE checkride. Always verify information
            against current FAA publications. HeyDPE is a product of Imagine Flying LLC, Jacksonville, FL.
          </p>
        </div>
      </footer>
    </div>
  );
}
