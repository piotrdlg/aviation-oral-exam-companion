import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';

// --- Types ---

export interface StudentSummary {
  studentUserId: string;
  displayName: string | null;
  lastActivityAt: string | null;
  sessionsLast7Days: number;
  readinessScore: number | null;
  weakElements: { elementCode: string; area: string; severity: string }[];
  recommendedTopics: string[];
}

export interface StudentDetail extends StudentSummary {
  recentSessions: SessionBrief[];
  areaBreakdown: { area: string; score: number; status: string }[];
}

export interface SessionBrief {
  id: string;
  rating: string;
  status: string;
  exchangeCount: number;
  overallScore: number | null;
  createdAt: string;
}

// --- Functions ---

/**
 * Get summary data for all connected students of an instructor.
 * Privacy-safe: no transcripts, no email, no cert numbers.
 */
export async function getInstructorStudentList(
  supabase: SupabaseClient,
  instructorUserId: string,
): Promise<StudentSummary[]> {
  // 1. Get connected student IDs
  const { data: connections } = await supabase
    .from('student_instructor_connections')
    .select('student_user_id')
    .eq('instructor_user_id', instructorUserId)
    .eq('state', 'connected');

  if (!connections || connections.length === 0) return [];

  const studentIds = connections.map(c => c.student_user_id as string);

  // 2. Get display names
  const { data: profiles } = await supabase
    .from('user_profiles')
    .select('user_id, display_name')
    .in('user_id', studentIds);

  const nameMap = new Map<string, string>();
  for (const p of profiles || []) {
    if (p.display_name) nameMap.set(p.user_id as string, p.display_name as string);
  }

  // 3. Get last 7 days session counts + most recent session per student
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const summaries: StudentSummary[] = [];

  for (const studentId of studentIds) {
    // Recent sessions count
    const { count: recentCount } = await supabase
      .from('exam_sessions')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', studentId)
      .gte('created_at', sevenDaysAgo);

    // Most recent completed session with metadata
    const { data: lastSession } = await supabase
      .from('exam_sessions')
      .select('metadata, created_at')
      .eq('user_id', studentId)
      .eq('status', 'completed')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    let readinessScore: number | null = null;
    let weakElements: { elementCode: string; area: string; severity: string }[] = [];
    let recommendedTopics: string[] = [];

    if (lastSession?.metadata) {
      const meta = lastSession.metadata as Record<string, unknown>;
      const examResult = meta.examResultV2 as {
        overall_score?: number;
        weak_elements?: { element_code: string; area: string; severity: string }[];
        areas?: { area: string; score: number; status: string }[];
      } | undefined;

      if (examResult) {
        readinessScore = typeof examResult.overall_score === 'number'
          ? Math.round(examResult.overall_score * 100)
          : null;

        weakElements = (examResult.weak_elements || [])
          .filter(e => e.severity === 'unsatisfactory' || e.severity === 'partial')
          .slice(0, 5)
          .map(e => ({
            elementCode: e.element_code,
            area: e.area,
            severity: e.severity,
          }));

        // Top 3 weak elements as recommended topics
        recommendedTopics = weakElements
          .slice(0, 3)
          .map(e => e.elementCode);
      }
    }

    summaries.push({
      studentUserId: studentId,
      displayName: nameMap.get(studentId) || null,
      lastActivityAt: lastSession?.created_at || null,
      sessionsLast7Days: recentCount ?? 0,
      readinessScore,
      weakElements,
      recommendedTopics,
    });
  }

  return summaries;
}

/**
 * Get detailed progress for a specific student.
 * Must verify instructor has a connected connection to this student.
 */
export async function getStudentDetail(
  supabase: SupabaseClient,
  instructorUserId: string,
  studentUserId: string,
): Promise<StudentDetail | null> {
  // Verify connection exists and is connected
  const { data: conn } = await supabase
    .from('student_instructor_connections')
    .select('id, state')
    .eq('instructor_user_id', instructorUserId)
    .eq('student_user_id', studentUserId)
    .eq('state', 'connected')
    .maybeSingle();

  if (!conn) return null;

  // Display name
  const { data: profile } = await supabase
    .from('user_profiles')
    .select('display_name')
    .eq('user_id', studentUserId)
    .maybeSingle();

  // Recent 10 sessions
  const { data: sessions } = await supabase
    .from('exam_sessions')
    .select('id, rating, status, exchange_count, metadata, created_at')
    .eq('user_id', studentUserId)
    .order('created_at', { ascending: false })
    .limit(10);

  const recentSessions: SessionBrief[] = (sessions || []).map(s => {
    const meta = s.metadata as Record<string, unknown> | null;
    const examResult = meta?.examResultV2 as { overall_score?: number } | undefined;
    return {
      id: s.id as string,
      rating: (s.rating as string) || 'private',
      status: (s.status as string) || 'unknown',
      exchangeCount: (s.exchange_count as number) || 0,
      overallScore: typeof examResult?.overall_score === 'number'
        ? Math.round(examResult.overall_score * 100)
        : null,
      createdAt: s.created_at as string,
    };
  });

  // Get readiness from most recent completed session
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const { count: recentCount } = await supabase
    .from('exam_sessions')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', studentUserId)
    .gte('created_at', sevenDaysAgo);

  let readinessScore: number | null = null;
  let weakElements: { elementCode: string; area: string; severity: string }[] = [];
  let recommendedTopics: string[] = [];
  let areaBreakdown: { area: string; score: number; status: string }[] = [];

  // Find most recent completed session for detailed exam data
  const { data: lastCompleted } = await supabase
    .from('exam_sessions')
    .select('metadata')
    .eq('user_id', studentUserId)
    .eq('status', 'completed')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (lastCompleted?.metadata) {
    const meta = lastCompleted.metadata as Record<string, unknown>;
    const examResult = meta.examResultV2 as {
      overall_score?: number;
      weak_elements?: { element_code: string; area: string; severity: string }[];
      areas?: { area: string; score: number; status: string }[];
    } | undefined;

    if (examResult) {
      readinessScore = typeof examResult.overall_score === 'number'
        ? Math.round(examResult.overall_score * 100)
        : null;

      weakElements = (examResult.weak_elements || [])
        .filter(e => e.severity === 'unsatisfactory' || e.severity === 'partial')
        .slice(0, 10)
        .map(e => ({
          elementCode: e.element_code,
          area: e.area,
          severity: e.severity,
        }));

      recommendedTopics = weakElements.slice(0, 3).map(e => e.elementCode);

      areaBreakdown = (examResult.areas || []).map(a => ({
        area: a.area,
        score: Math.round(a.score * 100),
        status: a.status,
      }));
    }
  }

  return {
    studentUserId,
    displayName: (profile?.display_name as string) || null,
    lastActivityAt: recentSessions[0]?.createdAt || null,
    sessionsLast7Days: recentCount ?? 0,
    readinessScore,
    weakElements,
    recommendedTopics,
    recentSessions,
    areaBreakdown,
  };
}
