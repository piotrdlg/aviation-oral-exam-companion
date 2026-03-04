import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, handleAdminError } from '@/lib/admin-guard';
import { EXAMINER_PROFILES, ALL_PROFILE_KEYS, VOICE_TO_PROFILE_MAP } from '@/lib/examiner-profile';

/**
 * GET /api/admin/quality/examiner-identity
 *
 * Returns examiner identity metrics across users and sessions.
 * Reports profile adoption, voice-profile consistency, and legacy persona usage.
 *
 * Query params:
 *   ?limit=N (default 50, max 200) — number of user profiles to sample
 *
 * Phase 12 — Examiner Identity Unification
 */
export async function GET(request: NextRequest) {
  try {
    const { serviceSupabase } = await requireAdmin(request);

    const limit = Math.min(
      parseInt(request.nextUrl.searchParams.get('limit') || '50'),
      200,
    );

    // Fetch user profiles with relevant fields
    const { data: profiles, error } = await serviceSupabase
      .from('user_profiles')
      .select('user_id, examiner_profile, preferred_voice, display_name, tier, updated_at')
      .order('updated_at', { ascending: false })
      .limit(limit);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const total = profiles?.length || 0;
    let withProfile = 0;
    let withVoiceOnly = 0;
    let withNeither = 0;
    let mismatches = 0;
    const profileCounts: Record<string, number> = {};
    const tierProfileCounts: Record<string, number> = {};

    interface IdentityInfo {
      user_id: string;
      examiner_profile: string | null;
      preferred_voice: string | null;
      expected_voice: string | null;
      voice_consistent: boolean;
      has_display_name: boolean;
      tier: string | null;
    }

    const identities: IdentityInfo[] = [];

    for (const p of profiles || []) {
      const hasProfile = !!p.examiner_profile;
      const hasVoice = !!p.preferred_voice;

      if (hasProfile) {
        withProfile++;
        const key = p.examiner_profile;
        profileCounts[key] = (profileCounts[key] || 0) + 1;
        const tierKey = `${p.tier || 'unknown'}:${key}`;
        tierProfileCounts[tierKey] = (tierProfileCounts[tierKey] || 0) + 1;
      } else if (hasVoice) {
        withVoiceOnly++;
      } else {
        withNeither++;
      }

      // Check voice-profile consistency
      let expectedVoice: string | null = null;
      let voiceConsistent = true;
      if (hasProfile && p.examiner_profile in EXAMINER_PROFILES) {
        const prof = EXAMINER_PROFILES[p.examiner_profile as keyof typeof EXAMINER_PROFILES];
        expectedVoice = prof.voiceId;
        if (hasVoice && p.preferred_voice !== expectedVoice) {
          mismatches++;
          voiceConsistent = false;
        }
      } else if (hasVoice && !hasProfile) {
        // Legacy user: voice set but no profile — check if voice maps to a profile
        const mappedProfile = VOICE_TO_PROFILE_MAP[p.preferred_voice];
        if (mappedProfile) {
          expectedVoice = p.preferred_voice;
          voiceConsistent = true; // Voice exists in map, just needs profile backfill
        }
      }

      identities.push({
        user_id: p.user_id,
        examiner_profile: p.examiner_profile || null,
        preferred_voice: p.preferred_voice || null,
        expected_voice: expectedVoice,
        voice_consistent: voiceConsistent,
        has_display_name: !!p.display_name,
        tier: p.tier || null,
      });
    }

    // All 4 profiles represented?
    const allProfilesUsed = ALL_PROFILE_KEYS.every(k => (profileCounts[k] || 0) > 0);

    return NextResponse.json({
      total_users_sampled: total,
      profile_adoption: {
        with_examiner_profile: withProfile,
        with_voice_only_legacy: withVoiceOnly,
        with_neither: withNeither,
        adoption_rate: total > 0 ? `${((withProfile / total) * 100).toFixed(1)}%` : '0%',
      },
      profile_distribution: profileCounts,
      all_4_profiles_represented: allProfilesUsed,
      voice_consistency: {
        mismatches,
        mismatch_rate: total > 0 ? `${((mismatches / total) * 100).toFixed(1)}%` : '0%',
      },
      tier_distribution: tierProfileCounts,
      users: identities,
    });
  } catch (err) {
    return handleAdminError(err);
  }
}
