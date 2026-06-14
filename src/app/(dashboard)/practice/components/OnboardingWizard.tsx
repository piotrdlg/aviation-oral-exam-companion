'use client';

import { useState } from 'react';
import type { Rating, AircraftClass } from '@/types/database';
import type { Theme } from '@/types/database';
import { THEMES, setTheme } from '@/lib/theme';

interface Props {
  defaultRating: Rating;
  defaultAircraftClass: AircraftClass;
  defaultTheme?: Theme;
  onComplete: (config: {
    rating: Rating;
    aircraftClass: AircraftClass;
    aircraftType: string;
    homeAirport: string;
    voiceEnabled: boolean;
    theme: Theme;
    displayName: string;
    isOnboarding: boolean;
  }) => void;
  onSkip: () => void;
  onLearnMore: () => void;
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

import { captureVoiceEvent } from '@/lib/voice-telemetry';

export default function OnboardingWizard({ defaultRating, defaultAircraftClass, defaultTheme, onComplete, onSkip, onLearnMore, loading }: Props) {
  const [step, setStep] = useState(1);
  const [rating, setRating] = useState<Rating>(defaultRating);
  const [aircraftClass, setAircraftClass] = useState<AircraftClass>(defaultAircraftClass);
  const [aircraftType, setAircraftType] = useState('');
  const [homeAirport, setHomeAirport] = useState('');
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const [selectedTheme, setSelectedTheme] = useState<Theme>(defaultTheme || 'cockpit');
  const [displayName, setDisplayName] = useState('');
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
          preferredTheme: selectedTheme,
          displayName: displayName.trim() || null,
          voiceEnabled,
          onboardingCompleted: true,
        }),
      });
    } catch {
      // Continue anyway — session will still start
    }
    captureVoiceEvent('onboarding_completed', {});
    onComplete({
      rating,
      aircraftClass,
      aircraftType: aircraftType.trim(),
      homeAirport: homeAirport.trim(),
      voiceEnabled,
      theme: selectedTheme,
      displayName: displayName.trim(),
      isOnboarding: true,
    });
    setSaving(false);
  }

  async function handleLearnMore() {
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
          preferredTheme: selectedTheme,
          displayName: displayName.trim() || null,
          voiceEnabled,
          onboardingCompleted: true,
        }),
      });
    } catch {
      // Continue anyway
    }
    onLearnMore();
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
    <div data-testid="onboarding-wizard" className="fixed inset-0 z-50 flex items-center justify-center bg-c-bg/95 backdrop-blur-sm">
      <div className="max-w-lg w-full mx-4">
        {/* Progress dots */}
        <div data-testid="wizard-progress-dots" className="flex justify-center gap-2 mb-6">
          {[1, 2, 3, 4, 5, 6].map((s) => (
            <div
              key={s}
              data-testid={`wizard-dot-${s}`}
              className={`w-2.5 h-2.5 rounded-full transition-colors ${
                s === step
                  ? 'bg-c-amber'
                  : s < step
                  ? 'bg-c-amber/50'
                  : 'bg-c-border'
              }`}
            />
          ))}
        </div>

        {/* Skip link */}
        <div className="flex justify-end mb-4">
          <button
            data-testid="wizard-skip"
            onClick={handleSkip}
            className="text-sm text-c-amber hover:text-c-amber-bright transition-colors min-h-11 px-2"
          >
            I know what I&apos;m doing — full config &rarr;
          </button>
        </div>

        {/* Step 1: Rating selection */}
        {step === 1 && (
          <div data-testid="wizard-step-1" className="bezel rounded-lg border border-c-border p-8">
            <h2 className="font-bold text-2xl text-c-text tracking-tight text-center mb-2">
              What are you preparing for?
            </h2>
            <p className="text-base text-c-muted text-center mb-6">
              Select your certificate or rating
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
              {RATING_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setRating(opt.value)}
                  className={`p-4 rounded-lg border text-center transition-colors ${
                    rating === opt.value
                      ? 'station border-c-amber ring-1 ring-c-amber/30'
                      : 'border-c-border bg-c-bezel hover:border-c-border-hi'
                  }`}
                >
                  <div className={`mx-auto mb-2 ${rating === opt.value ? 'text-c-amber' : 'text-c-muted'}`}>
                    {opt.icon}
                  </div>
                  <p className={`text-base font-semibold ${rating === opt.value ? 'text-c-amber' : 'text-c-text'}`}>{opt.label}</p>
                  <p className="font-mono text-[11px] uppercase tracking-wider text-c-muted mt-0.5">{opt.abbr}</p>
                  <p className="text-sm text-c-muted mt-1 leading-relaxed">{opt.desc}</p>
                </button>
              ))}
            </div>

            <button
              data-testid="wizard-step1-next"
              onClick={() => setStep(2)}
              className="w-full min-h-11 py-3 bg-c-amber hover:bg-c-amber-bright text-c-bg rounded-lg font-semibold text-[15px] transition-colors shadow-lg shadow-c-amber/20"
            >
              Next
            </button>
          </div>
        )}

        {/* Step 2: Aircraft details */}
        {step === 2 && (
          <div data-testid="wizard-step-2" className="bezel rounded-lg border border-c-border p-8">
            <h2 className="font-bold text-2xl text-c-text tracking-tight text-center mb-2">
              Tell us about your aircraft
            </h2>
            <p className="text-base text-c-muted text-center mb-6">
              This helps personalize your exam
            </p>

            <div className="space-y-4 mb-6">
              {/* Aircraft class — only for Private/Commercial */}
              {showClassPicker ? (
                <div>
                  <label className="block font-mono text-[11px] text-c-muted mb-2 tracking-wider uppercase">What class of aircraft?</label>
                  <div className="grid grid-cols-4 gap-2">
                    {CLASS_OPTIONS.map((cls) => (
                      <button
                        key={cls.value}
                        onClick={() => setAircraftClass(cls.value)}
                        className={`min-h-11 py-2.5 rounded-lg border text-center transition-colors ${
                          aircraftClass === cls.value
                            ? 'station border-c-amber ring-1 ring-c-amber/30'
                            : 'border-c-border bg-c-bezel hover:border-c-border-hi'
                        }`}
                      >
                        <p className={`font-mono text-sm font-medium ${aircraftClass === cls.value ? 'text-c-amber' : 'text-c-muted'}`}>{cls.label}</p>
                        <p className="text-xs text-c-muted mt-0.5">{cls.desc}</p>
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="px-4 py-3 bg-c-panel rounded-lg border border-c-border">
                  <p className="text-sm text-c-text">Instrument Rating — Airplane</p>
                </div>
              )}

              {/* Aircraft type */}
              <div>
                <label className="block font-mono text-[11px] text-c-muted mb-2 tracking-wider uppercase">What type of aircraft do you fly?</label>
                <input
                  type="text"
                  value={aircraftType}
                  onChange={(e) => setAircraftType(e.target.value)}
                  placeholder="e.g., Cessna 172"
                  maxLength={100}
                  className="w-full px-3 py-2 bg-c-panel border border-c-border rounded-lg text-c-text text-sm placeholder-c-dim focus:outline-none focus:ring-1 focus:ring-c-amber focus:border-c-amber transition-colors"
                />
              </div>

              {/* Home airport */}
              <div>
                <label className="block font-mono text-[11px] text-c-muted mb-2 tracking-wider uppercase">What&apos;s your home airport?</label>
                <input
                  type="text"
                  value={homeAirport}
                  onChange={(e) => setHomeAirport(e.target.value.toUpperCase())}
                  placeholder="e.g., KJAX"
                  maxLength={10}
                  className="w-full px-3 py-2 bg-c-panel border border-c-border rounded-lg text-c-text font-mono text-sm placeholder-c-dim focus:outline-none focus:ring-1 focus:ring-c-amber focus:border-c-amber transition-colors uppercase"
                />
              </div>
            </div>

            <div className="flex items-center gap-3">
              <button
                data-testid="wizard-step2-back"
                onClick={() => setStep(1)}
                className="min-h-11 px-3 bg-c-bezel hover:bg-c-border text-c-text border border-c-border rounded-lg font-semibold text-[15px] transition-colors"
              >
                &larr; Back
              </button>
              <button
                data-testid="wizard-step2-next"
                onClick={() => setStep(3)}
                className="flex-1 min-h-11 py-3 bg-c-amber hover:bg-c-amber-bright text-c-bg rounded-lg font-semibold text-[15px] transition-colors shadow-lg shadow-c-amber/20"
              >
                Next
              </button>
            </div>
          </div>
        )}

        {/* Step 3: Display name */}
        {step === 3 && (
          <div data-testid="wizard-step-3" className="bezel rounded-lg border border-c-border p-8">
            <h2 className="font-bold text-2xl text-c-text tracking-tight text-center mb-2">
              What should we call you?
            </h2>
            <p className="text-base text-c-muted text-center mb-6">
              Your examiner will address you by name during exams
            </p>
            <input
              data-testid="wizard-name-input"
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="e.g., Mike, Sarah, Captain Smith"
              maxLength={50}
              className="w-full px-4 py-3 bg-c-panel border border-c-border rounded-lg text-c-text text-base placeholder-c-dim focus:outline-none focus:ring-1 focus:ring-c-amber focus:border-c-amber transition-colors text-center"
              autoFocus
            />
            <p className="text-sm text-c-dim mt-2 text-center">Optional — you can always change this in settings</p>
            <div className="flex items-center gap-3 mt-6">
              <button data-testid="wizard-step3-back" onClick={() => setStep(2)} className="min-h-11 px-3 bg-c-bezel hover:bg-c-border text-c-text border border-c-border rounded-lg font-semibold text-[15px] transition-colors">&larr; Back</button>
              <button
                data-testid="wizard-step3-next"
                onClick={() => setStep(4)}
                className="flex-1 min-h-11 py-3 bg-c-amber hover:bg-c-amber-bright text-c-bg rounded-lg font-semibold text-[15px] transition-colors shadow-lg shadow-c-amber/20"
              >
                {displayName.trim() ? 'Next' : 'Skip'}
              </button>
            </div>
          </div>
        )}

        {/* Step 4: Theme selection */}
        {step === 4 && (
          <div data-testid="wizard-step-4" className="bezel rounded-lg border border-c-border p-8">
            <h2 className="font-bold text-2xl text-c-text tracking-tight text-center mb-2">
              Customize your cockpit
            </h2>
            <p className="text-base text-c-muted text-center mb-6">
              Choose your instrument panel aesthetic
            </p>

            <div className="grid grid-cols-2 gap-3 mb-6">
              {THEMES.map((t) => (
                <button
                  key={t.id}
                  onClick={() => {
                    setSelectedTheme(t.id);
                    setTheme(t.id);
                  }}
                  className={`p-4 rounded-lg border text-center transition-colors ${
                    selectedTheme === t.id
                      ? 'station border-c-amber ring-1 ring-c-amber/30'
                      : 'border-c-border bg-c-bezel hover:border-c-border-hi'
                  }`}
                >
                  <div className="w-6 h-6 rounded-full mx-auto mb-2" style={{ background: t.accent }} />
                  <p className={`text-base font-semibold ${selectedTheme === t.id ? 'text-c-amber' : 'text-c-text'}`}>
                    {t.label}
                  </p>
                  <p className="text-sm text-c-muted mt-0.5 leading-relaxed">{t.desc}</p>
                </button>
              ))}
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={() => setStep(3)}
                className="min-h-11 px-3 bg-c-bezel hover:bg-c-border text-c-text border border-c-border rounded-lg font-semibold text-[15px] transition-colors"
              >
                &larr; Back
              </button>
              <button
                data-testid="wizard-step4-next"
                onClick={() => setStep(5)}
                className="flex-1 min-h-11 py-3 bg-c-amber hover:bg-c-amber-bright text-c-bg rounded-lg font-semibold text-[15px] transition-colors shadow-lg shadow-c-amber/20"
              >
                Next
              </button>
            </div>
          </div>
        )}

        {/* Step 5: Free Trial Explanation */}
        {step === 5 && (
          <div data-testid="wizard-step-5" className="bezel rounded-lg border border-c-border p-8">
            <h2 className="font-bold text-2xl text-c-text tracking-tight text-center mb-2">
              Your free trial
            </h2>
            <p className="text-base text-c-muted text-center mb-5">
              You are about to start your free 7-day trial
            </p>

            {/* What's included */}
            <div className="iframe rounded-lg p-4 mb-4">
              <p className="font-mono text-[11px] text-c-muted uppercase tracking-wider mb-3">What&apos;s included</p>
              <div className="space-y-2">
                <div className="flex items-start gap-2.5">
                  <span className="text-c-green text-sm mt-0.5">&#10003;</span>
                  <div>
                    <p className="text-sm text-c-text"><span className="text-c-green-readable font-semibold">1 onboarding exam</span> — pre-configured, starts right away</p>
                    <p className="text-xs text-c-dim mt-0.5">Does not count toward your trial limit</p>
                  </div>
                </div>
                <div className="flex items-start gap-2.5">
                  <span className="text-c-green text-sm mt-0.5">&#10003;</span>
                  <div>
                    <p className="text-sm text-c-text"><span className="text-c-cyan-readable font-semibold">3 practice exams</span> — full control over settings</p>
                    <p className="text-xs text-c-dim mt-0.5">Choose your study mode, difficulty, and focus areas</p>
                  </div>
                </div>
                <div className="flex items-start gap-2.5">
                  <span className="text-c-green text-sm mt-0.5">&#10003;</span>
                  <p className="text-sm text-c-text">Voice mode, FAA source references, ACS scoring — everything included</p>
                </div>
              </div>
            </div>

            {/* What is an exam */}
            <div className="iframe rounded-lg p-4 mb-4">
              <p className="font-mono text-[11px] text-c-muted uppercase tracking-wider mb-2">What is an exam?</p>
              <p className="text-sm text-c-muted leading-relaxed">
                An exam is one practice session with your AI examiner. You choose the rating, study mode
                (Area by Area, Random, or Weak Areas), and difficulty level. The examiner asks questions,
                assesses your answers, and grades your performance. You can pause and resume any exam
                within 7 days.
              </p>
            </div>

            {/* After the trial */}
            <div className="iframe rounded-lg p-4 mb-6">
              <p className="font-mono text-[11px] text-c-muted uppercase tracking-wider mb-2">After the trial</p>
              <p className="text-sm text-c-muted leading-relaxed">
                Each exam stays available for 7 days to pause and resume. After your 3 trial exams,
                subscribe to continue with unlimited exams. Plans start at <span className="text-c-amber font-mono font-semibold tabular-nums">$39/month</span>.
              </p>
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={() => setStep(4)}
                className="min-h-11 px-3 bg-c-bezel hover:bg-c-border text-c-text border border-c-border rounded-lg font-semibold text-[15px] transition-colors"
              >
                &larr; Back
              </button>
              <button
                data-testid="wizard-step5-next"
                onClick={() => setStep(6)}
                className="flex-1 min-h-11 py-3 bg-c-amber hover:bg-c-amber-bright text-c-bg rounded-lg font-semibold text-[15px] transition-colors shadow-lg shadow-c-amber/20"
              >
                Got it
              </button>
            </div>
          </div>
        )}

        {/* Step 6: Pre-configured First Exam + Launch */}
        {step === 6 && (
          <div data-testid="wizard-step-6" className="bezel rounded-lg border border-c-border p-8">
            <h2 className="font-bold text-2xl text-c-text tracking-tight text-center mb-2">
              Your first exam
            </h2>
            <p className="text-base text-c-muted text-center mb-5">
              We&apos;ve pre-configured this exam so you can jump right in
            </p>

            {/* Pre-configured exam summary */}
            <div className="iframe rounded-lg p-4 mb-4">
              <div className="space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-[11px] text-c-muted uppercase tracking-wider">Rating</span>
                  <span className="text-sm text-c-green-readable font-semibold">
                    {RATING_LABELS[rating]}
                    {showClassPicker && <span className="text-c-cyan-readable ml-1.5 font-mono">{aircraftClass}</span>}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="font-mono text-[11px] text-c-muted uppercase tracking-wider">Study mode</span>
                  <span className="text-sm text-c-text">Area by area (linear)</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="font-mono text-[11px] text-c-muted uppercase tracking-wider">Difficulty</span>
                  <span className="text-sm text-c-green-readable font-semibold">Easy</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="font-mono text-[11px] text-c-muted uppercase tracking-wider">Coverage</span>
                  <span className="text-sm text-c-text">All ACS areas (full checkride)</span>
                </div>
                {(aircraftType.trim() || homeAirport.trim()) && (
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-[11px] text-c-muted uppercase tracking-wider">Aircraft</span>
                    <span className="text-sm text-c-text font-mono">
                      {aircraftType.trim() || ''}{aircraftType.trim() && homeAirport.trim() ? ' / ' : ''}{homeAirport.trim() || ''}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Free badge */}
            <div className="flex items-center gap-2 mb-5 px-3 py-2 rounded-lg bg-c-green-lo/50 border border-c-green/20">
              <span className="text-c-green text-sm">&#10003;</span>
              <p className="text-sm text-c-green-readable">
                Onboarding exam — free, does not count toward your 3 trial exams
              </p>
            </div>

            {/* Voice toggle */}
            <label className="flex items-center gap-3 cursor-pointer mb-6 px-3 py-2.5 rounded-lg border border-c-border hover:border-c-border-hi bg-c-panel transition-colors min-h-11">
              <input
                type="checkbox"
                checked={voiceEnabled}
                onChange={(e) => setVoiceEnabled(e.target.checked)}
                className="w-4 h-4 rounded border-c-border bg-c-bezel text-c-green focus:ring-c-green"
              />
              <span className="text-sm text-c-text font-medium">Enable voice mode</span>
              <span className="text-xs text-c-dim">(mic + speaker)</span>
            </label>

            <div className="flex flex-col gap-3">
              <button
                data-testid="wizard-start-button"
                onClick={handleComplete}
                disabled={saving || loading}
                className="w-full min-h-11 py-3.5 bg-c-amber hover:bg-c-amber-bright disabled:opacity-50 text-c-bg rounded-lg font-semibold text-[15px] transition-colors shadow-lg shadow-c-amber/20"
              >
                {saving || loading ? 'Starting…' : 'Start exam now'}
              </button>
              <button
                onClick={handleLearnMore}
                disabled={saving || loading}
                className="w-full min-h-11 py-3 bg-c-bezel hover:bg-c-border disabled:opacity-50 text-c-text rounded-lg border border-c-border font-semibold text-[15px] transition-colors"
              >
                Explore first
              </button>
              <button
                onClick={() => setStep(5)}
                className="text-sm text-c-muted hover:text-c-text transition-colors mt-1 min-h-11 px-2"
              >
                &larr; Back
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
