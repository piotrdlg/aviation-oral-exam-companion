import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';

import type { ExamResultV2, AreaBreakdown, WeakElement } from '@/lib/exam-result';
import type {
  MilestoneKey,
  MilestoneStatus,
  MilestoneDeclaredByRole,
} from '@/types/database';
import { MILESTONE_KEYS } from '@/types/database';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface StudentInsights {
  studentUserId: string;
  readinessScore: number | null; // 0-100, from latest completed session
  readinessTrend: 'improving' | 'declining' | 'stable' | 'insufficient_data';
  coveragePercent: number | null; // % of plan elements asked
  totalSessions: number;
  completedSessions: number;
  lastActivityAt: string | null;
  areaBreakdown: AreaInsight[];
  weakAreas: string[]; // area codes with score < 0.60
  strongAreas: string[]; // area codes with score >= 0.85
  gapElements: string[]; // element codes not asked (severity = 'not_asked')
  recommendedTopics: string[]; // top 5 weak element codes
  milestones: MilestoneSnapshot[];
  needsAttention: boolean; // true if readiness < 60 OR declining trend OR no activity in 7 days
  needsAttentionReasons: string[];
}

export interface AreaInsight {
  area: string;
  score: number; // 0-100
  status: string;
  totalElements: number;
  askedElements: number;
  weakElementCount: number;
}

export interface MilestoneSnapshot {
  key: MilestoneKey;
  status: MilestoneStatus;
  declaredAt: string | null;
  declaredBy: MilestoneDeclaredByRole;
}

// ---------------------------------------------------------------------------
// Pure computation functions
// ---------------------------------------------------------------------------

/**
 * Compute readiness score (0-100) from an ExamResultV2.
 * Returns null if no result is available.
 */
export function computeReadiness(examResultV2: ExamResultV2 | null): number | null {
  if (!examResultV2) return null;
  return Math.round(examResultV2.overall_score * 100);
}

/**
 * Compute readiness trend from an array of readiness scores (newest first).
 *
 * - If fewer than 3 scores, returns 'insufficient_data'.
 * - Compares average of first 2 (most recent) vs last 2 (oldest):
 *   - diff > 5  → 'improving'
 *   - diff < -5 → 'declining'
 *   - otherwise → 'stable'
 */
export function computeReadinessTrend(
  scores: number[]
): 'improving' | 'declining' | 'stable' | 'insufficient_data' {
  if (scores.length < 3) return 'insufficient_data';

  const recentAvg = (scores[0] + scores[1]) / 2;
  const olderAvg = (scores[scores.length - 2] + scores[scores.length - 1]) / 2;
  const diff = recentAvg - olderAvg;

  if (diff > 5) return 'improving';
  if (diff < -5) return 'declining';
  return 'stable';
}

/**
 * Compute coverage percentage: elements asked or credited vs total in plan.
 * Returns null if no result is available.
 */
export function computeCoverage(examResultV2: ExamResultV2 | null): number | null {
  if (!examResultV2) return null;
  if (examResultV2.total_in_plan === 0) return null;
  return Math.round(
    ((examResultV2.elements_asked + examResultV2.elements_credited) /
      examResultV2.total_in_plan) *
      100
  );
}

/**
 * Extract area codes where the score is below 0.60 (weak).
 */
export function extractWeakAreas(areas: AreaBreakdown[]): string[] {
  return areas.filter((a) => a.score < 0.60).map((a) => a.area);
}

/**
 * Extract area codes where the score is at or above 0.85 (strong).
 */
export function extractStrongAreas(areas: AreaBreakdown[]): string[] {
  return areas.filter((a) => a.score >= 0.85).map((a) => a.area);
}

/**
 * Extract element codes that have severity 'not_asked' (coverage gaps).
 */
export function extractGapElements(weakElements: WeakElement[]): string[] {
  return weakElements
    .filter((e) => e.severity === 'not_asked')
    .map((e) => e.element_code);
}

/**
 * Recommend up to 5 topics for review, prioritized by severity:
 *   1. unsatisfactory
 *   2. partial
 *   3. not_asked
 *
 * Returns element_code strings.
 */
export function recommendTopics(weakElements: WeakElement[]): string[] {
  const severityOrder: Record<string, number> = {
    unsatisfactory: 0,
    partial: 1,
    not_asked: 2,
  };

  const sorted = [...weakElements].sort(
    (a, b) => severityOrder[a.severity] - severityOrder[b.severity]
  );

  return sorted.slice(0, 5).map((e) => e.element_code);
}

/**
 * Determine whether a student needs instructor attention, with reasons.
 *
 * Returns true + reasons if any of:
 *   - readiness is not null and below 60
 *   - trend is 'declining'
 *   - lastActivityAt is null or more than 7 days ago
 */
export function checkNeedsAttention(
  readiness: number | null,
  trend: string,
  lastActivityAt: string | null
): { needsAttention: boolean; reasons: string[] } {
  const reasons: string[] = [];

  if (readiness !== null && readiness < 60) {
    reasons.push('Readiness score below 60%');
  }

  if (trend === 'declining') {
    reasons.push('Performance trend is declining');
  }

  if (!lastActivityAt) {
    reasons.push('No practice activity in 7+ days');
  } else {
    const lastActivity = new Date(lastActivityAt);
    const now = new Date();
    const diffMs = now.getTime() - lastActivity.getTime();
    const diffDays = diffMs / (1000 * 60 * 60 * 24);
    if (diffDays > 7) {
      reasons.push('No practice activity in 7+ days');
    }
  }

  return {
    needsAttention: reasons.length > 0,
    reasons,
  };
}

// ---------------------------------------------------------------------------
// Database functions
// ---------------------------------------------------------------------------

/**
 * Fetch current milestones for a student, grouped by milestone_key.
 * Takes the latest declared_at per key and defaults missing keys to
 * { status: 'not_set', declaredAt: null, declaredBy: 'student' }.
 */
export async function getCurrentMilestones(
  supabase: SupabaseClient,
  studentUserId: string
): Promise<MilestoneSnapshot[]> {
  const { data: milestoneRows, error } = await supabase
    .from('student_milestones')
    .select('milestone_key, status, declared_at, declared_by_role')
    .eq('student_user_id', studentUserId)
    .order('declared_at', { ascending: false });

  if (error) {
    console.error('[instructor-insights] Failed to fetch milestones:', error.message);
    // Return defaults for all keys on error
    return MILESTONE_KEYS.map((key) => ({
      key,
      status: 'not_set' as MilestoneStatus,
      declaredAt: null,
      declaredBy: 'student' as MilestoneDeclaredByRole,
    }));
  }

  // Dedup: take the first (latest) entry per milestone_key
  const latestByKey = new Map<MilestoneKey, MilestoneSnapshot>();
  for (const row of milestoneRows ?? []) {
    const key = row.milestone_key as MilestoneKey;
    if (!latestByKey.has(key)) {
      latestByKey.set(key, {
        key,
        status: row.status as MilestoneStatus,
        declaredAt: row.declared_at as string | null,
        declaredBy: row.declared_by_role as MilestoneDeclaredByRole,
      });
    }
  }

  // Build full array with defaults for missing keys
  return MILESTONE_KEYS.map((key) =>
    latestByKey.get(key) ?? {
      key,
      status: 'not_set' as MilestoneStatus,
      declaredAt: null,
      declaredBy: 'student' as MilestoneDeclaredByRole,
    }
  );
}

/**
 * Main function: compute all instructor insights for a specific student.
 *
 * Verifies the instructor-student connection before returning data.
 * Returns null if the connection does not exist or is not in 'connected' state.
 *
 * @param supabase - Service-role Supabase client (bypasses RLS)
 * @param instructorUserId - The instructor's user ID
 * @param studentUserId - The student's user ID
 */
export async function getStudentInsights(
  supabase: SupabaseClient,
  instructorUserId: string,
  studentUserId: string
): Promise<StudentInsights | null> {
  // -----------------------------------------------------------------------
  // 1. Verify instructor-student connection
  // -----------------------------------------------------------------------
  const { data: connection, error: connError } = await supabase
    .from('student_instructor_connections')
    .select('id')
    .eq('instructor_user_id', instructorUserId)
    .eq('student_user_id', studentUserId)
    .eq('state', 'connected')
    .maybeSingle();

  if (connError) {
    console.error('[instructor-insights] Connection check failed:', connError.message);
    return null;
  }

  if (!connection) {
    return null;
  }

  // -----------------------------------------------------------------------
  // 2. Fetch sessions (up to 10 most recent completed for trend + totals)
  // -----------------------------------------------------------------------
  const { data: sessions, error: sessError } = await supabase
    .from('exam_sessions')
    .select('id, status, started_at, ended_at, metadata')
    .eq('user_id', studentUserId)
    .order('started_at', { ascending: false })
    .limit(50); // Fetch more than 10 to get accurate total counts

  if (sessError) {
    console.error('[instructor-insights] Session fetch failed:', sessError.message);
    return null;
  }

  const allSessions = sessions ?? [];
  const totalSessions = allSessions.length;
  const completedSessions = allSessions.filter((s) => s.status === 'completed').length;
  const lastActivityAt =
    allSessions.length > 0 ? (allSessions[0].ended_at ?? allSessions[0].started_at) : null;

  // -----------------------------------------------------------------------
  // 3. Extract ExamResultV2 from completed sessions (newest first)
  // -----------------------------------------------------------------------
  const completedWithResults: { result: ExamResultV2; startedAt: string }[] = [];

  for (const session of allSessions) {
    if (session.status !== 'completed') continue;
    const metadata = session.metadata as Record<string, unknown> | null;
    if (!metadata) continue;
    const examResultV2 = metadata.examResultV2 as ExamResultV2 | undefined;
    if (examResultV2 && examResultV2.version === 2) {
      completedWithResults.push({
        result: examResultV2,
        startedAt: session.started_at,
      });
    }
    // Only need up to 10 for trend computation
    if (completedWithResults.length >= 10) break;
  }

  // Latest result (for readiness, coverage, breakdowns)
  const latestResult = completedWithResults.length > 0 ? completedWithResults[0].result : null;

  // -----------------------------------------------------------------------
  // 4. Compute pure insight fields
  // -----------------------------------------------------------------------
  const readinessScore = computeReadiness(latestResult);

  const readinessScores = completedWithResults.map((c) =>
    Math.round(c.result.overall_score * 100)
  );
  const readinessTrend = computeReadinessTrend(readinessScores);

  const coveragePercent = computeCoverage(latestResult);

  const areas = latestResult?.areas ?? [];
  const weakElements = latestResult?.weak_elements ?? [];

  const areaBreakdown: AreaInsight[] = areas.map((a) => {
    const weakCount = weakElements.filter(
      (w) => w.area === a.area && w.severity !== 'not_asked'
    ).length;
    return {
      area: a.area,
      score: Math.round(a.score * 100),
      status: a.status,
      totalElements: a.total_in_plan,
      askedElements: a.asked,
      weakElementCount: weakCount,
    };
  });

  const weakAreas = extractWeakAreas(areas);
  const strongAreas = extractStrongAreas(areas);
  const gapElements = extractGapElements(weakElements);
  const recommendedTopics = recommendTopics(weakElements);

  const { needsAttention, reasons: needsAttentionReasons } = checkNeedsAttention(
    readinessScore,
    readinessTrend,
    lastActivityAt
  );

  // -----------------------------------------------------------------------
  // 5. Fetch milestones
  // -----------------------------------------------------------------------
  const milestones = await getCurrentMilestones(supabase, studentUserId);

  // -----------------------------------------------------------------------
  // 6. Assemble result
  // -----------------------------------------------------------------------
  return {
    studentUserId,
    readinessScore,
    readinessTrend,
    coveragePercent,
    totalSessions,
    completedSessions,
    lastActivityAt,
    areaBreakdown,
    weakAreas,
    strongAreas,
    gapElements,
    recommendedTopics,
    milestones,
    needsAttention,
    needsAttentionReasons,
  };
}
