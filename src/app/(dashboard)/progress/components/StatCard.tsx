import type { ReactNode } from 'react';

type Accent = 'default' | 'cyan' | 'amber' | 'green';

interface Props {
  label: string;
  value: ReactNode;
  meta: string;
  accent?: Accent;
}

const ACCENT_CLASS: Record<Accent, string> = {
  default: 'text-c-text',
  cyan: 'text-c-cyan',
  amber: 'text-c-amber',
  green: 'text-c-green',
};

/**
 * One instrument readout: a mono caps label, a big tabular value, and a muted
 * one-line explanation of what the number means (the part the old bare tiles
 * were missing).
 */
export default function StatCard({ label, value, meta, accent = 'default' }: Props) {
  return (
    <div className="bezel rounded-lg border border-c-border p-4 flex flex-col gap-0.5">
      <span className="font-mono text-[10px] tracking-[0.16em] text-c-dim uppercase">{label}</span>
      <span className={`font-mono font-bold text-2xl tabular-nums leading-tight ${ACCENT_CLASS[accent]}`}>{value}</span>
      <span className="text-xs text-c-muted leading-snug">{meta}</span>
    </div>
  );
}
