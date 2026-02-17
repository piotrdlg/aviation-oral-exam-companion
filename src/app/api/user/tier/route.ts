import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { TIER_FEATURES } from '@/lib/voice/types';
import type { VoiceTier } from '@/lib/voice/types';

const serviceSupabase = createServiceClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get user's profile and voice options in parallel
    const [profileResult, voiceOptionsResult] = await Promise.all([
      serviceSupabase
        .from('user_profiles')
        .select('tier, preferred_voice, subscription_status, cancel_at_period_end, current_period_end')
        .eq('user_id', user.id)
        .single(),
      serviceSupabase
        .from('system_config')
        .select('value')
        .eq('key', 'voice.user_options')
        .maybeSingle(),
    ]);

    const profile = profileResult.data;
    const tier: VoiceTier = (profile?.tier as VoiceTier) || 'checkride_prep';
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
      subscriptionStatus: profile?.subscription_status || 'none',
      cancelAtPeriodEnd: profile?.cancel_at_period_end || false,
      currentPeriodEnd: profile?.current_period_end || null,
      features,
      usage: {
        sessionsThisMonth: sessionsResult.count || 0,
        ttsCharsThisMonth: ttsChars,
        sttSecondsThisMonth: sttSeconds,
      },
      preferredVoice: profile?.preferred_voice || null,
      voiceOptions: voiceOptionsResult.data?.value || [],
    });
  } catch (error) {
    console.error('Tier lookup error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * POST /api/user/tier — Update user's preferred voice.
 * Validates voice is in the admin-curated list from system_config.
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { preferredVoice } = await request.json();

    // Validate the voice is in the admin-curated list
    const { data: configRow } = await serviceSupabase
      .from('system_config')
      .select('value')
      .eq('key', 'voice.user_options')
      .maybeSingle();

    const options = (configRow?.value || []) as { model: string }[];
    const validModels = options.map((o) => o.model);

    if (preferredVoice && !validModels.includes(preferredVoice)) {
      return NextResponse.json(
        { error: 'Invalid voice option' },
        { status: 400 }
      );
    }

    const { error: updateError } = await serviceSupabase
      .from('user_profiles')
      .update({
        preferred_voice: preferredVoice || null,
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', user.id);

    if (updateError) {
      console.error('Voice preference update error:', updateError);
      return NextResponse.json({ error: 'Failed to update voice preference' }, { status: 500 });
    }

    return NextResponse.json({ ok: true, preferredVoice: preferredVoice || null });
  } catch (error) {
    console.error('Voice preference update error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
