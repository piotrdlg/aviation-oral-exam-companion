'use client';

import { useState } from 'react';

export interface SessionConfigData {
  studyMode: 'linear' | 'cross_acs' | 'weak_areas';
  difficulty: 'easy' | 'medium' | 'hard' | 'mixed';
  selectedAreas: string[];
  voiceEnabled: boolean;
}

const ACS_AREAS = [
  { id: 'I', name: 'Preflight Preparation' },
  { id: 'II', name: 'Preflight Procedures' },
  { id: 'III', name: 'Airport and Seaplane Base Operations' },
  { id: 'VI', name: 'Navigation' },
  { id: 'VII', name: 'Slow Flight and Stalls' },
  { id: 'VIII', name: 'Basic Instrument Maneuvers' },
  { id: 'IX', name: 'Emergency Operations' },
  { id: 'XI', name: 'Night Operations' },
  { id: 'XII', name: 'Postflight Procedures' },
];

interface Props {
  onStart: (config: SessionConfigData) => void;
  loading?: boolean;
}

export default function SessionConfig({ onStart, loading }: Props) {
  const [studyMode, setStudyMode] = useState<SessionConfigData['studyMode']>('cross_acs');
  const [difficulty, setDifficulty] = useState<SessionConfigData['difficulty']>('mixed');
  const [selectedAreas, setSelectedAreas] = useState<string[]>([]);
  const [voiceEnabled, setVoiceEnabled] = useState(false);

  function toggleArea(areaId: string) {
    setSelectedAreas((prev) =>
      prev.includes(areaId) ? prev.filter((a) => a !== areaId) : [...prev, areaId]
    );
  }

  return (
    <div className="bg-gray-900 rounded-xl border border-gray-800 p-6">
      <h2 className="text-lg font-medium text-white mb-4">New Session</h2>
      <div className="space-y-5">
        {/* Study Mode */}
        <div>
          <label className="block text-sm text-gray-300 mb-2">Study Mode</label>
          <div className="grid grid-cols-3 gap-2">
            {[
              { value: 'cross_acs' as const, label: 'Cross-ACS', desc: 'Random across all areas' },
              { value: 'linear' as const, label: 'Linear', desc: 'One area at a time' },
              { value: 'weak_areas' as const, label: 'Weak Areas', desc: 'Focus on your gaps' },
            ].map((mode) => (
              <button
                key={mode.value}
                onClick={() => setStudyMode(mode.value)}
                className={`p-3 rounded-lg border text-left transition-colors ${
                  studyMode === mode.value
                    ? 'border-blue-500 bg-blue-500/10 text-blue-400'
                    : 'border-gray-700 bg-gray-800 text-gray-400 hover:border-gray-600'
                }`}
              >
                <p className="text-sm font-medium">{mode.label}</p>
                <p className="text-xs mt-1 opacity-70">{mode.desc}</p>
              </button>
            ))}
          </div>
        </div>

        {/* Difficulty */}
        <div>
          <label className="block text-sm text-gray-300 mb-2">Difficulty</label>
          <div className="flex gap-2">
            {[
              { value: 'mixed' as const, label: 'Mixed' },
              { value: 'easy' as const, label: 'Easy' },
              { value: 'medium' as const, label: 'Medium' },
              { value: 'hard' as const, label: 'Hard' },
            ].map((d) => (
              <button
                key={d.value}
                onClick={() => setDifficulty(d.value)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  difficulty === d.value
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-800 text-gray-400 border border-gray-700 hover:border-gray-600'
                }`}
              >
                {d.label}
              </button>
            ))}
          </div>
        </div>

        {/* Area Selection (only for linear mode) */}
        {studyMode === 'linear' && (
          <div>
            <label className="block text-sm text-gray-300 mb-2">
              Select Areas {selectedAreas.length > 0 && `(${selectedAreas.length})`}
            </label>
            <div className="grid grid-cols-1 gap-1.5 max-h-48 overflow-y-auto">
              {ACS_AREAS.map((area) => (
                <button
                  key={area.id}
                  onClick={() => toggleArea(area.id)}
                  className={`px-3 py-2 rounded text-left text-sm transition-colors ${
                    selectedAreas.includes(area.id)
                      ? 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
                      : 'bg-gray-800 text-gray-400 border border-gray-700 hover:border-gray-600'
                  }`}
                >
                  <span className="font-mono text-xs opacity-60 mr-2">{area.id}</span>
                  {area.name}
                </button>
              ))}
            </div>
            {selectedAreas.length === 0 && (
              <p className="text-xs text-gray-600 mt-1">All areas will be included if none selected</p>
            )}
          </div>
        )}

        {/* Voice Toggle */}
        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={voiceEnabled}
            onChange={(e) => setVoiceEnabled(e.target.checked)}
            className="w-4 h-4 rounded border-gray-600 bg-gray-800 text-blue-500 focus:ring-blue-500"
          />
          <span className="text-sm text-gray-300">Enable voice mode (mic + speaker)</span>
        </label>

        {/* Start Button */}
        <button
          onClick={() => onStart({ studyMode, difficulty, selectedAreas, voiceEnabled })}
          disabled={loading}
          className="w-full py-3 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg font-medium transition-colors"
        >
          {loading ? 'Starting...' : 'Start Practice Exam'}
        </button>
      </div>
    </div>
  );
}
