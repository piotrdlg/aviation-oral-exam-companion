'use client';

import { useState } from 'react';
import type { InstructorConnection } from '@/hooks/useInstructorConnection';

interface Props {
  connection: InstructorConnection;
}

export function ReferralWelcomeBanner({ connection }: Props) {
  const [dismissed, setDismissed] = useState(false);

  if (dismissed || !connection.isNew) return null;

  return (
    <div className="mb-4 rounded-lg border border-c-amber/30 bg-c-amber-lo p-4 animate-in fade-in duration-500">
      <div className="flex items-start justify-between">
        <div>
          <p className="font-semibold text-c-amber font-mono text-sm">
            Connected with {connection.instructorName}!
          </p>
          <p className="mt-1 text-sm text-c-muted">
            Your instructor can now track your progress. Start a practice session to begin!
          </p>
        </div>
        <button
          onClick={() => setDismissed(true)}
          className="ml-4 text-c-dim hover:text-c-muted transition-colors shrink-0"
          aria-label="Dismiss"
        >
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  );
}
