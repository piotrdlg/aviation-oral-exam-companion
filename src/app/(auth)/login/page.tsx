'use client';

import { Suspense, useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { useRouter, useSearchParams } from 'next/navigation';
import type { Provider } from '@supabase/supabase-js';

type AuthStep = 'initial' | 'otp-sent' | 'verifying';

/** Map URL error codes to user-friendly messages */
function getErrorMessage(code: string | null, detail: string | null): string | null {
  if (!code) return null;
  switch (code) {
    case 'oauth_error':
      return detail || 'Sign-in with your provider failed. Please try again.';
    case 'code_exchange_failed':
      return 'Authentication failed. Please try signing in again.';
    case 'verification_failed':
      return 'Verification failed. The code may have expired — please request a new one.';
    case 'no_auth_params':
      return 'Something went wrong during sign-in. Please try again.';
    case 'auth_callback_failed':
      return 'Authentication failed. Please try again.';
    default:
      return 'An unexpected error occurred. Please try again.';
  }
}

/** Suspense wrapper required by Next.js for useSearchParams() during static generation */
export default function LoginPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex flex-col items-center justify-center bg-c-bg px-4">
        <div className="w-full max-w-md p-8 bezel rounded-lg border border-c-border animate-pulse">
          <div className="h-6 bg-c-panel rounded w-20 mb-6 mx-auto" />
          <div className="h-5 bg-c-panel rounded w-48 mb-2 mx-auto" />
          <div className="h-4 bg-c-panel rounded w-64 mb-8 mx-auto" />
          <div className="space-y-3">
            <div className="h-11 bg-c-panel rounded-lg" />
            <div className="h-11 bg-c-panel rounded-lg" />
            <div className="h-11 bg-c-panel rounded-lg" />
          </div>
        </div>
      </div>
    }>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const [email, setEmail] = useState('');
  const [otpDigits, setOtpDigits] = useState(['', '', '', '', '', '']);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<AuthStep>('initial');
  const [loadingOAuth, setLoadingOAuth] = useState<Provider | null>(null);
  const [loadingOtp, setLoadingOtp] = useState(false);
  const [loadingVerify, setLoadingVerify] = useState(false);
  const [codeSentMessage, setCodeSentMessage] = useState('');
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = createClient();
  const otpRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Show callback errors from URL params
  useEffect(() => {
    const errorCode = searchParams.get('error');
    const errorDetail = searchParams.get('message');
    const msg = getErrorMessage(errorCode, errorDetail);
    if (msg) {
      setError(msg);
      window.history.replaceState({}, '', '/login');
    }
  }, [searchParams]);

  // Redirect if already authenticated
  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) router.replace('/practice');
    });
  }, [supabase, router]);

  // Focus first OTP input when step changes to otp-sent
  useEffect(() => {
    if (step === 'otp-sent') {
      otpRefs.current[0]?.focus();
    }
  }, [step]);

  async function handleOAuthLogin(provider: Provider) {
    setLoadingOAuth(provider);
    setError(null);

    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    });

    if (error) {
      setError(error.message);
      setLoadingOAuth(null);
    }
  }

  async function handleSendOtp(e: React.FormEvent) {
    e.preventDefault();
    setLoadingOtp(true);
    setError(null);

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        shouldCreateUser: true,
      },
    });

    if (error) {
      setError(error.message);
      setLoadingOtp(false);
    } else {
      setCodeSentMessage(`Code sent to ${email}`);
      setStep('otp-sent');
      setLoadingOtp(false);
    }
  }

  function handleOtpChange(index: number, value: string) {
    if (value && !/^\d$/.test(value)) return;

    const newDigits = [...otpDigits];
    newDigits[index] = value;
    setOtpDigits(newDigits);

    if (value && index < 5) {
      otpRefs.current[index + 1]?.focus();
    }

    if (value && index === 5) {
      const code = newDigits.join('');
      if (code.length === 6) {
        handleVerifyOtp(code);
      }
    }
  }

  function handleOtpKeyDown(index: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Backspace' && !otpDigits[index] && index > 0) {
      otpRefs.current[index - 1]?.focus();
    }
  }

  function handleOtpPaste(e: React.ClipboardEvent) {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (pasted.length === 0) return;

    const newDigits = [...otpDigits];
    for (let i = 0; i < pasted.length; i++) {
      newDigits[i] = pasted[i];
    }
    setOtpDigits(newDigits);

    const nextEmpty = newDigits.findIndex((d) => !d);
    if (nextEmpty >= 0) {
      otpRefs.current[nextEmpty]?.focus();
    } else {
      otpRefs.current[5]?.focus();
      const code = newDigits.join('');
      if (code.length === 6) {
        handleVerifyOtp(code);
      }
    }
  }

  async function handleVerifyOtp(code?: string) {
    const token = code || otpDigits.join('');
    if (token.length !== 6) {
      setError('Please enter the full 6-digit code');
      return;
    }

    setLoadingVerify(true);
    setError(null);
    setStep('verifying');

    const { error } = await supabase.auth.verifyOtp({
      email,
      token,
      type: 'email',
    });

    if (error) {
      setError(error.message);
      setOtpDigits(['', '', '', '', '', '']);
      setStep('otp-sent');
      setLoadingVerify(false);
    } else {
      router.push('/practice');
      router.refresh();
    }
  }

  function handleResendCode() {
    setOtpDigits(['', '', '', '', '', '']);
    setStep('initial');
    setError(null);
  }

  const oauthProviders: { provider: Provider; label: string; icon: React.ReactNode }[] = [
    {
      provider: 'google',
      label: 'Continue with Google',
      icon: (
        <svg className="w-5 h-5" viewBox="0 0 24 24">
          <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
          <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
          <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
          <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
        </svg>
      ),
    },
    {
      provider: 'apple',
      label: 'Continue with Apple',
      icon: (
        <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
          <path d="M17.05 20.28c-.98.95-2.05.88-3.08.4-1.09-.5-2.08-.48-3.24 0-1.44.62-2.2.44-3.06-.4C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z" />
        </svg>
      ),
    },
    {
      provider: 'azure',
      label: 'Continue with Microsoft',
      icon: (
        <svg className="w-5 h-5" viewBox="0 0 24 24">
          <path d="M3 3h8.5v8.5H3z" fill="#F25022" />
          <path d="M12.5 3H21v8.5h-8.5z" fill="#7FBA00" />
          <path d="M3 12.5h8.5V21H3z" fill="#00A4EF" />
          <path d="M12.5 12.5H21V21h-8.5z" fill="#FFB900" />
        </svg>
      ),
    },
  ];

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-c-bg px-4">
      {/* Brand link */}
      <Link href="/" className="font-mono font-bold text-c-amber glow-a text-xl tracking-widest mb-8 hover:text-c-amber/80 transition-colors">
        HEYDPE
      </Link>

      <div className="w-full max-w-md">
        {/* Auth card */}
        <div className="p-8 bezel rounded-lg border border-c-border">
          <div className="text-center mb-8">
            <p className="font-mono text-xs text-c-cyan glow-c tracking-[0.3em] uppercase mb-3">// AUTHENTICATION</p>
            <h1 className="font-mono font-bold text-c-amber glow-a text-sm tracking-wider uppercase mb-1">SIGN IN TO HEYDPE</h1>
            <p className="text-sm text-c-muted font-light">Practice your checkride oral exam</p>
          </div>

          {/* Error banner */}
          {error && step === 'initial' && (
            <div className="mb-6 p-3 bg-c-red-dim/40 border border-c-red/30 rounded-lg flex items-start gap-2.5">
              <span className="text-c-red text-sm mt-0.5 shrink-0">&#9888;</span>
              <p className="text-c-red text-sm">{error}</p>
            </div>
          )}

          {/* OAuth buttons */}
          <div className="space-y-2.5">
            {oauthProviders.map(({ provider, label, icon }) => (
              <button
                key={provider}
                onClick={() => handleOAuthLogin(provider)}
                disabled={loadingOAuth !== null}
                className="w-full flex items-center justify-center gap-3 px-4 py-3 bg-c-bezel hover:bg-c-border border border-c-border hover:border-c-border-hi rounded-lg text-c-text font-mono text-xs font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loadingOAuth === provider ? <Spinner /> : icon}
                <span className="uppercase tracking-wide">{loadingOAuth === provider ? 'Redirecting...' : label}</span>
              </button>
            ))}
          </div>

          {/* Divider */}
          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-c-border" />
            </div>
            <div className="relative flex justify-center text-xs">
              <span className="bg-c-bezel px-3 text-c-dim font-mono uppercase tracking-wide">or</span>
            </div>
          </div>

          {/* Email OTP flow — Step 1: email input */}
          {step === 'initial' && (
            <form onSubmit={handleSendOtp} className="space-y-3">
              <div>
                <label htmlFor="email" className="block font-mono text-[10px] text-c-muted uppercase tracking-wider mb-1.5">
                  EMAIL ADDRESS
                </label>
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                  placeholder="you@example.com"
                  className="w-full px-3 py-2.5 bg-c-panel border border-c-border rounded-lg text-c-text font-mono text-xs focus:outline-none focus:ring-1 focus:ring-c-amber focus:border-c-amber placeholder-c-dim transition-colors"
                />
              </div>

              <button
                type="submit"
                disabled={loadingOtp}
                className="w-full py-3 bg-c-amber hover:bg-c-amber/90 disabled:bg-c-amber/50 disabled:cursor-not-allowed text-c-bg rounded-lg font-mono font-semibold text-xs tracking-wider uppercase transition-colors flex items-center justify-center gap-2"
              >
                {loadingOtp ? (
                  <>
                    <Spinner />
                    SENDING CODE...
                  </>
                ) : (
                  'SEND LOGIN CODE'
                )}
              </button>
            </form>
          )}

          {/* Email OTP flow — Step 2: code input */}
          {(step === 'otp-sent' || step === 'verifying') && (
            <div className="space-y-4">
              {codeSentMessage && (
                <div className="flex items-center gap-2 justify-center">
                  <span className="text-c-green text-sm shrink-0">&#10003;</span>
                  <p className="text-c-green text-sm font-mono">{codeSentMessage}</p>
                </div>
              )}

              <div>
                <label className="block font-mono text-[10px] text-c-muted uppercase tracking-wider mb-3 text-center">
                  ENTER THE 6-DIGIT CODE
                </label>
                <div className="flex justify-center gap-2" onPaste={handleOtpPaste}>
                  {otpDigits.map((digit, index) => (
                    <input
                      key={index}
                      ref={(el) => { otpRefs.current[index] = el; }}
                      type="text"
                      inputMode="numeric"
                      maxLength={1}
                      value={digit}
                      onChange={(e) => handleOtpChange(index, e.target.value)}
                      onKeyDown={(e) => handleOtpKeyDown(index, e)}
                      disabled={step === 'verifying'}
                      className="w-11 h-12 text-center text-lg font-mono bg-c-panel border border-c-border rounded-lg text-c-amber focus:outline-none focus:ring-1 focus:ring-c-amber focus:border-c-amber disabled:opacity-50 transition-colors"
                      aria-label={`Digit ${index + 1}`}
                    />
                  ))}
                </div>
              </div>

              <p className="text-c-dim text-xs text-center font-mono">Code expires in 10 minutes</p>

              {/* OTP error */}
              {error && (
                <div className="flex items-center gap-2 justify-center">
                  <span className="text-c-red text-sm shrink-0">&#9888;</span>
                  <p className="text-c-red text-sm font-mono">{error}</p>
                </div>
              )}

              {step === 'verifying' && (
                <div className="flex items-center justify-center gap-2 text-c-muted text-sm font-mono">
                  <Spinner />
                  VERIFYING...
                </div>
              )}

              {step === 'otp-sent' && (
                <button
                  onClick={() => handleVerifyOtp()}
                  disabled={otpDigits.join('').length !== 6}
                  className="w-full py-3 bg-c-amber hover:bg-c-amber/90 disabled:bg-c-amber/50 disabled:cursor-not-allowed text-c-bg rounded-lg font-mono font-semibold text-xs tracking-wider uppercase transition-colors flex items-center justify-center gap-2"
                >
                  VERIFY CODE
                </button>
              )}

              <button
                onClick={handleResendCode}
                disabled={step === 'verifying'}
                className="w-full text-sm text-c-muted hover:text-c-amber font-mono transition-colors disabled:opacity-50"
              >
                Use a different email or resend code
              </button>
            </div>
          )}
        </div>

        {/* "Why no password?" explainer */}
        <details className="mt-4 group">
          <summary className="text-xs text-c-dim hover:text-c-muted cursor-pointer transition-colors flex items-center justify-center gap-1 font-mono">
            <span className="text-sm">?</span>
            WHY NO PASSWORD?
          </summary>
          <div className="mt-2 p-3 bezel rounded-lg border border-c-border text-xs text-c-muted leading-relaxed">
            Passwordless login is more secure — no passwords to leak, reuse, or forget. Sign in with your Google, Apple, or Microsoft account for one-tap access, or use a one-time email code. Your account is tied to your email, not a password you have to remember.
          </div>
        </details>

        {/* Trust + legal */}
        <p className="mt-6 text-xs text-c-dim text-center leading-relaxed max-w-sm mx-auto font-mono">
          By continuing, you agree to our{' '}
          <Link href="/terms" className="text-c-amber hover:text-c-amber/80 underline underline-offset-2 transition-colors">Terms of Service</Link>
          {' '}and{' '}
          <Link href="/privacy" className="text-c-amber hover:text-c-amber/80 underline underline-offset-2 transition-colors">Privacy Policy</Link>.
        </p>
      </div>
    </div>
  );
}

function Spinner() {
  return (
    <svg
      className="animate-spin h-4 w-4"
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
    >
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
    </svg>
  );
}
