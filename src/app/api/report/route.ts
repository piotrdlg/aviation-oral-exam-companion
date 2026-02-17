import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import type { ReportType } from '@/types/database';

const serviceSupabase = createServiceClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const VALID_REPORT_TYPES: ReportType[] = [
  'inaccurate_answer',
  'safety_incident',
  'bug_report',
  'content_error',
];

/**
 * POST /api/report
 *
 * Submit a report to the moderation queue. Used for:
 * - "Report Inaccurate Answer" button on examiner messages (practice page)
 * - "Report a Bug" and "Report Content Error" forms (settings page)
 *
 * Body:
 * - report_type: ReportType (required)
 * - session_id?: string
 * - transcript_id?: string
 * - details: Record<string, unknown> (required — user comment, error type, etc.)
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { report_type, session_id, transcript_id, details } = body as {
      report_type: string;
      session_id?: string;
      transcript_id?: string;
      details?: Record<string, unknown>;
    };

    // Validate report_type
    if (!report_type || !VALID_REPORT_TYPES.includes(report_type as ReportType)) {
      return NextResponse.json(
        { error: `Invalid report_type. Must be one of: ${VALID_REPORT_TYPES.join(', ')}` },
        { status: 400 }
      );
    }

    // Validate details
    if (!details || typeof details !== 'object') {
      return NextResponse.json(
        { error: 'Missing or invalid details object' },
        { status: 400 }
      );
    }

    // Insert into moderation_queue using service role (bypasses RLS)
    const { data, error } = await serviceSupabase
      .from('moderation_queue')
      .insert({
        report_type,
        reporter_user_id: user.id,
        session_id: session_id || null,
        transcript_id: transcript_id || null,
        details,
        status: 'open',
      })
      .select('id')
      .single();

    if (error) {
      console.error('Report submission error:', error.message);
      return NextResponse.json({ error: 'Failed to submit report' }, { status: 500 });
    }

    return NextResponse.json({ ok: true, reportId: data.id });
  } catch (error) {
    console.error('Report API error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
