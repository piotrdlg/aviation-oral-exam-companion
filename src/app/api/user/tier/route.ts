import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { TIER_FEATURES } from '@/lib/voice/types';
import type { VoiceTier } from '@/lib/voice/types';

const serviceSupabase = createServiceClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const VALID_TIERS: VoiceTier[] = ['ground_school', 'checkride_prep', 'dpe_live'];

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get user's tier
    const { data: profile } = await serviceSupabase
      .from('user_profiles')
      .select('tier, subscription_status, cancel_at_period_end, current_period_end')
      .eq('user_id', user.id)
      .single();

    const tier: VoiceTier = (profile?.tier as VoiceTier) || 'ground_school';
    const features = TIER_FEATURES[tier];

    // Get usage for current month
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

    const [sessionsResult, ttsResult, sttResult] = await Promise.all([
      serviceSupabase
        .from('exam_sessions')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .gte('created_at', monthStart),
      serviceSupabase
        .from('usage_logs')
        .select('quantity')
        .eq('user_id', user.id)
        .eq('event_type', 'tts_request')
        .eq('status', 'ok')
        .gte('created_at', monthStart),
      serviceSupabase
        .from('usage_logs')
        .select('quantity')
        .eq('user_id', user.id)
        .eq('event_type', 'stt_session')
        .gte('created_at', monthStart),
    ]);

    const ttsChars = (ttsResult.data || []).reduce((sum, r) => sum + Number(r.quantity), 0);
    const sttSeconds = (sttResult.data || []).reduce((sum, r) => sum + Number(r.quantity), 0);

    return NextResponse.json({
      tier,
      subscriptionStatus: profile?.subscription_status || 'active',
      cancelAtPeriodEnd: profile?.cancel_at_period_end || false,
      currentPeriodEnd: profile?.current_period_end || null,
      features,
      usage: {
        sessionsThisMonth: sessionsResult.count || 0,
        ttsCharsThisMonth: ttsChars,
        sttSecondsThisMonth: sttSeconds,
      },
    });
  } catch (error) {
    console.error('Tier lookup error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { tier } = await request.json();

    if (!tier || !VALID_TIERS.includes(tier as VoiceTier)) {
      return NextResponse.json(
        { error: 'Invalid tier. Must be one of: ground_school, checkride_prep, dpe_live' },
        { status: 400 }
      );
    }

    // Update user's tier directly (no billing for testing)
    const { error: updateError } = await serviceSupabase
      .from('user_profiles')
      .update({ tier, updated_at: new Date().toISOString() })
      .eq('user_id', user.id);

    if (updateError) {
      console.error('Tier update error:', updateError);
      return NextResponse.json({ error: 'Failed to update tier' }, { status: 500 });
    }

    const features = TIER_FEATURES[tier as VoiceTier];

    return NextResponse.json({
      tier,
      features,
      message: `Tier updated to ${tier}`,
    });
  } catch (error) {
    console.error('Tier update error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
