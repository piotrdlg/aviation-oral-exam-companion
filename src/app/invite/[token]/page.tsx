'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';

interface InviteInfo {
  id: string;
  instructorName: string;
  instructorCertType: string | null;
  expired: boolean;
  claimed: boolean;
  revoked: boolean;
}

export default function InviteClaimPage() {
  const { token } = useParams<{ token: string }>();
  const router = useRouter();
  const [invite, setInvite] = useState<InviteInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [claiming, setClaiming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    async function loadInvite() {
      try {
        const res = await fetch(`/api/invite/${token}`);
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error || 'Invite not found');
        }
        const data = await res.json();
        setInvite(data.invite);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load invite');
      } finally {
        setLoading(false);
      }
    }
    if (token) loadInvite();
  }, [token]);

  async function handleClaim() {
    setClaiming(true);
    setError(null);
    try {
      const res = await fetch(`/api/invite/${token}`, { method: 'POST' });
      if (res.status === 401) {
        // Not logged in — redirect to login with return URL
        router.push(`/login?redirect=${encodeURIComponent(`/invite/${token}`)}`);
        return;
      }
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to accept invite');
      }
      setSuccess(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to accept invite');
    } finally {
      setClaiming(false);
    }
  }

  const isInvalid = invite && (invite.expired || invite.revoked);
  const isAlreadyClaimed = invite && invite.claimed;

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Header */}
        <div className="text-center mb-8">
          <Link href="/" className="inline-block">
            <h1 className="text-2xl font-bold text-amber-400 font-mono tracking-wider">
              HeyDPE
            </h1>
          </Link>
        </div>

        <div className="bg-gray-900 border border-gray-800 rounded-xl p-8">
          {loading ? (
            <div className="space-y-4 animate-pulse">
              <div className="h-6 bg-gray-800 rounded w-3/4 mx-auto" />
              <div className="h-4 bg-gray-800 rounded w-1/2 mx-auto" />
              <div className="h-10 bg-gray-800 rounded mt-6" />
            </div>
          ) : error && !invite ? (
            <div className="text-center space-y-4">
              <p className="text-red-400 text-sm">{error}</p>
              <Link
                href="/"
                className="inline-block text-amber-400 hover:text-amber-300 text-sm font-mono uppercase transition-colors"
              >
                Go to HeyDPE
              </Link>
            </div>
          ) : success ? (
            <div className="text-center space-y-4">
              <div className="text-4xl mb-2">✓</div>
              <h2 className="text-lg font-bold text-white">Connected!</h2>
              <p className="text-gray-400 text-sm">
                You are now connected with <span className="text-white font-medium">{invite?.instructorName}</span>.
                They can now view your study progress on HeyDPE.
              </p>
              <Link
                href="/practice"
                className="inline-block w-full text-center py-3 rounded-lg bg-amber-500 hover:bg-amber-400 text-gray-950 font-bold text-sm font-mono uppercase tracking-wider transition-colors mt-4"
              >
                Start Practicing
              </Link>
            </div>
          ) : isInvalid ? (
            <div className="text-center space-y-4">
              <h2 className="text-lg font-bold text-white">
                {invite.revoked ? 'Invite Revoked' : 'Invite Expired'}
              </h2>
              <p className="text-gray-400 text-sm">
                {invite.revoked
                  ? 'This invite has been revoked by the instructor.'
                  : 'This invite has expired. Ask your instructor for a new link.'}
              </p>
              <Link
                href="/"
                className="inline-block text-amber-400 hover:text-amber-300 text-sm font-mono uppercase transition-colors"
              >
                Go to HeyDPE
              </Link>
            </div>
          ) : isAlreadyClaimed ? (
            <div className="text-center space-y-4">
              <h2 className="text-lg font-bold text-white">Already Accepted</h2>
              <p className="text-gray-400 text-sm">
                This invite has already been used.
              </p>
              <Link
                href="/practice"
                className="inline-block text-amber-400 hover:text-amber-300 text-sm font-mono uppercase transition-colors"
              >
                Go to Practice
              </Link>
            </div>
          ) : (
            <div className="text-center space-y-5">
              <p className="font-mono text-xs text-cyan-400 tracking-[0.3em] uppercase">
                Instructor Invite
              </p>
              <h2 className="text-xl font-bold text-white">
                {invite?.instructorName}
              </h2>
              {invite?.instructorCertType && (
                <span className="inline-block font-mono text-[10px] px-2 py-0.5 rounded border border-amber-400/30 bg-amber-400/10 text-amber-400 uppercase">
                  {invite.instructorCertType}
                </span>
              )}
              <p className="text-gray-400 text-sm leading-relaxed">
                has invited you to connect on HeyDPE. Once connected, they can
                monitor your checkride preparation progress and provide guidance.
              </p>

              {error && (
                <p className="text-red-400 text-xs">{error}</p>
              )}

              <button
                onClick={handleClaim}
                disabled={claiming}
                className="w-full py-3 rounded-lg bg-amber-500 hover:bg-amber-400 text-gray-950 font-bold text-sm font-mono uppercase tracking-wider transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {claiming ? 'Connecting...' : 'Accept Invite'}
              </button>

              <p className="text-gray-600 text-[10px] font-mono">
                You&apos;ll need to sign in or create an account to accept.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
