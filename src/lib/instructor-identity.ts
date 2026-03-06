import 'server-only';

import { randomBytes } from 'crypto';
import type { SupabaseClient } from '@supabase/supabase-js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Referral codes are 8 alphanumeric chars (uppercase, no ambiguous chars). */
const REFERRAL_CODE_LENGTH = 8;

/** Characters used in referral codes (no 0/O/I/1 to avoid ambiguity). */
const REFERRAL_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/** Max attempts to find a unique slug before appending random suffix. */
const MAX_SLUG_ATTEMPTS = 5;

// ---------------------------------------------------------------------------
// Slug Generation
// ---------------------------------------------------------------------------

/**
 * Generate a URL-safe slug from instructor name.
 * Pattern: "john-smith" (lowercase, hyphenated, ASCII only).
 * On collision, appends a numeric suffix: "john-smith-2".
 */
export function normalizeSlug(firstName: string, lastName: string): string {
  const raw = `${firstName} ${lastName}`
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // strip diacritics
    .replace(/[^a-z0-9\s-]/g, '')    // remove non-alphanumeric
    .trim()
    .replace(/\s+/g, '-')            // spaces → hyphens
    .replace(/-+/g, '-')             // collapse multiple hyphens
    .replace(/^-|-$/g, '');           // trim leading/trailing hyphens

  return raw || 'instructor';
}

/**
 * Find a unique slug for an instructor, appending -2, -3, etc. on collision.
 */
export async function generateUniqueSlug(
  supabase: SupabaseClient,
  firstName: string,
  lastName: string,
  excludeUserId?: string,
): Promise<string> {
  const base = normalizeSlug(firstName, lastName);

  for (let attempt = 0; attempt < MAX_SLUG_ATTEMPTS; attempt++) {
    const candidate = attempt === 0 ? base : `${base}-${attempt + 1}`;

    let query = supabase
      .from('instructor_profiles')
      .select('id')
      .eq('slug', candidate)
      .limit(1);

    if (excludeUserId) {
      query = query.neq('user_id', excludeUserId);
    }

    const { data } = await query.maybeSingle();
    if (!data) return candidate;
  }

  // Fallback: append random suffix
  const suffix = randomBytes(3).toString('hex');
  return `${base}-${suffix}`;
}

// ---------------------------------------------------------------------------
// Referral Code Generation
// ---------------------------------------------------------------------------

/**
 * Generate a random referral code (8 chars, uppercase alphanumeric, unambiguous).
 */
export function generateReferralCode(): string {
  const bytes = randomBytes(REFERRAL_CODE_LENGTH);
  let code = '';
  for (let i = 0; i < REFERRAL_CODE_LENGTH; i++) {
    code += REFERRAL_ALPHABET[bytes[i] % REFERRAL_ALPHABET.length];
  }
  return code;
}

/**
 * Generate a unique referral code (retries on collision).
 */
export async function generateUniqueReferralCode(
  supabase: SupabaseClient,
): Promise<string> {
  for (let attempt = 0; attempt < 10; attempt++) {
    const code = generateReferralCode();
    const { data } = await supabase
      .from('instructor_profiles')
      .select('id')
      .eq('referral_code', code)
      .limit(1)
      .maybeSingle();

    if (!data) return code;
  }

  // Extremely unlikely — 32^8 = 1 trillion possibilities
  throw new Error('Failed to generate unique referral code after 10 attempts');
}

// ---------------------------------------------------------------------------
// Public Identity Assignment
// ---------------------------------------------------------------------------

/**
 * Assign slug + referral_code to an approved instructor who doesn't have them yet.
 * Called during approval flow and on-demand from settings.
 * Idempotent: if already assigned, returns existing values.
 */
export async function ensureInstructorIdentity(
  supabase: SupabaseClient,
  userId: string,
): Promise<{ slug: string; referralCode: string } | null> {
  const { data: profile, error } = await supabase
    .from('instructor_profiles')
    .select('user_id, first_name, last_name, slug, referral_code, status')
    .eq('user_id', userId)
    .single();

  if (error || !profile) return null;
  if (profile.status !== 'approved') return null;

  // Already has both — return existing
  if (profile.slug && profile.referral_code) {
    return { slug: profile.slug as string, referralCode: profile.referral_code as string };
  }

  const slug = profile.slug as string
    || await generateUniqueSlug(
        supabase,
        (profile.first_name as string) || '',
        (profile.last_name as string) || '',
        userId,
      );

  const referralCode = profile.referral_code as string
    || await generateUniqueReferralCode(supabase);

  const { error: updateError } = await supabase
    .from('instructor_profiles')
    .update({ slug, referral_code: referralCode })
    .eq('user_id', userId);

  if (updateError) {
    console.error('[instructor-identity] Failed to assign identity:', updateError.message);
    return null;
  }

  return { slug, referralCode };
}

// ---------------------------------------------------------------------------
// Lookup by Referral Code (for /ref/[code] route)
// ---------------------------------------------------------------------------

export interface ReferralLookup {
  instructorUserId: string;
  instructorName: string;
  certType: string | null;
  bio: string | null;
  slug: string;
}

/**
 * Look up an instructor by referral code. Returns public-safe info only.
 * NEVER returns certificate_number or email.
 */
export async function lookupByReferralCode(
  supabase: SupabaseClient,
  code: string,
): Promise<ReferralLookup | null> {
  const { data, error } = await supabase
    .from('instructor_profiles')
    .select('user_id, first_name, last_name, certificate_type, bio, slug')
    .eq('referral_code', code.toUpperCase())
    .eq('status', 'approved')
    .single();

  if (error || !data) return null;

  return {
    instructorUserId: data.user_id as string,
    instructorName: [data.first_name, data.last_name].filter(Boolean).join(' ') || 'Instructor',
    certType: (data.certificate_type as string) || null,
    bio: (data.bio as string) || null,
    slug: data.slug as string,
  };
}

/**
 * Look up an instructor by slug. Returns public-safe info only.
 */
export async function lookupBySlug(
  supabase: SupabaseClient,
  slug: string,
): Promise<ReferralLookup & { referralCode: string } | null> {
  const { data, error } = await supabase
    .from('instructor_profiles')
    .select('user_id, first_name, last_name, certificate_type, bio, slug, referral_code')
    .eq('slug', slug.toLowerCase())
    .eq('status', 'approved')
    .single();

  if (error || !data) return null;

  return {
    instructorUserId: data.user_id as string,
    instructorName: [data.first_name, data.last_name].filter(Boolean).join(' ') || 'Instructor',
    certType: (data.certificate_type as string) || null,
    bio: (data.bio as string) || null,
    slug: data.slug as string,
    referralCode: data.referral_code as string,
  };
}
