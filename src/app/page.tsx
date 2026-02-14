import Link from 'next/link';

export default function Home() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-950 px-4">
      <div className="max-w-2xl text-center">
        <h1 className="text-4xl sm:text-5xl font-bold text-white mb-4">
          Aviation Oral Exam Companion
        </h1>
        <p className="text-lg text-gray-400 mb-8 max-w-lg mx-auto">
          Practice for your private pilot checkride with an AI examiner that follows FAA ACS standards.
        </p>

        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <Link
            href="/login"
            className="px-8 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors"
          >
            Sign In
          </Link>
          <Link
            href="/signup"
            className="px-8 py-3 bg-gray-800 hover:bg-gray-700 text-white rounded-lg font-medium border border-gray-700 transition-colors"
          >
            Create Account
          </Link>
        </div>

        <div className="mt-16 grid grid-cols-1 sm:grid-cols-3 gap-6 text-left">
          <div className="p-4 bg-gray-900 rounded-lg border border-gray-800">
            <h3 className="text-white font-medium mb-2">ACS-Aligned</h3>
            <p className="text-gray-400 text-sm">Questions follow the FAA Airman Certification Standards for Private Pilot.</p>
          </div>
          <div className="p-4 bg-gray-900 rounded-lg border border-gray-800">
            <h3 className="text-white font-medium mb-2">Voice-First</h3>
            <p className="text-gray-400 text-sm">Speak your answers naturally, just like a real oral exam with a DPE.</p>
          </div>
          <div className="p-4 bg-gray-900 rounded-lg border border-gray-800">
            <h3 className="text-white font-medium mb-2">Adaptive</h3>
            <p className="text-gray-400 text-sm">The AI examiner follows up on weak areas and navigates between topics naturally.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
