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
        .select('tier, preferred_voice, preferred_rating, preferred_aircraft_class, subscription_status, cancel_at_period_end, current_period_end')
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
      preferredRating: profile?.preferred_rating || 'private',
      preferredAircraftClass: profile?.preferred_aircraft_class || 'ASEL',
      voiceOptions: voiceOptionsResult.data?.value || [],
    });
  } catch (error) {
    console.error('Tier lookup error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

const VALID_RATINGS = ['private', 'commercial', 'instrument', 'atp'] as const;
const VALID_CLASSES = ['ASEL', 'AMEL', 'ASES', 'AMES'] as const;

/**
 * POST /api/user/tier — Update user preferences (voice, rating, aircraft class).
 * Validates voice against admin-curated list; rating/class against enum.
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { preferredVoice, preferredRating, preferredAircraftClass } = body;

    const updateFields: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    // Validate voice if provided
    if (preferredVoice !== undefined) {
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
      updateFields.preferred_voice = preferredVoice || null;
    }

    // Validate rating if provided
    if (preferredRating !== undefined) {
      if (preferredRating && !(VALID_RATINGS as readonly string[]).includes(preferredRating)) {
        return NextResponse.json({ error: 'Invalid rating' }, { status: 400 });
      }
      updateFields.preferred_rating = preferredRating || 'private';
    }

    // Validate aircraft class if provided
    if (preferredAircraftClass !== undefined) {
      if (preferredAircraftClass && !(VALID_CLASSES as readonly string[]).includes(preferredAircraftClass)) {
        return NextResponse.json({ error: 'Invalid aircraft class' }, { status: 400 });
      }
      updateFields.preferred_aircraft_class = preferredAircraftClass || 'ASEL';
    }

    const { error: updateError } = await serviceSupabase
      .from('user_profiles')
      .update(updateFields)
      .eq('user_id', user.id);

    if (updateError) {
      console.error('Preference update error:', updateError);
      return NextResponse.json({ error: 'Failed to update preferences' }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Preference update error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
