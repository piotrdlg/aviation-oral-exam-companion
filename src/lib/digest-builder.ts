import { createClient } from '@supabase/supabase-js';
import type { Rating, AssessmentScore } from '@/types/database';

// ============================================================
// Types
// ============================================================

export interface DigestWeakArea {
  elementCode: string;
  description: string;
  area: string;
  satisfactoryRate: number; // 0-100
  totalAttempts: number;
  latestScore: string | null;
}

export interface DigestStrongArea {
  elementCode: string;
  description: string;
  area: string;
  satisfactoryRate: number; // 0-100
}

export interface DigestData {
  displayName: string;
  rating: Rating;
  // Session stats
  totalSessions: number;
  recentSessionCount: number; // last 7 days
  totalExchanges: number;
  // Weak areas (top 3-5)
  weakAreas: DigestWeakArea[];
  // Strong areas (top 3)
  strongAreas: DigestStrongArea[];
  // Study recommendations
  recommendations: string[];
  // Metadata
  generatedAt: string;
  unsubscribeUrl: string;
}

/** Shape returned by `get_element_scores` RPC */
interface ElementScoreRow {
  element_code: string;
  task_id: string;
  area: string;
  element_type: string;
  difficulty_default: string;
  description: string;
  total_attempts: number;
  satisfactory_count: number;
  partial_count: number;
  unsatisfactory_count: number;
  latest_score: AssessmentScore | null;
  latest_attempt_at: string | null;
}

// ============================================================
// Helpers
// ============================================================

let _supabase: ReturnType<typeof createClient> | null = null;

function getServiceClient() {
  if (_supabase) return _supabase;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  }
  _supabase = createClient(url, key);
  return _supabase;
}

/** Human-readable label for a rating */
function ratingLabel(rating: Rating): string {
  switch (rating) {
    case 'private':
      return 'Private Pilot';
    case 'instrument':
      return 'Instrument Rating';
    case 'commercial':
      return 'Commercial Pilot';
    case 'atp':
      return 'ATP';
    default:
      return rating;
  }
}

/**
 * Generate actionable study recommendations based on weak areas.
 * Returns 1-3 recommendations.
 */
function generateRecommendations(
  weakAreas: DigestWeakArea[],
  rating: Rating,
): string[] {
  if (weakAreas.length === 0) {
    return [
      `Great job! Keep practicing to maintain your ${ratingLabel(rating)} knowledge.`,
    ];
  }

  const recs: string[] = [];

  // Recommendation 1: Focus on the weakest area
  const weakest = weakAreas[0];
  recs.push(
    `Focus on ${weakest.area} — your satisfactory rate for "${weakest.description}" is ${Math.round(weakest.satisfactoryRate)}%. Review the relevant ACS standards and practice targeted questions.`,
  );

  // Recommendation 2: If there are multiple weak areas in the same ACS area
  const areaGroups = new Map<string, number>();
  for (const wa of weakAreas) {
    areaGroups.set(wa.area, (areaGroups.get(wa.area) || 0) + 1);
  }
  const multiWeakArea = [...areaGroups.entries()].find(([, count]) => count >= 2);
  if (multiWeakArea) {
    recs.push(
      `Multiple weak elements in ${multiWeakArea[0]} — consider a dedicated study session on this area.`,
    );
  }

  // Recommendation 3: Low-attempt areas need more practice
  const lowAttempt = weakAreas.find((wa) => wa.totalAttempts <= 2);
  if (lowAttempt) {
    recs.push(
      `You've only attempted "${lowAttempt.description}" ${lowAttempt.totalAttempts} time${lowAttempt.totalAttempts === 1 ? '' : 's'}. More practice will help solidify this topic.`,
    );
  }

  return recs.slice(0, 3);
}

// ============================================================
// Main builder
// ============================================================

/**
 * Build a daily learning digest for a user.
 * Returns null if the user has no element attempts (nothing to report).
 */
export async function buildDailyDigest(
  userId: string,
  email: string,
  unsubscribeUrl: string,
): Promise<DigestData | null> {
  const supabase = getServiceClient();

  // 1. Fetch user profile for display name and preferred rating
  const { data: profile } = await supabase
    .from('user_profiles')
    .select('display_name, preferred_rating')
    .eq('user_id', userId)
    .maybeSingle() as { data: { display_name: string | null; preferred_rating: Rating | null } | null };

  const displayName = profile?.display_name || email.split('@')[0];
  const rating: Rating = profile?.preferred_rating || 'private';

  // 2. Fetch element scores via RPC
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: scores, error: scoresError } = await (supabase.rpc as any)(
    'get_element_scores',
    { p_user_id: userId, p_rating: rating },
  ) as { data: ElementScoreRow[] | null; error: { message: string } | null };

  if (scoresError) {
    console.error('[digest-builder] Error fetching element scores:', scoresError.message);
    return null;
  }

  const elementScores = (scores || []) as ElementScoreRow[];

  // Filter to elements that have been attempted at least once
  const attempted = elementScores.filter((s) => s.total_attempts > 0);

  // If user has never attempted any elements, nothing to digest
  if (attempted.length === 0) {
    return null;
  }

  // 3. Compute satisfactory rates and sort
  const scored = attempted.map((s) => ({
    elementCode: s.element_code,
    description: s.description,
    area: s.area,
    taskId: s.task_id,
    satisfactoryRate: (s.satisfactory_count / s.total_attempts) * 100,
    totalAttempts: s.total_attempts,
    latestScore: s.latest_score,
  }));

  // Weak areas: rate < 80%, sorted ascending by rate (worst first), top 5
  const weakAreas: DigestWeakArea[] = scored
    .filter((s) => s.satisfactoryRate < 80)
    .sort((a, b) => a.satisfactoryRate - b.satisfactoryRate)
    .slice(0, 5)
    .map(({ elementCode, description, area, satisfactoryRate, totalAttempts, latestScore }) => ({
      elementCode,
      description,
      area,
      satisfactoryRate,
      totalAttempts,
      latestScore,
    }));

  // Strong areas: rate >= 80%, sorted descending by rate, top 3
  const strongAreas: DigestStrongArea[] = scored
    .filter((s) => s.satisfactoryRate >= 80)
    .sort((a, b) => b.satisfactoryRate - a.satisfactoryRate)
    .slice(0, 3)
    .map(({ elementCode, description, area, satisfactoryRate }) => ({
      elementCode,
      description,
      area,
      satisfactoryRate,
    }));

  // 4. Fetch recent sessions (last 7 days)
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  const { data: recentSessions } = await supabase
    .from('exam_sessions')
    .select('id, exchange_count, started_at')
    .eq('user_id', userId)
    .gte('started_at', sevenDaysAgo.toISOString())
    .order('started_at', { ascending: false }) as {
      data: { id: string; exchange_count: number; started_at: string }[] | null;
    };

  const sessions = recentSessions || [];
  const recentSessionCount = sessions.length;
  const totalExchanges = sessions.reduce(
    (sum, s) => sum + (s.exchange_count || 0),
    0,
  );

  // 5. Total sessions (all time)
  const { count: totalSessions } = await supabase
    .from('exam_sessions')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId);

  // 6. Generate recommendations
  const recommendations = generateRecommendations(weakAreas, rating);

  return {
    displayName,
    rating,
    totalSessions: totalSessions ?? 0,
    recentSessionCount,
    totalExchanges,
    weakAreas,
    strongAreas,
    recommendations,
    generatedAt: new Date().toISOString(),
    unsubscribeUrl,
  };
}
