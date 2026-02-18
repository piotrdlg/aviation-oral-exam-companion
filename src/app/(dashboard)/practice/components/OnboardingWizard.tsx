'use client';

import { useState } from 'react';
import type { Rating, AircraftClass } from '@/types/database';

interface Props {
  defaultRating: Rating;
  defaultAircraftClass: AircraftClass;
  onComplete: (config: {
    rating: Rating;
    aircraftClass: AircraftClass;
    aircraftType: string;
    homeAirport: string;
    voiceEnabled: boolean;
  }) => void;
  onSkip: () => void;
  loading?: boolean;
}

const RATING_OPTIONS = [
  {
    value: 'private' as Rating,
    label: 'Private Pilot',
    abbr: 'PPL',
    desc: 'Your first certificate',
    icon: (
      <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75m-3-7.036A11.959 11.959 0 0 1 3.598 6 11.99 11.99 0 0 0 3 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285Z" />
      </svg>
    ),
  },
  {
    value: 'commercial' as Rating,
    label: 'Commercial Pilot',
    abbr: 'CPL',
    desc: 'Fly for compensation',
    icon: (
      <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 14.15v4.25c0 1.094-.787 2.036-1.872 2.18-2.087.277-4.216.42-6.378.42s-4.291-.143-6.378-.42c-1.085-.144-1.872-1.086-1.872-2.18v-4.25m16.5 0a2.18 2.18 0 0 0 .75-1.661V8.706c0-1.081-.768-2.015-1.837-2.175a48.114 48.114 0 0 0-3.413-.387m4.5 8.006c-.194.165-.42.295-.673.38A23.978 23.978 0 0 1 12 15.75c-2.648 0-5.195-.429-7.577-1.22a2.016 2.016 0 0 1-.673-.38m0 0A2.18 2.18 0 0 1 3 12.489V8.706c0-1.081.768-2.015 1.837-2.175a48.111 48.111 0 0 1 3.413-.387m7.5 0V5.25A2.25 2.25 0 0 0 13.5 3h-3a2.25 2.25 0 0 0-2.25 2.25v.894m7.5 0a48.667 48.667 0 0 0-7.5 0M12 12.75h.008v.008H12v-.008Z" />
      </svg>
    ),
  },
  {
    value: 'instrument' as Rating,
    label: 'Instrument Rating',
    abbr: 'IR',
    desc: 'Fly in the clouds',
    icon: (
      <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
      </svg>
    ),
  },
];

const CLASS_OPTIONS: { value: AircraftClass; label: string; desc: string }[] = [
  { value: 'ASEL', label: 'ASEL', desc: 'Single-Engine Land' },
  { value: 'AMEL', label: 'AMEL', desc: 'Multi-Engine Land' },
  { value: 'ASES', label: 'ASES', desc: 'Single-Engine Sea' },
  { value: 'AMES', label: 'AMES', desc: 'Multi-Engine Sea' },
];

const RATING_LABELS: Record<string, string> = {
  private: 'Private Pilot',
  commercial: 'Commercial Pilot',
  instrument: 'Instrument Rating',
  atp: 'ATP',
};

export default function OnboardingWizard({ defaultRating, defaultAircraftClass, onComplete, onSkip, loading }: Props) {
  const [step, setStep] = useState(1);
  const [rating, setRating] = useState<Rating>(defaultRating);
  const [aircraftClass, setAircraftClass] = useState<AircraftClass>(defaultAircraftClass);
  const [aircraftType, setAircraftType] = useState('');
  const [homeAirport, setHomeAirport] = useState('');
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const [saving, setSaving] = useState(false);

  const showClassPicker = rating === 'private' || rating === 'commercial';

  async function handleComplete() {
    setSaving(true);
    try {
      await fetch('/api/user/tier', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          preferredRating: rating,
          preferredAircraftClass: aircraftClass,
          aircraftType: aircraftType.trim() || null,
          homeAirport: homeAirport.trim() || null,
          onboardingCompleted: true,
        }),
      });
    } catch {
      // Continue anyway — session will still start
    }
    onComplete({
      rating,
      aircraftClass,
      aircraftType: aircraftType.trim(),
      homeAirport: homeAirport.trim(),
      voiceEnabled,
    });
    setSaving(false);
  }

  async function handleSkip() {
    // Mark onboarding complete with current defaults, then show full config
    fetch('/api/user/tier', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ onboardingCompleted: true }),
    }).catch(() => {});
    onSkip();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-950/95 backdrop-blur-sm">
      <div className="max-w-lg w-full mx-4">
        {/* Progress dots */}
        <div className="flex justify-center gap-2 mb-6">
          {[1, 2, 3].map((s) => (
            <div
              key={s}
              className={`w-2.5 h-2.5 rounded-full transition-colors ${
                s === step
                  ? 'bg-blue-500'
                  : s < step
                  ? 'bg-blue-500/50'
                  : 'bg-gray-700'
              }`}
            />
          ))}
        </div>

        {/* Skip link */}
        <div className="flex justify-end mb-4">
          <button
            onClick={handleSkip}
            className="text-xs text-gray-500 hover:text-gray-400 transition-colors"
          >
            I know what I&apos;m doing &rarr; Full config
          </button>
        </div>

        {/* Step 1: Rating selection */}
        {step === 1 && (
          <div>
            <h2 className="text-xl font-bold text-white text-center mb-2">
              What are you preparing for?
            </h2>
            <p className="text-sm text-gray-400 text-center mb-6">
              Select your certificate or rating
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
              {RATING_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setRating(opt.value)}
                  className={`p-4 rounded-xl border text-center transition-all ${
                    rating === opt.value
                      ? 'border-blue-500 bg-blue-500/10 text-blue-400 ring-1 ring-blue-500/30'
                      : 'border-gray-700 bg-gray-800/50 text-gray-400 hover:border-gray-600'
                  }`}
                >
                  <div className={`mx-auto mb-2 ${rating === opt.value ? 'text-blue-400' : 'text-gray-500'}`}>
                    {opt.icon}
                  </div>
                  <p className="text-sm font-semibold">{opt.label}</p>
                  <p className="text-[10px] uppercase tracking-wider text-gray-500 mt-0.5">{opt.abbr}</p>
                  <p className="text-xs mt-1 opacity-60">{opt.desc}</p>
                </button>
              ))}
            </div>

            <button
              onClick={() => setStep(2)}
              className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors"
            >
              Next
            </button>
          </div>
        )}

        {/* Step 2: Aircraft details */}
        {step === 2 && (
          <div>
            <h2 className="text-xl font-bold text-white text-center mb-2">
              Tell us about your aircraft
            </h2>
            <p className="text-sm text-gray-400 text-center mb-6">
              This helps personalize your exam
            </p>

            <div className="space-y-4 mb-6">
              {/* Aircraft class — only for Private/Commercial */}
              {showClassPicker ? (
                <div>
                  <label className="block text-sm text-gray-300 mb-2">What class of aircraft?</label>
                  <div className="grid grid-cols-4 gap-2">
                    {CLASS_OPTIONS.map((cls) => (
                      <button
                        key={cls.value}
                        onClick={() => setAircraftClass(cls.value)}
                        className={`py-2.5 rounded-lg border text-center transition-colors ${
                          aircraftClass === cls.value
                            ? 'border-blue-500 bg-blue-500/10 text-blue-400'
                            : 'border-gray-700 bg-gray-800 text-gray-400 hover:border-gray-600'
                        }`}
                      >
                        <p className="text-sm font-medium">{cls.label}</p>
                        <p className="text-[10px] text-gray-500 mt-0.5">{cls.desc}</p>
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <p className="text-sm text-gray-400 bg-gray-800/50 rounded-lg px-4 py-3 border border-gray-700">
                  Instrument Rating — Airplane
                </p>
              )}

              {/* Aircraft type */}
              <div>
                <label className="block text-sm text-gray-300 mb-2">What type of aircraft do you fly?</label>
                <input
                  type="text"
                  value={aircraftType}
                  onChange={(e) => setAircraftType(e.target.value)}
                  placeholder="e.g., Cessna 172"
                  maxLength={100}
                  className="w-full px-4 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              {/* Home airport */}
              <div>
                <label className="block text-sm text-gray-300 mb-2">What&apos;s your home airport?</label>
                <input
                  type="text"
                  value={homeAirport}
                  onChange={(e) => setHomeAirport(e.target.value.toUpperCase())}
                  placeholder="e.g., KJAX"
                  maxLength={10}
                  className="w-full px-4 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={() => setStep(1)}
                className="text-sm text-gray-500 hover:text-gray-400 transition-colors"
              >
                &larr; Back
              </button>
              <button
                onClick={() => setStep(3)}
                className="flex-1 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors"
              >
                Next
              </button>
            </div>
          </div>
        )}

        {/* Step 3: Confirmation */}
        {step === 3 && (
          <div>
            <h2 className="text-xl font-bold text-white text-center mb-2">
              Ready to start?
            </h2>
            <p className="text-sm text-gray-400 text-center mb-6">
              Your AI examiner is standing by
            </p>

            {/* Summary */}
            <div className="bg-gray-800/50 rounded-xl border border-gray-700 p-4 mb-6 space-y-2">
              <p className="text-sm text-gray-300">
                <span className="text-gray-500">Preparing for:</span>{' '}
                <span className="text-white font-medium">{RATING_LABELS[rating]}</span>
                {showClassPicker && (
                  <>
                    <span className="text-gray-600 mx-1.5">&middot;</span>
                    <span className="text-white font-medium">{aircraftClass}</span>
                  </>
                )}
              </p>
              {(aircraftType.trim() || homeAirport.trim()) && (
                <p className="text-sm text-gray-400">
                  {aircraftType.trim() && (
                    <>Flying a <span className="text-white">{aircraftType.trim()}</span></>
                  )}
                  {aircraftType.trim() && homeAirport.trim() && ' out of '}
                  {!aircraftType.trim() && homeAirport.trim() && 'Home airport: '}
                  {homeAirport.trim() && (
                    <span className="text-white">{homeAirport.trim()}</span>
                  )}
                </p>
              )}
            </div>

            {/* Voice toggle */}
            <label className="flex items-center gap-3 cursor-pointer mb-6 px-1">
              <input
                type="checkbox"
                checked={voiceEnabled}
                onChange={(e) => setVoiceEnabled(e.target.checked)}
                className="w-4 h-4 rounded border-gray-600 bg-gray-800 text-blue-500 focus:ring-blue-500"
              />
              <span className="text-sm text-gray-300">Enable voice mode (mic + speaker)</span>
            </label>

            <div className="flex items-center gap-3">
              <button
                onClick={() => setStep(2)}
                className="text-sm text-gray-500 hover:text-gray-400 transition-colors"
              >
                &larr; Back
              </button>
              <button
                onClick={handleComplete}
                disabled={saving || loading}
                className="flex-1 py-3.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-xl font-semibold transition-colors text-base"
              >
                {saving || loading ? 'Starting...' : 'Start Your First Exam'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
