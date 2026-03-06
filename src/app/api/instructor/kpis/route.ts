import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { isInstructorFeatureEnabled, isInstructorApproved } from '@/lib/instructor-access';
import { captureServerEvent } from '@/lib/posthog-server';
import {
  computeInstructorKpis,
  type StudentConnectionData,
  type InviteEventData,
  type MilestoneData,
  type EntitlementData,
} from '@/lib/instructor-kpis';

const serviceSupabase = createServiceClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/**
 * GET /api/instructor/kpis
 * Returns the full InstructorKpiV1 for the authenticated instructor.
 */
export async function GET(request: NextRequest) {
  try {
    // Auth
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Feature flag + approval check
    const [featureEnabled, approved] = await Promise.all([
      isInstructorFeatureEnabled(serviceSupabase),
      isInstructorApproved(serviceSupabase, user.id),
    ]);

    if (!featureEnabled) {
      return NextResponse.json({ error: 'Feature not available' }, { status: 404 });
    }
    if (!approved) {
      return NextResponse.json({ error: 'Not an approved instructor' }, { status: 403 });
    }

    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();

    // Fetch connections with student data
    const { data: connections } = await serviceSupabase
      .from('student_instructor_connections')
      .select('student_user_id, state')
      .eq('instructor_user_id', user.id);

    const allConns = connections || [];
    const connectedIds = allConns
      .filter((c: { state: string }) => c.state === 'connected')
      .map((c: { student_user_id: string }) => c.student_user_id);

    // Fetch student profiles for subscription status
    let profileMap = new Map<string, string | null>();
    if (connectedIds.length > 0) {
      const { data: profiles } = await serviceSupabase
        .from('user_profiles')
        .select('user_id, subscription_status')
        .in('user_id', connectedIds);
      for (const p of profiles || []) {
        profileMap.set(p.user_id as string, (p.subscription_status as string) || null);
      }
    }

    // Fetch session counts per student (last 7 days)
    const sessionCountMap = new Map<string, number>();
    for (const sid of connectedIds) {
      const { count } = await serviceSupabase
        .from('exam_sessions')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', sid)
        .gte('created_at', sevenDaysAgo);
      sessionCountMap.set(sid, count || 0);
    }

    // Fetch latest readiness scores and trends (from most recent completed session)
    const readinessMap = new Map<string, { score: number | null; trend: string; needsAttention: boolean }>();
    for (const sid of connectedIds) {
      const { data: lastSession } = await serviceSupabase
        .from('exam_sessions')
        .select('metadata')
        .eq('user_id', sid)
        .eq('status', 'completed')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      let score: number | null = null;
      if (lastSession?.metadata) {
        const meta = lastSession.metadata as Record<string, unknown>;
        const examResult = meta.examResultV2 as { overall_score?: number } | undefined;
        if (examResult && typeof examResult.overall_score === 'number') {
          score = Math.round(examResult.overall_score * 100);
        }
      }

      const sessions7d = sessionCountMap.get(sid) || 0;
      const needsAttention = (score !== null && score < 60) || sessions7d === 0;

      readinessMap.set(sid, { score, trend: 'insufficient_data', needsAttention });
    }

    // Build connection data for KPI computation
    const connectionData: StudentConnectionData[] = allConns.map((c: { student_user_id: string; state: string }) => {
      const r = readinessMap.get(c.student_user_id);
      return {
        studentUserId: c.student_user_id,
        state: c.state,
        subscriptionStatus: profileMap.get(c.student_user_id) || null,
        sessionsLast7d: sessionCountMap.get(c.student_user_id) || 0,
        readinessScore: r?.score ?? null,
        readinessTrend: r?.trend ?? 'insufficient_data',
        needsAttention: r?.needsAttention ?? false,
      };
    });

    // Fetch invite events
    const { data: inviteRows } = await serviceSupabase
      .from('instructor_invite_events')
      .select('event_type, created_at')
      .eq('instructor_user_id', user.id);

    const inviteEvents: InviteEventData[] = (inviteRows || []).map((r: { event_type: string; created_at: string }) => ({
      eventType: r.event_type,
      createdAt: r.created_at,
    }));

    // Fetch milestones for connected students
    const milestones: MilestoneData[] = [];
    if (connectedIds.length > 0) {
      const { data: milestoneRows } = await serviceSupabase
        .from('student_milestones')
        .select('student_user_id, milestone_key, status')
        .in('student_user_id', connectedIds);

      for (const m of milestoneRows || []) {
        milestones.push({
          studentUserId: m.student_user_id as string,
          milestoneKey: m.milestone_key as string,
          status: m.status as string,
        });
      }
    }

    // Fetch entitlement data
    const { data: profile } = await serviceSupabase
      .from('instructor_profiles')
      .select('status')
      .eq('user_id', user.id)
      .single();

    // Check direct override
    const { data: overrides } = await serviceSupabase
      .from('instructor_access_overrides')
      .select('active, expires_at')
      .eq('instructor_user_id', user.id)
      .eq('active', true);

    const hasDirectOverride = (overrides || []).some(
      (o: { active: boolean; expires_at: string | null }) =>
        o.active && (!o.expires_at || new Date(o.expires_at) > now)
    );

    const paidCount = connectionData.filter(
      c => c.state === 'connected' && c.subscriptionStatus === 'active'
    ).length;

    const entitlement: EntitlementData = {
      hasCourtesyAccess: paidCount > 0 || hasDirectOverride,
      courtesyReason: hasDirectOverride ? 'direct_override' : paidCount > 0 ? 'paid_student' : 'none',
      paidStudentCount: paidCount,
      hasDirectOverride,
    };

    // Compute KPIs
    const kpi = computeInstructorKpis(user.id, connectionData, inviteEvents, milestones, entitlement, now);

    // Emit PostHog event
    captureServerEvent(user.id, 'instructor_kpi_computed', {
      totalConnected: kpi.lifecycle.totalConnected,
      activeLast7d: kpi.lifecycle.activeLast7d,
      paidActive: kpi.lifecycle.paidActive,
      avgReadiness: kpi.readiness.avgReadiness,
      conversionRate: kpi.invites.conversionRate,
    });

    return NextResponse.json({ kpi });
  } catch (error) {
    console.error('[instructor-kpis] Error:', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
