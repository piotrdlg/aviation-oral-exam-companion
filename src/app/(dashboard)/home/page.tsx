'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import type { Rating } from '@/types/database';

const RATING_LABELS: Record<string, string> = {
  private: 'Private Pilot',
  commercial: 'Commercial Pilot',
  instrument: 'Instrument Rating',
  atp: 'ATP',
};

interface QuickStats {
  totalSessions: number;
  completedSessions: number;
  totalExchanges: number;
  displayName: string | null;
  rating: Rating;
}

export default function HomePage() {
  const [stats, setStats] = useState<QuickStats | null>(null);
  const [hasResumable, setHasResumable] = useState(false);
  const [loading, setLoading] = useState(true);
  // Collapsible pro tips
  const [expandedTip, setExpandedTip] = useState<number | null>(null);

  useEffect(() => {
    Promise.all([
      fetch('/api/user/tier').then((r) => r.ok ? r.json() : null),
      fetch('/api/session').then((r) => r.ok ? r.json() : null),
      fetch('/api/session?action=get-resumable').then((r) => r.ok ? r.json() : null),
    ])
      .then(([tierData, sessionData, resumableData]) => {
        const sessions = sessionData?.sessions || [];
        const completed = sessions.filter((s: { status: string }) => s.status === 'completed');
        const exchanges = sessions.reduce((sum: number, s: { exchange_count?: number }) => sum + (s.exchange_count || 0), 0);
        setStats({
          totalSessions: sessions.length,
          completedSessions: completed.length,
          totalExchanges: exchanges,
          displayName: tierData?.displayName || null,
          rating: tierData?.preferredRating || 'private',
        });
        setHasResumable(!!resumableData?.session);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const greeting = stats?.displayName
    ? `Welcome back, ${stats.displayName}`
    : 'Welcome to HeyDPE';

  const isNewUser = (stats?.totalSessions ?? 0) === 0;

  const proTips = [
    {
      title: 'USE VOICE MODE',
      content: 'Real checkrides are oral exams — the examiner asks, you speak. Enable voice mode to practice articulating your answers out loud. This builds the verbal fluency and confidence you\'ll need when sitting across from your DPE.',
      icon: '\u{1F3A4}',
    },
    {
      title: 'LET THE EXAM RUN DEEP',
      content: 'Longer sessions cover more ACS elements, giving the system better data about your strengths and weaknesses. Aim for at least 10-15 exchanges per session. The examiner naturally transitions between topics like a real DPE would.',
      icon: '\u{1F4CA}',
    },
    {
      title: 'REVIEW YOUR PROGRESS REGULARLY',
      content: 'After every few sessions, visit the Progress page. The ACS coverage treemap shows exactly which areas are strong (green) and which need work (red). Use this data to plan your next session.',
      icon: '\u{1F4C8}',
    },
    {
      title: 'DRILL SPECIFIC TASKS',
      content: 'Know your weak area? When configuring a new exam, expand the task picker to select only the tasks you want to focus on. Perfect for targeted practice on topics like weather, airspace, or regulations.',
      icon: '\u{1F3AF}',
    },
    {
      title: 'TRACK MULTIPLE RATINGS',
      content: 'Preparing for both your PPL and Instrument checkrides? Each rating has its own ACS task set and progress tracking. Switch ratings in Settings and run separate exams — your progress is tracked independently.',
      icon: '\u{2708}\u{FE0F}',
    },
  ];

  return (
    <div className="max-w-4xl mx-auto">
      {/* ====== Section 1: Welcome + Quick Start ====== */}
      <div className="s1 mb-8">
        <h1 className="font-mono font-bold text-2xl text-c-amber glow-a tracking-wider uppercase">
          {loading ? 'HOME' : greeting.toUpperCase()}
        </h1>
        {!loading && stats && (
          <p className="text-base text-c-muted mt-1">
            {isNewUser
              ? 'Your AI examiner is standing by. Let\u2019s get you checkride-ready.'
              : `${RATING_LABELS[stats.rating]} preparation \u2014 ${stats.completedSessions} exam${stats.completedSessions !== 1 ? 's' : ''} completed, ${stats.totalExchanges} exchanges`
            }
          </p>
        )}
      </div>

      {/* Quick actions */}
      {!loading && (
        <div className="s2 flex flex-col sm:flex-row gap-3 mb-10">
          {hasResumable && (
            <Link
              href="/practice"
              className="flex-1 flex items-center justify-center gap-2 px-5 py-3 bg-c-cyan hover:bg-c-cyan/90 text-c-bg rounded-lg font-mono font-semibold text-sm tracking-wide transition-colors shadow-lg shadow-c-cyan/20 uppercase"
            >
              <span>&#9654;</span> CONTINUE EXAM
            </Link>
          )}
          <Link
            href="/practice"
            className={`flex-1 flex items-center justify-center gap-2 px-5 py-3 rounded-lg font-mono font-semibold text-sm tracking-wide transition-colors uppercase ${
              hasResumable
                ? 'bg-c-bezel hover:bg-c-border text-c-text border border-c-border'
                : 'bg-c-amber hover:bg-c-amber/90 text-c-bg shadow-lg shadow-c-amber/20'
            }`}
          >
            {isNewUser ? 'START YOUR FIRST EXAM' : 'NEW EXAM'}
          </Link>
          <Link
            href="/progress"
            className="flex-1 flex items-center justify-center gap-2 px-5 py-3 bg-c-bezel hover:bg-c-border text-c-text rounded-lg border border-c-border font-mono font-semibold text-sm tracking-wide transition-colors uppercase"
          >
            VIEW PROGRESS
          </Link>
        </div>
      )}

      {/* ====== Section 2: How Your AI Examiner Works ====== */}
      <div className="s3 mb-10">
        <p className="font-mono text-xs text-c-cyan glow-c tracking-[0.3em] uppercase mb-2">
          // SYSTEM OVERVIEW
        </p>
        <h2 className="font-mono font-bold text-xl text-c-amber glow-a uppercase mb-6">
          HOW YOUR AI EXAMINER WORKS
        </h2>

        <div className="grid sm:grid-cols-3 gap-4">
          {/* Pillar 1: ACS-Based */}
          <div className="bezel rounded-lg p-5 border border-c-border">
            <div className="w-8 h-8 rounded bg-c-amber-lo border border-c-amber/20 flex items-center justify-center mb-3">
              <span className="text-c-amber text-sm font-mono font-bold">ACS</span>
            </div>
            <h3 className="font-mono font-semibold text-c-amber text-xs mb-2 uppercase">
              ACS-BASED QUESTIONING
            </h3>
            <p className="text-c-muted text-xs leading-relaxed">
              Your examiner follows the exact same Airman Certification Standards that real DPEs use.
              Each question targets specific knowledge (K), risk management (R), and skill (S) elements
              from the FAA ACS document for your rating.
            </p>
          </div>

          {/* Pillar 2: Adaptive Assessment */}
          <div className="bezel rounded-lg p-5 border border-c-border">
            <div className="w-8 h-8 rounded bg-c-green-lo border border-c-green/20 flex items-center justify-center mb-3">
              <span className="text-c-green text-sm">&#10003;</span>
            </div>
            <h3 className="font-mono font-semibold text-c-green text-xs mb-2 uppercase">
              ADAPTIVE ASSESSMENT
            </h3>
            <p className="text-c-muted text-xs leading-relaxed">
              Every answer is scored as satisfactory, partial, or unsatisfactory with specific feedback.
              Your exam grade uses a 70% threshold matching FAA practical test standards.
              The examiner adjusts follow-ups based on your performance.
            </p>
          </div>

          {/* Pillar 3: FAA Sources */}
          <div className="bezel rounded-lg p-5 border border-c-border">
            <div className="w-8 h-8 rounded bg-c-cyan-lo border border-c-cyan/20 flex items-center justify-center mb-3">
              <span className="text-c-cyan text-sm">&#9776;</span>
            </div>
            <h3 className="font-mono font-semibold text-c-cyan text-xs mb-2 uppercase">
              FAA SOURCE REFERENCES
            </h3>
            <p className="text-c-muted text-xs leading-relaxed">
              Assessments cross-reference official FAA publications — PHAK, AFH, AIM, and FAR/AIM.
              You see exact citations with page numbers so you can study the source material directly
              and verify the correct answers.
            </p>
          </div>
        </div>
      </div>

      {/* ====== Section 3: Study Strategies ====== */}
      <div className="s4 mb-10">
        <p className="font-mono text-xs text-c-green glow-g tracking-[0.3em] uppercase mb-2">
          // STUDY STRATEGIES
        </p>
        <h2 className="font-mono font-bold text-xl text-c-amber glow-a uppercase mb-2">
          THREE PATHS TO CHECKRIDE READINESS
        </h2>
        <p className="text-c-muted text-sm mb-6">
          Each study mode serves a different phase of your preparation. Use them in sequence for best results.
        </p>

        <div className="space-y-4">
          {/* Strategy 1: Linear */}
          <div className="bezel rounded-lg border border-c-border overflow-hidden">
            <div className="flex items-start gap-4 p-5">
              <div className="shrink-0 w-12 h-12 rounded-full border-2 border-c-amber/50 flex items-center justify-center">
                <span className="font-mono font-bold text-c-amber glow-a text-sm">01</span>
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-3 mb-1">
                  <h3 className="font-mono font-semibold text-c-amber text-sm uppercase">
                    FIRST PASS: AREA BY AREA
                  </h3>
                  <span className="px-2 py-0.5 rounded bg-c-amber-lo text-c-amber border border-c-amber/20 font-mono text-[10px] uppercase">
                    LINEAR MODE
                  </span>
                </div>
                <p className="text-c-muted text-xs leading-relaxed mb-3">
                  Works through ACS areas in order (I through XII), ensuring you cover every topic systematically.
                  The examiner completes one area before moving to the next, just like a structured study plan.
                </p>
                <div className="iframe rounded-lg p-3">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <p className="font-mono text-[10px] text-c-muted uppercase tracking-wider">BEST FOR</p>
                      <p className="text-xs text-c-text mt-0.5">Starting prep, 4+ weeks before checkride</p>
                    </div>
                    <div>
                      <p className="font-mono text-[10px] text-c-muted uppercase tracking-wider">DIFFICULTY</p>
                      <p className="text-xs text-c-text mt-0.5">Use Easy or Mixed</p>
                    </div>
                    <div>
                      <p className="font-mono text-[10px] text-c-muted uppercase tracking-wider">STRATEGY</p>
                      <p className="text-xs text-c-text mt-0.5">Focus on exposure, not perfection</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Strategy 2: Cross-ACS */}
          <div className="bezel rounded-lg border border-c-border overflow-hidden">
            <div className="flex items-start gap-4 p-5">
              <div className="shrink-0 w-12 h-12 rounded-full border-2 border-c-green/50 flex items-center justify-center">
                <span className="font-mono font-bold text-c-green glow-g text-sm">02</span>
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-3 mb-1">
                  <h3 className="font-mono font-semibold text-c-green text-sm uppercase">
                    DEEP DIVE: RANDOM CHALLENGES
                  </h3>
                  <span className="px-2 py-0.5 rounded bg-c-green-lo text-c-green border border-c-green/20 font-mono text-[10px] uppercase">
                    ACROSS ACS MODE
                  </span>
                </div>
                <p className="text-c-muted text-xs leading-relaxed mb-3">
                  Questions from any area at random, simulating a real oral exam where the DPE jumps between
                  topics. Builds your ability to recall knowledge under pressure without knowing what&apos;s coming next.
                </p>
                <div className="iframe rounded-lg p-3">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <p className="font-mono text-[10px] text-c-muted uppercase tracking-wider">BEST FOR</p>
                      <p className="text-xs text-c-text mt-0.5">Test readiness, 2-3 weeks out</p>
                    </div>
                    <div>
                      <p className="font-mono text-[10px] text-c-muted uppercase tracking-wider">DIFFICULTY</p>
                      <p className="text-xs text-c-text mt-0.5">Use Medium or Hard</p>
                    </div>
                    <div>
                      <p className="font-mono text-[10px] text-c-muted uppercase tracking-wider">STRATEGY</p>
                      <p className="text-xs text-c-text mt-0.5">Build recall under pressure</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Strategy 3: Weak Areas */}
          <div className="bezel rounded-lg border border-c-border overflow-hidden">
            <div className="flex items-start gap-4 p-5">
              <div className="shrink-0 w-12 h-12 rounded-full border-2 border-c-cyan/50 flex items-center justify-center">
                <span className="font-mono font-bold text-c-cyan glow-c text-sm">03</span>
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-3 mb-1">
                  <h3 className="font-mono font-semibold text-c-cyan text-sm uppercase">
                    FINAL PREP: TARGET WEAK SPOTS
                  </h3>
                  <span className="px-2 py-0.5 rounded bg-c-cyan-lo text-c-cyan border border-c-cyan/20 font-mono text-[10px] uppercase">
                    WEAK AREAS MODE
                  </span>
                </div>
                <p className="text-c-muted text-xs leading-relaxed mb-3">
                  Analyzes your past performance and focuses on areas where you scored lowest.
                  Questions are weighted toward unsatisfactory and partial elements to turn
                  your weaknesses into strengths before the real checkride.
                </p>
                <div className="iframe rounded-lg p-3">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <p className="font-mono text-[10px] text-c-muted uppercase tracking-wider">BEST FOR</p>
                      <p className="text-xs text-c-text mt-0.5">Final review, 1 week before</p>
                    </div>
                    <div>
                      <p className="font-mono text-[10px] text-c-muted uppercase tracking-wider">DIFFICULTY</p>
                      <p className="text-xs text-c-text mt-0.5">Use Mixed</p>
                    </div>
                    <div>
                      <p className="font-mono text-[10px] text-c-muted uppercase tracking-wider">STRATEGY</p>
                      <p className="text-xs text-c-text mt-0.5">Repeat until all areas are green</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ====== Section 4: Difficulty Levels ====== */}
      <div className="s5 mb-10">
        <p className="font-mono text-xs text-c-cyan glow-c tracking-[0.3em] uppercase mb-2">
          // DIFFICULTY SETTINGS
        </p>
        <h2 className="font-mono font-bold text-xl text-c-amber glow-a uppercase mb-6">
          CHOOSE YOUR CHALLENGE LEVEL
        </h2>

        <div className="bezel rounded-lg border border-c-border overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-c-border">
                <th className="px-4 py-3 font-mono text-[10px] text-c-muted uppercase tracking-wider font-normal text-left">Level</th>
                <th className="px-4 py-3 font-mono text-[10px] text-c-muted uppercase tracking-wider font-normal text-left">What to Expect</th>
                <th className="px-4 py-3 font-mono text-[10px] text-c-muted uppercase tracking-wider font-normal text-left hidden sm:table-cell">Best For</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-c-border/50">
                <td className="px-4 py-3">
                  <span className="font-mono text-xs text-c-green font-semibold">EASY</span>
                </td>
                <td className="px-4 py-3 text-xs text-c-text">Straightforward recall questions about core concepts</td>
                <td className="px-4 py-3 text-xs text-c-muted hidden sm:table-cell">First-time studying a topic</td>
              </tr>
              <tr className="border-b border-c-border/50">
                <td className="px-4 py-3">
                  <span className="font-mono text-xs text-c-cyan font-semibold">MEDIUM</span>
                </td>
                <td className="px-4 py-3 text-xs text-c-text">Application and scenario-based questions</td>
                <td className="px-4 py-3 text-xs text-c-muted hidden sm:table-cell">Building deeper understanding</td>
              </tr>
              <tr className="border-b border-c-border/50">
                <td className="px-4 py-3">
                  <span className="font-mono text-xs text-c-red font-semibold">HARD</span>
                </td>
                <td className="px-4 py-3 text-xs text-c-text">Complex scenarios, edge cases, &ldquo;stump the student&rdquo;</td>
                <td className="px-4 py-3 text-xs text-c-muted hidden sm:table-cell">Pre-checkride stress testing</td>
              </tr>
              <tr>
                <td className="px-4 py-3">
                  <span className="font-mono text-xs text-c-amber font-semibold">MIXED</span>
                </td>
                <td className="px-4 py-3 text-xs text-c-text">Random mix of all levels &mdash; most realistic</td>
                <td className="px-4 py-3 text-xs text-c-muted hidden sm:table-cell">General practice sessions</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* ====== Section 5: Pro Tips ====== */}
      <div className="s6 mb-6">
        <p className="font-mono text-xs text-c-green glow-g tracking-[0.3em] uppercase mb-2">
          // BEST PRACTICES
        </p>
        <h2 className="font-mono font-bold text-xl text-c-amber glow-a uppercase mb-6">
          PRO TIPS
        </h2>

        <div className="space-y-2">
          {proTips.map((tip, i) => (
            <div key={i} className="bezel rounded-lg border border-c-border overflow-hidden">
              <button
                onClick={() => setExpandedTip(expandedTip === i ? null : i)}
                className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-c-elevated/30 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <span className="text-base">{tip.icon}</span>
                  <span className="font-mono text-xs font-semibold text-c-text uppercase">{tip.title}</span>
                </div>
                <svg
                  className={`w-4 h-4 text-c-muted transition-transform ${expandedTip === i ? 'rotate-180' : ''}`}
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              {expandedTip === i && (
                <div className="px-4 pb-4 pt-0">
                  <div className="pl-9">
                    <p className="text-xs text-c-muted leading-relaxed">{tip.content}</p>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Bottom CTA */}
      {!loading && (
        <div className="text-center py-6 border-t border-c-border">
          <Link
            href="/practice"
            className="inline-flex items-center gap-2 px-8 py-3.5 bg-c-amber hover:bg-c-amber/90 text-c-bg rounded-lg font-mono font-semibold text-sm tracking-wide transition-colors shadow-lg shadow-c-amber/20 uppercase"
          >
            {isNewUser ? 'START YOUR FIRST EXAM' : 'START PRACTICING'}
            <span>&#9654;</span>
          </Link>
        </div>
      )}
    </div>
  );
}
