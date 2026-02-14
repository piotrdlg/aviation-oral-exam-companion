'use client';

import { useState } from 'react';

export default function PracticePage() {
  const [sessionActive, setSessionActive] = useState(false);

  if (!sessionActive) {
    return (
      <div className="max-w-2xl mx-auto">
        <h1 className="text-2xl font-bold text-white mb-2">Practice Session</h1>
        <p className="text-gray-400 mb-8">
          Start an oral exam practice session. The AI examiner will ask you questions
          based on the FAA Private Pilot ACS.
        </p>

        <div className="bg-gray-900 rounded-xl border border-gray-800 p-6">
          <h2 className="text-lg font-medium text-white mb-4">New Session</h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm text-gray-300 mb-1">Rating</label>
              <select className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="private">Private Pilot</option>
              </select>
            </div>
            <button
              onClick={() => setSessionActive(true)}
              className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors"
            >
              Start Practice Exam
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold text-white">Oral Exam in Progress</h1>
        <button
          onClick={() => setSessionActive(false)}
          className="text-sm text-gray-400 hover:text-red-400 transition-colors"
        >
          End Session
        </button>
      </div>

      <div className="bg-gray-900 rounded-xl border border-gray-800 p-6 min-h-[400px] flex items-center justify-center">
        <p className="text-gray-500">
          Exam engine will be connected in Phase 2.
        </p>
      </div>
    </div>
  );
}
