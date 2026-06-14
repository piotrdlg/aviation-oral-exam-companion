'use client';

import type { ReadinessTier } from '@/lib/progress-metrics';

interface Props {
  score: number;          // 0–100
  tier: ReadinessTier;
  hasData: boolean;       // false → honest "not calibrated" empty state
}

const TIER_LABEL: Record<ReadinessTier, string> = {
  ready: 'READY',
  progressing: 'PROGRESSING',
  building: 'BUILDING',
  starting: 'STARTING',
};

// Tier → app color token (stroke/text use the CSS var so themes carry through).
const TIER_VAR: Record<ReadinessTier, string> = {
  ready: 'var(--color-c-green)',
  progressing: 'var(--color-c-cyan)',
  building: 'var(--color-c-amber)',
  starting: 'var(--color-c-muted)',
};

const TIER_TEXT: Record<ReadinessTier, string> = {
  ready: 'text-c-green',
  progressing: 'text-c-cyan',
  building: 'text-c-amber',
  starting: 'text-c-muted',
};

/**
 * Readiness HSI gauge (FLIGHT DECK "Calibrated Panel"). A 0–100 semicircle:
 * dim track, a tier-colored fill arc whose length = score, and a needle that
 * points to the score. With no attempts yet it parks low and reads
 * "NOT CALIBRATED" rather than a misleading hollow 0.
 */
export default function ReadinessGauge({ score, tier, hasData }: Props) {
  const clamped = Math.max(0, Math.min(100, score));
  // value 0 → needle points left (−90°), 50 → up (0°), 100 → right (+90°).
  const angle = hasData ? (clamped / 100) * 180 - 90 : -84;
  const accent = hasData ? TIER_VAR[tier] : 'var(--color-c-dim)';

  return (
    <div className="bezel rounded-lg border border-c-border p-5 flex flex-col items-center col-span-2 md:col-span-1">
      <span className="self-start font-mono text-[11px] tracking-[0.18em] text-c-dim uppercase">Readiness</span>

      <div className="relative my-1">
        <svg width="200" height="132" viewBox="0 0 220 150" aria-hidden>
          {/* track */}
          <path d="M20 140 A 90 90 0 0 1 200 140" fill="none" stroke="var(--color-c-border)" strokeWidth="14" strokeLinecap="round" />
          {/* tier-colored fill arc, length = score% (pathLength normalized to 100) */}
          {hasData && clamped > 0 && (
            <path
              d="M20 140 A 90 90 0 0 1 200 140"
              fill="none"
              stroke={accent}
              strokeWidth="14"
              strokeLinecap="round"
              pathLength={100}
              strokeDasharray={`${clamped} 100`}
            />
          )}
          {/* tick marks at 0 / 50 / 100 */}
          <g stroke="var(--color-c-border-hi, #3A4456)" strokeWidth="2">
            <line x1="110" y1="50" x2="110" y2="40" />
            <line x1="48" y1="78" x2="41" y2="71" />
            <line x1="172" y1="78" x2="179" y2="71" />
          </g>
          {/* needle */}
          <g transform={`rotate(${angle} 110 140)`}>
            <line x1="110" y1="140" x2="110" y2="64" stroke={accent} strokeWidth="3" strokeLinecap="round" />
            <circle cx="110" cy="140" r="6" fill={accent} />
          </g>
        </svg>

        <div className="absolute inset-0 flex flex-col items-center justify-center pt-6">
          {hasData ? (
            <>
              <div className="flex items-baseline gap-0.5">
                <span className={`font-mono font-bold text-3xl tabular-nums ${TIER_TEXT[tier]}`}>{clamped}</span>
                <span className="font-mono text-xs text-c-dim">/100</span>
              </div>
              <span className={`font-mono text-[10px] tracking-[0.2em] ${TIER_TEXT[tier]}`}>{TIER_LABEL[tier]}</span>
            </>
          ) : (
            <>
              <span className="font-mono font-bold text-2xl text-c-dim">&mdash;</span>
              <span className="font-mono text-[10px] tracking-[0.18em] text-c-dim">NOT CALIBRATED</span>
            </>
          )}
        </div>
      </div>

      <p className="text-xs text-c-muted text-center mt-1 max-w-[26ch]">
        {hasData
          ? 'ACS coverage × answer quality. Cover more areas and answer well to raise it.'
          : 'Complete an exam to calibrate your readiness score.'}
      </p>
    </div>
  );
}
