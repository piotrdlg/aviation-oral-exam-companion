'use client';

import { useState } from 'react';
import { summarizeExam, studyModeLabel, joinAreas } from '@/lib/exam-summary';

/** Minimal session shape an open-exam row needs. The practice page's
 *  `resumableSession` state type is assignable to this. */
export interface OpenExamSession {
  id: string;
  rating: string;
  aircraft_class?: string | null;
  difficulty_preference?: string | null;
  exchange_count?: number | null;
  started_at: string;
  study_mode?: string | null;
  selected_areas?: string[] | null;
  selected_tasks?: string[] | null;
  acs_tasks_covered?: { task_id: string; status?: string | null; attempts?: number }[] | null;
}

interface Props {
  session: OpenExamSession;
  onContinue: () => void;
  onGrade: () => void;
  onDiscard: () => void;
  gradingInProgress: boolean;
  loading: boolean;
}

const RATING_LABELS: Record<string, string> = {
  commercial: 'Commercial',
  instrument: 'Instrument',
  atp: 'ATP',
  private: 'Private',
};

const DIFFICULTY_LABELS: Record<string, string> = {
  easy: 'Easy',
  medium: 'Medium',
  hard: 'Hard',
  mixed: 'Mixed',
};

const STATUS_STYLE: Record<string, { icon: string; cls: string; label: string }> = {
  satisfactory: { icon: '✓', cls: 'text-emerald-400', label: 'Satisfactory' },
  partial: { icon: '~', cls: 'text-amber-400', label: 'Partial' },
  unsatisfactory: { icon: '✗', cls: 'text-red-400', label: 'Unsatisfactory' },
};

function StatusChip({ status }: { status: string }) {
  const s = STATUS_STYLE[status] ?? { icon: '·', cls: 'text-c-muted', label: status };
  return (
    <span className={`font-mono ${s.cls}`} title={s.label} aria-label={s.label}>
      {s.icon}
    </span>
  );
}

/**
 * A single open-exam row, shared by the resume card's "Open exams" modal. Leads
 * with the ACS areas the exam covers (the real differentiator), expandable to
 * the individual tasks + their pass/partial/fail status, then Continue / Grade /
 * Discard. One source of truth so the card and modal can never drift.
 */
export default function OpenExamRow({
  session,
  onContinue,
  onGrade,
  onDiscard,
  gradingInProgress,
  loading,
}: Props) {
  const [expanded, setExpanded] = useState(false);

  const summary = summarizeExam(session);
  const hasCovered = summary.coveredAreas.length > 0;
  const exchanges = session.exchange_count || 0;

  const ratingLabel = RATING_LABELS[session.rating] ?? 'Private';
  const difficultyLabel = DIFFICULTY_LABELS[session.difficulty_preference ?? ''] ?? 'Mixed';
  const shortDate = new Date(session.started_at).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  });

  const areasLabel = hasCovered ? 'Covered' : 'Scope';
  const areasText = joinAreas(hasCovered ? summary.coveredAreas.map((a) => a.areaName) : summary.scopeAreaNames);
  const selectedTaskCount = session.selected_tasks?.length ?? 0;
  // Only offer expansion when there's something more to reveal.
  const canExpand = hasCovered || selectedTaskCount > 0 || (session.selected_areas?.length ?? 0) > 0;

  return (
    <div className="iframe rounded-lg p-3 border border-c-border">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-xs text-c-text">
            {ratingLabel}{session.aircraft_class ? ` ${session.aircraft_class}` : ''}, {difficultyLabel}
            {' '}&mdash; {exchanges} exchanges
          </p>

          {/* Areas line — the differentiator; click to reveal tasks. */}
          {canExpand ? (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              aria-expanded={expanded}
              className="mt-0.5 flex items-center gap-1 text-left text-xs hover:text-c-cyan transition-colors group"
            >
              <span className="text-c-muted group-hover:text-c-cyan w-2.5 inline-block">{expanded ? '▾' : '▸'}</span>
              <span>
                <span className="text-c-muted">{areasLabel}:</span>{' '}
                <span className="text-c-text">{areasText}</span>
                {!hasCovered && exchanges === 0 && <span className="text-c-muted"> · not started</span>}
              </span>
            </button>
          ) : (
            <p className="mt-0.5 text-xs">
              <span className="text-c-muted">{areasLabel}:</span>{' '}
              <span className="text-c-text">{areasText}</span>
              {!hasCovered && exchanges === 0 && <span className="text-c-muted"> · not started</span>}
            </p>
          )}

          <p className="text-xs text-c-muted mt-0.5">
            {shortDate} &middot; {studyModeLabel(session.study_mode)}
          </p>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <button
            onClick={onContinue}
            disabled={loading || gradingInProgress}
            title="Resume this exam where you left off"
            className="px-2.5 py-1 bg-c-cyan hover:bg-c-cyan-readable text-c-bg rounded text-xs font-semibold transition-colors disabled:opacity-50"
          >
            Continue
          </button>
          <button
            onClick={onGrade}
            disabled={gradingInProgress}
            title="Score &amp; keep this exam in your progress"
            className="px-2.5 py-1 bg-c-amber hover:bg-c-amber-bright text-c-bg rounded text-xs font-semibold transition-colors disabled:opacity-50"
          >
            {gradingInProgress ? '…' : 'Grade'}
          </button>
          <button
            onClick={onDiscard}
            title="Remove without counting toward progress"
            className="px-2.5 py-1 text-c-muted hover:text-red-400 text-xs font-semibold transition-colors"
          >
            Discard
          </button>
        </div>
      </div>

      {/* Expanded detail — covered tasks with status, or planned scope. */}
      {expanded && (
        <div className="mt-2 pt-2 border-t border-c-border space-y-1.5">
          {hasCovered ? (
            summary.coveredAreas.map((area) => (
              <div key={area.areaId}>
                <p className="font-mono text-[10px] uppercase tracking-wider text-c-muted">{area.areaName}</p>
                <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-0.5">
                  {area.tasks.map((t) => (
                    <span key={t.task_id} className="text-xs text-c-dim inline-flex items-center gap-1">
                      <StatusChip status={t.status} />
                      <span className="font-mono">{t.task_id}</span>
                    </span>
                  ))}
                </div>
              </div>
            ))
          ) : (
            <div>
              <p className="font-mono text-[10px] uppercase tracking-wider text-c-muted mb-0.5">Planned scope</p>
              <p className="text-xs text-c-dim">{summary.scopeAreaNames.join(', ')}</p>
              {selectedTaskCount > 0 && (
                <p className="text-xs text-c-dim mt-1">{selectedTaskCount} task{selectedTaskCount === 1 ? '' : 's'} selected</p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
