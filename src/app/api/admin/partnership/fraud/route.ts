import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, handleAdminError } from '@/lib/admin-guard';
import { captureServerEvent } from '@/lib/posthog-server';
import {
  computeFraudSignals,
  type FraudKpiInput,
  type FraudInviteInput,
  type FraudConnectionInput,
  type FraudMilestoneInput,
} from '@/lib/instructor-fraud-signals';

/**
 * GET /api/admin/partnership/fraud
 * Returns flagged instructors with risk_level, reasons, and recommended_action.
 */
export async function GET(request: NextRequest) {
  try {
    const { serviceSupabase } = await requireAdmin(request);

    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

    // Fetch approved instructors
    const { data: instructors } = await serviceSupabase
      .from('instructor_profiles')
      .select('user_id, first_name, last_name')
      .eq('status', 'approved');

    if (!instructors || instructors.length === 0) {
      return NextResponse.json({ flagged: [], total: 0, generatedAt: new Date().toISOString() });
    }

    const instructorIds = instructors.map((i: { user_id: string }) => i.user_id);

    // Fetch all connections
    const { data: allConns } = await serviceSupabase
      .from('student_instructor_connections')
      .select('instructor_user_id, student_user_id, state, connection_source');

    // Fetch student subscription statuses
    const connectedStudentIds = (allConns || [])
      .filter((c: { state: string }) => c.state === 'connected')
      .map((c: { student_user_id: string }) => c.student_user_id);

    const subStatusMap = new Map<string, string | null>();
    if (connectedStudentIds.length > 0) {
      const { data: profiles } = await serviceSupabase
        .from('user_profiles')
        .select('user_id, subscription_status')
        .in('user_id', connectedStudentIds);
      for (const p of profiles || []) {
        subStatusMap.set(p.user_id as string, (p.subscription_status as string) || null);
      }
    }

    // Fetch session counts for connected students (last 7 days)
    const sessionCountMap = new Map<string, number>();
    if (connectedStudentIds.length > 0) {
      for (const sid of connectedStudentIds) {
        const { count } = await serviceSupabase
          .from('exam_sessions')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', sid)
          .gte('created_at', sevenDaysAgo);
        sessionCountMap.set(sid as string, count || 0);
      }
    }

    // Fetch invite events
    const { data: allInviteEvents } = await serviceSupabase
      .from('instructor_invite_events')
      .select('instructor_user_id, event_type, created_at');

    // Fetch milestones
    const { data: allMilestones } = await serviceSupabase
      .from('student_milestones')
      .select('student_user_id, milestone_key, status')
      .in('student_user_id', connectedStudentIds.length > 0 ? connectedStudentIds : ['__none__']);

    // Build per-instructor fraud signals
    const nameMap = new Map<string, string>();
    for (const inst of instructors) {
      nameMap.set(
        inst.user_id as string,
        [inst.first_name, inst.last_name].filter(Boolean).join(' ') || 'Unknown'
      );
    }

    const flaggedResults: {
      instructorId: string;
      displayName: string;
      riskLevel: string;
      riskScore: number;
      reasons: string[];
      recommendedAction: string;
    }[] = [];

    for (const iid of instructorIds) {
      const iConns = (allConns || []).filter(
        (c: { instructor_user_id: string }) => c.instructor_user_id === iid
      );
      const connected = iConns.filter((c: { state: string }) => c.state === 'connected');
      const connStudentIds = connected.map((c: { student_user_id: string }) => c.student_user_id);

      // KPI input
      const kpi: FraudKpiInput = {
        totalConnected: connected.length,
        paidActive: connStudentIds.filter((sid: string) => subStatusMap.get(sid) === 'active').length,
        trialing: connStudentIds.filter((sid: string) => subStatusMap.get(sid) === 'trialing').length,
        free: connStudentIds.filter(
          (sid: string) => {
            const s = subStatusMap.get(sid);
            return !s || (s !== 'active' && s !== 'trialing');
          }
        ).length,
        activeLast7d: connStudentIds.filter((sid: string) => (sessionCountMap.get(sid) || 0) >= 1).length,
        inactiveLast7d: connStudentIds.filter((sid: string) => (sessionCountMap.get(sid) || 0) === 0).length,
      };

      // Invite input
      const iEvents = (allInviteEvents || []).filter(
        (e: { instructor_user_id: string }) => e.instructor_user_id === iid
      );
      const isRecent = (e: { created_at: string }) => new Date(e.created_at) >= new Date(sevenDaysAgo);
      const invite: FraudInviteInput = {
        emailsSent7d: iEvents.filter((e: { event_type: string; created_at: string }) => e.event_type === 'email_sent' && isRecent(e)).length,
        tokensCreated7d: iEvents.filter((e: { event_type: string; created_at: string }) => e.event_type === 'token_created' && isRecent(e)).length,
        rateLimitHits7d: iEvents.filter((e: { event_type: string; created_at: string }) => e.event_type === 'rate_limited' && isRecent(e)).length,
        totalEmailsSent: iEvents.filter((e: { event_type: string }) => e.event_type === 'email_sent').length,
        totalTokensCreated: iEvents.filter((e: { event_type: string }) => e.event_type === 'token_created').length,
        totalClaims: iEvents.filter((e: { event_type: string }) => e.event_type === 'claimed').length,
      };

      // Connection input
      const sources: Record<string, number> = {};
      for (const c of iConns) {
        const s = (c as { connection_source: string | null }).connection_source || 'unknown';
        sources[s] = (sources[s] || 0) + 1;
      }
      const connection: FraudConnectionInput = {
        totalConnections: iConns.length,
        disconnectedCount: iConns.filter((c: { state: string }) => c.state === 'disconnected' || c.state === 'rejected').length,
        connectionSources: sources,
      };

      // Milestone input
      const studentMilestones = (allMilestones || []).filter(
        (m: { student_user_id: string; status: string }) =>
          connStudentIds.includes(m.student_user_id) && m.status === 'completed'
      );
      const milestone: FraudMilestoneInput = {
        studentsWithMilestones: new Set(studentMilestones.map((m: { student_user_id: string }) => m.student_user_id)).size,
        totalConnected: connected.length,
      };

      const result = computeFraudSignals(kpi, invite, connection, milestone);

      // Only include medium+ risk
      if (result.riskLevel !== 'low') {
        flaggedResults.push({
          instructorId: (iid as string).slice(0, 8),
          displayName: nameMap.get(iid as string) || 'Unknown',
          riskLevel: result.riskLevel,
          riskScore: result.riskScore,
          reasons: result.reasons,
          recommendedAction: result.recommendedAction,
        });

        // Emit PostHog event for high-risk instructors
        if (result.riskLevel === 'high') {
          captureServerEvent(iid as string, 'instructor_fraud_signal_high', {
            riskScore: result.riskScore,
            reasons: result.reasons,
            recommendedAction: result.recommendedAction,
            signalsTriggered: result.signals.filter(s => s.triggered).map(s => s.name),
          });
        }
      }
    }

    // Sort by risk score descending
    flaggedResults.sort((a, b) => b.riskScore - a.riskScore);

    return NextResponse.json({
      flagged: flaggedResults,
      total: flaggedResults.length,
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    return handleAdminError(error);
  }
}
