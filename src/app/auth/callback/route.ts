import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import type { EmailOtpType } from '@supabase/supabase-js';
import type { AuthMethod } from '@/types/database';

// Service-role client for profile updates (bypasses RLS)
const serviceSupabase = createServiceClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/**
 * Map Supabase auth provider to our AuthMethod type.
 * Supabase sets user.app_metadata.provider to 'google', 'apple', 'microsoft', or 'email'.
 * We map 'email' -> 'email_otp' for clarity (distinguishes from password auth).
 */
function mapAuthMethod(provider?: string): AuthMethod {
  switch (provider) {
    case 'google': return 'google';
    case 'apple': return 'apple';
    case 'microsoft': return 'microsoft';
    case 'email': return 'email_otp';
    default: return 'email_otp';
  }
}

/**
 * Update user_profiles with last_login_at and auth_method.
 * Non-blocking — errors are logged but don't affect the redirect.
 */
async function trackLogin(userId: string, provider?: string): Promise<void> {
  const { error } = await serviceSupabase
    .from('user_profiles')
    .update({
      last_login_at: new Date().toISOString(),
      auth_method: mapAuthMethod(provider),
    })
    .eq('user_id', userId);

  if (error) {
    console.error('[auth/callback] Failed to update last_login_at:', error.message);
  }
}

/**
 * Ensure user_profiles row exists for this user.
 * The on_auth_user_created trigger should create it, but this is a safety net
 * in case the trigger fails or there's a race condition with OAuth providers.
 */
async function ensureProfile(userId: string): Promise<void> {
  const { data } = await serviceSupabase
    .from('user_profiles')
    .select('user_id')
    .eq('user_id', userId)
    .single();

  if (!data) {
    const { error } = await serviceSupabase
      .from('user_profiles')
      .insert({ user_id: userId, tier: 'checkride_prep', subscription_status: 'none' });

    if (error && !error.message.includes('duplicate')) {
      console.error('[auth/callback] Failed to create user profile:', error.message);
    }
  }
}

export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get('code');
  const tokenHash = searchParams.get('token_hash');
  const type = searchParams.get('type');
  const next = searchParams.get('next') ?? '/practice';
  const errorParam = searchParams.get('error');
  const errorDescription = searchParams.get('error_description');

  // Handle OAuth error callback (provider or Supabase returned an error)
  if (errorParam) {
    console.error('[auth/callback] OAuth error:', errorParam, errorDescription);
    const loginUrl = new URL('/login', origin);
    loginUrl.searchParams.set('error', 'oauth_error');
    loginUrl.searchParams.set('message', errorDescription || errorParam);
    return NextResponse.redirect(loginUrl.toString());
  }

  const supabase = await createClient();

  // Handle OAuth callback (code-based PKCE exchange)
  // This works for both OAuth providers (Google, Apple, Microsoft)
  // and email confirmation links that use the code flow
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      console.error('[auth/callback] Code exchange failed:', error.message);
      const loginUrl = new URL('/login', origin);
      loginUrl.searchParams.set('error', 'code_exchange_failed');
      loginUrl.searchParams.set('message', error.message);
      return NextResponse.redirect(loginUrl.toString());
    }

    // Track login and ensure profile exists
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      // These are fire-and-forget — don't block the redirect
      void trackLogin(user.id, user.app_metadata?.provider);
      void ensureProfile(user.id);
    }
    return NextResponse.redirect(`${origin}${next}`);
  }

  // Handle OTP / magic link verification via token_hash
  // This is used when Supabase sends a verification link with token_hash param
  // Valid EmailOtpType values: 'signup' | 'invite' | 'magiclink' | 'recovery' | 'email_change' | 'email'
  if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type: type as EmailOtpType,
    });
    if (error) {
      console.error('[auth/callback] OTP verification failed:', error.message);
      const loginUrl = new URL('/login', origin);
      loginUrl.searchParams.set('error', 'verification_failed');
      loginUrl.searchParams.set('message', error.message);
      return NextResponse.redirect(loginUrl.toString());
    }

    // Track login and ensure profile exists
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      void trackLogin(user.id, user.app_metadata?.provider);
      void ensureProfile(user.id);
    }
    return NextResponse.redirect(`${origin}${next}`);
  }

  // No code, no token_hash, no error — shouldn't happen
  console.error('[auth/callback] No auth params received. Query:', Object.fromEntries(searchParams));
  const loginUrl = new URL('/login', origin);
  loginUrl.searchParams.set('error', 'no_auth_params');
  return NextResponse.redirect(loginUrl.toString());
}
