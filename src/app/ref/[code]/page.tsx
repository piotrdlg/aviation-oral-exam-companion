'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import Footer from '@/components/Footer';

interface InstructorInfo {
  instructorName: string;
  certType: string | null;
  bio: string | null;
  slug: string;
}

export default function ReferralPage() {
  const { code } = useParams<{ code: string }>();
  const router = useRouter();
  const [instructor, setInstructor] = useState<InstructorInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [claiming, setClaiming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [connectedName, setConnectedName] = useState('');

  useEffect(() => {
    async function loadInstructor() {
      try {
        const res = await fetch(`/api/referral/lookup?code=${encodeURIComponent(code)}`);
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error || 'Referral code not found');
        }
        const data = await res.json();
        setInstructor(data.instructor);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load referral');
      } finally {
        setLoading(false);
      }
    }
    if (code) loadInstructor();
  }, [code]);

  async function handleClaim() {
    setClaiming(true);
    setError(null);
    try {
      const res = await fetch('/api/referral/claim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
      });

      if (res.status === 401) {
        // Not logged in — redirect to login with return URL
        router.push(`/login?redirect=${encodeURIComponent(`/ref/${code}`)}`);
        return;
      }

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to connect');
      }

      const resolvedName = data.instructorName || instructor?.instructorName || 'your instructor';
      setConnectedName(resolvedName);
      // Store connection info so the practice page can show a welcome banner
      sessionStorage.setItem('referral_just_connected', 'true');
      sessionStorage.setItem('referral_instructor_name', resolvedName);
      setSuccess(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to connect');
    } finally {
      setClaiming(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col bg-c-bg">
      <div className="flex-1 flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          {/* Header */}
          <div className="text-center mb-8">
            <Link href="/" className="inline-block">
              <span className="font-mono font-bold text-c-amber glow-a text-xl tracking-widest">
                HEYDPE
              </span>
            </Link>
          </div>

          <div className="bezel rounded-lg border border-c-border p-8">
            {loading ? (
              <div className="space-y-4 animate-pulse">
                <div className="h-3 bg-c-panel rounded w-24 mx-auto" />
                <div className="h-6 bg-c-panel rounded w-3/4 mx-auto" />
                <div className="h-4 bg-c-panel rounded w-1/2 mx-auto" />
                <div className="h-10 bg-c-panel rounded mt-6" />
              </div>
            ) : error && !instructor ? (
              <div className="text-center space-y-4">
                <p className="font-mono text-xs text-c-red">{error}</p>
                <Link
                  href="/"
                  className="inline-block text-c-amber hover:text-c-amber/80 text-xs font-mono uppercase tracking-wider transition-colors"
                >
                  Go to HeyDPE
                </Link>
              </div>
            ) : success ? (
              <div className="text-center space-y-4">
                <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-c-green/10 border border-c-green/30 mb-2">
                  <span className="text-c-green text-xl">&#10003;</span>
                </div>
                <h2 className="text-lg font-bold text-c-text font-mono">Connected!</h2>
                <p className="text-c-muted text-sm leading-relaxed">
                  You are now connected with{' '}
                  <span className="text-c-text font-medium">{connectedName}</span>.
                  They can now view your study progress on HeyDPE.
                </p>
                <Link
                  href="/practice"
                  className="inline-block w-full text-center py-3 rounded-lg bg-c-amber hover:bg-c-amber/90 text-c-bg font-bold text-xs font-mono uppercase tracking-wider transition-colors mt-4"
                >
                  Start Practicing
                </Link>
              </div>
            ) : (
              <div className="text-center space-y-5">
                <p className="font-mono text-xs text-c-cyan glow-c tracking-[0.3em] uppercase">
                  // Instructor Referral
                </p>
                <h2 className="text-xl font-bold text-c-text font-mono">
                  {instructor?.instructorName}
                </h2>
                {instructor?.certType && (
                  <span className="inline-block font-mono text-[10px] px-2 py-0.5 rounded border border-c-amber/30 bg-c-amber/10 text-c-amber uppercase">
                    {instructor.certType}
                  </span>
                )}
                {instructor?.bio && (
                  <p className="text-c-muted text-sm leading-relaxed">{instructor.bio}</p>
                )}
                <p className="text-c-dim text-sm leading-relaxed">
                  has invited you to connect on HeyDPE. Once connected, they can
                  monitor your checkride preparation progress and provide guidance.
                </p>

                {error && (
                  <p className="text-c-red text-xs font-mono">{error}</p>
                )}

                <button
                  onClick={handleClaim}
                  disabled={claiming}
                  className="w-full py-3 rounded-lg bg-c-amber hover:bg-c-amber/90 text-c-bg font-bold text-xs font-mono uppercase tracking-wider transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {claiming ? 'Connecting...' : 'Connect with Instructor'}
                </button>

                <p className="text-c-dim text-[10px] font-mono">
                  You&apos;ll need to sign in or create an account to connect.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
      <Footer variant="public" />
    </div>
  );
}
