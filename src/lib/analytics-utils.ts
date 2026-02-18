// analytics-utils.ts — Pure utility functions for admin analytics dashboard

/**
 * Group an array of rows by a date field into { 'YYYY-MM-DD': count } buckets.
 */
export function groupByDate(
  rows: Array<Record<string, unknown>>,
  field: string
): Record<string, number> {
  const buckets: Record<string, number> = {};
  for (const row of rows) {
    const raw = row[field];
    if (!raw) continue;
    const date = new Date(raw as string).toISOString().slice(0, 10);
    buckets[date] = (buckets[date] || 0) + 1;
  }
  return buckets;
}

/**
 * Fill missing dates with 0 so sparklines have continuous data.
 * Returns sorted array from startDate going forward `days` days.
 */
export function fillDateGaps(
  buckets: Record<string, number>,
  startDate: Date,
  days: number
): Array<{ date: string; count: number }> {
  const result: Array<{ date: string; count: number }> = [];
  for (let i = 0; i < days; i++) {
    const d = new Date(startDate);
    d.setDate(d.getDate() + i);
    const key = d.toISOString().slice(0, 10);
    result.push({ date: key, count: buckets[key] || 0 });
  }
  return result;
}

/**
 * Compute Monthly Recurring Revenue in cents.
 * Monthly plan: $39/mo = 3900 cents
 * Annual plan: $299/yr ≈ $24.92/mo = 2492 cents
 */
export function computeMRR(monthlyCount: number, annualCount: number): number {
  const MONTHLY_CENTS = 3900;
  const ANNUAL_MONTHLY_CENTS = Math.round(29900 / 12); // 2492
  return monthlyCount * MONTHLY_CENTS + annualCount * ANNUAL_MONTHLY_CENTS;
}

/**
 * Standard SaaS retrospective churn rate.
 * churnRate = churnedInPeriod / (currentActive + churnedInPeriod)
 */
export function computeChurnRate(
  currentActive: number,
  churnedInPeriod: number
): number {
  const startOfPeriod = currentActive + churnedInPeriod;
  return startOfPeriod > 0 ? churnedInPeriod / startOfPeriod : 0;
}

/**
 * Trial-to-paid conversion rate.
 */
export function computeTrialConversion(
  convertedCount: number,
  totalTrialedCount: number
): number {
  return totalTrialedCount > 0 ? convertedCount / totalTrialedCount : 0;
}

/**
 * Average session duration in minutes from sessions with both started_at and ended_at.
 */
export function computeAvgDuration(
  sessions: Array<{ started_at: string; ended_at: string | null }>
): number {
  const completed = sessions.filter((s) => s.ended_at);
  if (completed.length === 0) return 0;
  const totalMs = completed.reduce((sum, s) => {
    return sum + (new Date(s.ended_at!).getTime() - new Date(s.started_at).getTime());
  }, 0);
  return totalMs / completed.length / 60000; // convert ms to minutes
}

/**
 * Format cents to dollars string: 3900 → "$39.00"
 */
export function formatCents(cents: number): string {
  return `$${(cents / 100).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/**
 * Format a 0-1 rate as percentage: 0.231 → "23.1%"
 */
export function formatPercent(rate: number): string {
  return `${(rate * 100).toFixed(1)}%`;
}

/**
 * Convert an ISO timestamp to a human-friendly relative time string.
 * "just now", "5m ago", "2h ago", "3d ago"
 */
export function relativeTime(isoString: string): string {
  const now = Date.now();
  const then = new Date(isoString).getTime();
  const diffMs = now - then;
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHr = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHr / 24);

  if (diffSec < 60) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHr < 24) return `${diffHr}h ago`;
  return `${diffDay}d ago`;
}
