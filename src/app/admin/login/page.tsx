'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';

/**
 * Admin Login Page
 *
 * Lives at /admin/login (OUTSIDE the (admin) route group) to avoid the admin
 * auth guard redirect loop. The (admin) layout guards check for admin status
 * and redirect to /admin/login when unauthenticated — if this page were inside
 * that route group, it would also be guarded and redirect back to itself.
 *
 * Uses Google OAuth via Supabase. After Google sign-in, the callback route
 * at /auth/callback exchanges the code and redirects to /admin.
 */
export default function AdminLoginPage() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const supabase = createClient();

  async function handleGoogleSignIn() {
    setLoading(true);
    setError(null);

    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback?next=/admin`,
      },
    });

    if (error) {
      setError(error.message);
      setLoading(false);
    }
    // If successful, browser redirects to Google OAuth
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-c-bg px-4">
      <div className="w-full max-w-sm p-8 bezel rounded-lg border border-c-border">
        <div className="text-center mb-8">
          <p className="font-mono text-xs text-c-cyan glow-c tracking-[0.3em] uppercase mb-3">// ADMIN ACCESS</p>
          <h1 className="font-mono font-bold text-c-amber glow-a text-sm tracking-wider uppercase mb-2">ADMIN PANEL</h1>
          <p className="font-mono text-[10px] text-c-dim uppercase tracking-wider">HeyDPE Administration</p>
        </div>

        {error && (
          <div className="bg-c-red-dim/40 border border-c-red/30 rounded-lg p-3 mb-6 flex items-start gap-2.5">
            <span className="text-c-red text-sm mt-0.5 shrink-0">&#9888;</span>
            <p className="text-c-red text-sm font-mono">{error}</p>
          </div>
        )}

        <button
          onClick={handleGoogleSignIn}
          disabled={loading}
          className="w-full flex items-center justify-center gap-3 px-4 py-3 bg-c-bezel hover:bg-c-border border border-c-border hover:border-c-border-hi rounded-lg text-c-text font-mono text-xs font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? (
            <svg
              className="animate-spin h-5 w-5"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              />
            </svg>
          ) : (
            <svg className="w-5 h-5" viewBox="0 0 24 24">
              <path
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
                fill="#4285F4"
              />
              <path
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                fill="#34A853"
              />
              <path
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                fill="#FBBC05"
              />
              <path
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                fill="#EA4335"
              />
            </svg>
          )}
          <span className="uppercase tracking-wide">{loading ? 'REDIRECTING...' : 'SIGN IN WITH GOOGLE'}</span>
        </button>

        <p className="mt-6 font-mono text-[10px] text-c-dim text-center leading-relaxed uppercase tracking-wider">
          Only authorized admin accounts can access this panel.
          Contact the project owner if you need access.
        </p>
      </div>
    </div>
  );
}
