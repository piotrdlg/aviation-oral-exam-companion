'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import Footer from '@/components/Footer';

interface InstructorPublic {
  instructorName: string;
  certType: string | null;
  bio: string | null;
  slug: string;
  referralCode: string;
}

export default function InstructorProfilePage() {
  const { slug } = useParams<{ slug: string }>();
  const router = useRouter();
  const [instructor, setInstructor] = useState<InstructorPublic | null>(null);
  const [loading, setLoading] = useState(true);
  const [claiming, setClaiming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [connectedName, setConnectedName] = useState('');

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/referral/lookup?slug=${encodeURIComponent(slug)}`);
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error || 'Instructor not found');
        }
        const data = await res.json();
        setInstructor(data.instructor);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load instructor');
      } finally {
        setLoading(false);
      }
    }
    if (slug) load();
  }, [slug]);

  async function handleConnect() {
    if (!instructor?.referralCode) return;
    setClaiming(true);
    setError(null);
    try {
      const res = await fetch('/api/referral/claim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: instructor.referralCode }),
      });

      if (res.status === 401) {
        router.push(`/login?redirect=${encodeURIComponent(`/instructor/${slug}`)}`);
        return;
      }

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to connect');
      }

      setConnectedName(data.instructorName || instructor.instructorName);
      setSuccess(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to connect');
    } finally {
      setClaiming(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col bg-c-bg">
      {/* Nav */}
      <nav className="border-b border-c-border bg-c-bg/80 backdrop-blur-lg">
        <div className="max-w-5xl mx-auto px-4 flex items-center justify-between h-14">
          <Link href="/" className="font-mono font-bold text-c-amber glow-a text-sm tracking-widest">
            HEYDPE
          </Link>
          <div className="flex items-center gap-4">
            <Link
              href="/login"
              className="font-mono text-xs text-c-muted hover:text-c-text transition-colors tracking-wide"
            >
              SIGN IN
            </Link>
            <Link
              href="/signup"
              className="font-mono text-xs px-4 py-1.5 bg-c-amber hover:bg-c-amber/90 text-c-bg rounded font-semibold tracking-wide transition-colors"
            >
              GET STARTED
            </Link>
          </div>
        </div>
      </nav>

      <div className="flex-1 flex items-center justify-center p-4">
        <div className="w-full max-w-lg">
          {loading ? (
            <div className="bezel rounded-lg border border-c-border p-8 space-y-4 animate-pulse">
              <div className="h-3 bg-c-panel rounded w-32 mx-auto" />
              <div className="h-8 bg-c-panel rounded w-48 mx-auto" />
              <div className="h-4 bg-c-panel rounded w-16 mx-auto" />
              <div className="h-20 bg-c-panel rounded mt-4" />
              <div className="h-12 bg-c-panel rounded mt-4" />
            </div>
          ) : error && !instructor ? (
            <div className="bezel rounded-lg border border-c-border p-8 text-center space-y-4">
              <h2 className="text-lg font-bold text-c-text font-mono">Instructor Not Found</h2>
              <p className="text-c-muted text-sm">
                This instructor profile doesn&apos;t exist or is no longer active.
              </p>
              <Link
                href="/"
                className="inline-block text-c-amber hover:text-c-amber/80 text-xs font-mono uppercase tracking-wider transition-colors"
              >
                Go to HeyDPE
              </Link>
            </div>
          ) : success ? (
            <div className="bezel rounded-lg border border-c-border p-8 text-center space-y-4">
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
            <div className="bezel rounded-lg border border-c-border p-8">
              {/* Instructor Profile Card */}
              <div className="text-center space-y-4 mb-8">
                <p className="font-mono text-xs text-c-cyan glow-c tracking-[0.3em] uppercase">
                  // Certified Flight Instructor
                </p>

                {/* Avatar placeholder */}
                <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-c-panel border border-c-border">
                  <span className="text-3xl text-c-amber font-mono font-bold">
                    {instructor?.instructorName?.charAt(0)?.toUpperCase() || '?'}
                  </span>
                </div>

                <h1 className="text-2xl font-bold text-c-text font-mono">
                  {instructor?.instructorName}
                </h1>

                {instructor?.certType && (
                  <span className="inline-block font-mono text-[10px] px-3 py-1 rounded border border-c-amber/30 bg-c-amber/10 text-c-amber uppercase tracking-wider">
                    {instructor.certType}
                  </span>
                )}

                {instructor?.bio && (
                  <p className="text-c-muted text-sm leading-relaxed max-w-md mx-auto">
                    {instructor.bio}
                  </p>
                )}
              </div>

              {/* What happens when you connect */}
              <div className="border-t border-c-border pt-6 mb-6">
                <h3 className="font-mono text-[10px] text-c-dim uppercase tracking-wider mb-3 text-center">
                  When you connect
                </h3>
                <ul className="space-y-2 text-sm text-c-muted">
                  <li className="flex items-start gap-2">
                    <span className="text-c-green mt-0.5 shrink-0">&#10003;</span>
                    Your instructor can see your practice session readiness scores
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-c-green mt-0.5 shrink-0">&#10003;</span>
                    They can track which ACS areas you&apos;ve covered
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-c-green mt-0.5 shrink-0">&#10003;</span>
                    You can disconnect at any time from your settings
                  </li>
                </ul>
              </div>

              {error && (
                <p className="text-c-red text-xs font-mono text-center mb-4">{error}</p>
              )}

              <button
                onClick={handleConnect}
                disabled={claiming}
                className="w-full py-3 rounded-lg bg-c-amber hover:bg-c-amber/90 text-c-bg font-bold text-xs font-mono uppercase tracking-wider transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {claiming ? 'Connecting...' : 'Connect with this Instructor'}
              </button>

              <p className="text-c-dim text-[10px] font-mono text-center mt-3">
                You&apos;ll need to sign in or create an account to connect.
              </p>
            </div>
          )}
        </div>
      </div>
      <Footer variant="public" />
    </div>
  );
}
