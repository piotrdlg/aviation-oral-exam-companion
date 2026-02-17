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
    console.error('Failed to update last_login_at:', error.message);
  }
}

export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get('code');
  const tokenHash = searchParams.get('token_hash');
  const type = searchParams.get('type');
  const next = searchParams.get('next') ?? '/practice';

  const supabase = await createClient();

  // Handle OAuth callback (code-based PKCE exchange)
  // This works for both OAuth providers (Google, Apple, Microsoft)
  // and email confirmation links that use the code flow
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      // Track login after successful code exchange
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        // Fire and forget — don't block the redirect
        trackLogin(user.id, user.app_metadata?.provider);
      }
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  // Handle OTP / magic link verification via token_hash
  // This is used when Supabase sends a verification link with token_hash param
  // Valid EmailOtpType values: 'signup' | 'invite' | 'magiclink' | 'recovery' | 'email_change' | 'email'
  if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type: type as EmailOtpType,
    });
    if (!error) {
      // Track login after successful OTP verification
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        // Fire and forget — don't block the redirect
        trackLogin(user.id, user.app_metadata?.provider);
      }
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  // If both methods fail or no params provided, redirect to login with error hint
  const loginUrl = new URL('/login', origin);
  loginUrl.searchParams.set('error', 'auth_callback_failed');
  return NextResponse.redirect(loginUrl.toString());
}
