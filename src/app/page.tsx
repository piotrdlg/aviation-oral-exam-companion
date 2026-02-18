import Link from 'next/link';

export default function Home() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-950 px-4">
      <div className="max-w-2xl text-center">
        <h1 className="text-4xl sm:text-5xl font-bold text-white mb-2">
          HeyDPE
        </h1>
        <p className="text-lg text-gray-400 mb-2">
          Aviation Oral Exam Companion
        </p>
        <p className="text-base text-gray-500 mb-8 max-w-lg mx-auto">
          Practice for your FAA checkride with an AI examiner that follows ACS standards.
          Set your certificate rating and aircraft class once, then jump straight into practice.
        </p>

        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <Link
            href="/signup"
            className="px-8 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors"
          >
            Get Started
          </Link>
          <Link
            href="/login"
            className="px-8 py-3 bg-gray-800 hover:bg-gray-700 text-white rounded-lg font-medium border border-gray-700 transition-colors"
          >
            Sign In
          </Link>
        </div>

        <div className="mt-12 flex flex-wrap justify-center gap-2 text-xs text-gray-500">
          <span className="px-3 py-1 bg-gray-900 rounded-full border border-gray-800">Private Pilot (FAA-S-ACS-6C)</span>
          <span className="px-3 py-1 bg-gray-900 rounded-full border border-gray-800">Commercial Pilot (FAA-S-ACS-7B)</span>
          <span className="px-3 py-1 bg-gray-900 rounded-full border border-gray-800">Instrument Rating (FAA-S-ACS-8C)</span>
        </div>

        <div className="mt-10 grid grid-cols-1 sm:grid-cols-3 gap-6 text-left">
          <div className="p-4 bg-gray-900 rounded-lg border border-gray-800">
            <h3 className="text-white font-medium mb-2">ACS-Aligned</h3>
            <p className="text-gray-400 text-sm">Questions follow the FAA Airman Certification Standards. Choose your rating and aircraft class in Settings, and every session is tailored to your checkride.</p>
          </div>
          <div className="p-4 bg-gray-900 rounded-lg border border-gray-800">
            <h3 className="text-white font-medium mb-2">Voice-First</h3>
            <p className="text-gray-400 text-sm">Speak your answers naturally, just like a real oral exam with a DPE. Type or talk — your choice each session.</p>
          </div>
          <div className="p-4 bg-gray-900 rounded-lg border border-gray-800">
            <h3 className="text-white font-medium mb-2">Personalized</h3>
            <p className="text-gray-400 text-sm">Track progress across ACS areas, focus on weak spots, and pick up right where you left off between sessions.</p>
          </div>
        </div>

        <p className="mt-12 text-xs text-gray-600 max-w-md mx-auto leading-relaxed">
          For study purposes only. Not a substitute for instruction from a certificated
          flight instructor (CFI) or an actual DPE checkride. Always verify information
          against current FAA publications.
        </p>
      </div>
    </div>
  );
}
