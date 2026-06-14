'use client';

import { useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useState } from 'react';
import { Logo } from '@/components/Brand';

// ---------------------------------------------------------------------------
// Types & constants
// ---------------------------------------------------------------------------

type EmailCategory =
  | 'account_security'
  | 'billing_transactional'
  | 'support_transactional'
  | 'learning_digest'
  | 'motivation_nudges'
  | 'product_updates'
  | 'marketing';

const CATEGORY_LABELS: Record<EmailCategory, string> = {
  account_security: 'Account & Security',
  billing_transactional: 'Billing & Payments',
  support_transactional: 'Support Tickets',
  learning_digest: 'Daily Learning Digest',
  motivation_nudges: 'Practice Reminders',
  product_updates: 'Product Updates',
  marketing: 'Marketing & Promotions',
};

const REQUIRED_CATEGORIES: EmailCategory[] = [
  'account_security',
  'billing_transactional',
  'support_transactional',
];

const OPTIONAL_CATEGORIES: EmailCategory[] = [
  'learning_digest',
  'motivation_nudges',
  'product_updates',
  'marketing',
];

interface PreferenceRow {
  category: EmailCategory;
  enabled: boolean;
}

// ---------------------------------------------------------------------------
// Inner component (needs Suspense boundary for useSearchParams)
// ---------------------------------------------------------------------------

function EmailPreferencesInner() {
  const searchParams = useSearchParams();
  const uid = searchParams.get('uid');
  const cat = searchParams.get('cat') as EmailCategory | null;
  const token = searchParams.get('token');
  const action = searchParams.get('action');

  const [preferences, setPreferences] = useState<PreferenceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);
  const [unsubscribed, setUnsubscribed] = useState(false);

  // -----------------------------------------------------------------------
  // Fetch current preferences
  // -----------------------------------------------------------------------
  const fetchPreferences = useCallback(async () => {
    if (!uid || !cat || !token) return;

    try {
      const res = await fetch(
        `/api/email/preferences?uid=${encodeURIComponent(uid)}&cat=${encodeURIComponent(cat)}&token=${encodeURIComponent(token)}`,
      );

      if (res.status === 403) {
        setError('This link has expired or is invalid.');
        setLoading(false);
        return;
      }

      if (!res.ok) {
        setError('Something went wrong. Please try again later.');
        setLoading(false);
        return;
      }

      const data = await res.json();
      setPreferences(data.preferences ?? []);
      setLoading(false);
    } catch {
      setError('Unable to load preferences. Please check your connection.');
      setLoading(false);
    }
  }, [uid, cat, token]);

  // -----------------------------------------------------------------------
  // One-click unsubscribe (if action=unsubscribe)
  // -----------------------------------------------------------------------
  const performUnsubscribe = useCallback(async () => {
    if (!uid || !cat || !token) return;

    try {
      const res = await fetch('/api/email/preferences', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uid, category: cat, token, enabled: false }),
      });

      if (res.ok) {
        setUnsubscribed(true);
      }
    } catch {
      // Silently fail — the user can still toggle manually
    }
  }, [uid, cat, token]);

  // -----------------------------------------------------------------------
  // Init: validate params, optionally auto-unsubscribe, then load prefs
  // -----------------------------------------------------------------------
  useEffect(() => {
    if (!uid || !cat || !token) {
      setError('Invalid link. Missing required parameters.');
      setLoading(false);
      return;
    }

    async function init() {
      if (action === 'unsubscribe') {
        await performUnsubscribe();
      }
      await fetchPreferences();
    }

    init();
  }, [uid, cat, token, action, performUnsubscribe, fetchPreferences]);

  // -----------------------------------------------------------------------
  // Toggle handler
  // -----------------------------------------------------------------------
  async function togglePref(category: EmailCategory, enabled: boolean) {
    if (!uid || !token) return;

    setSaving(category);
    setSaveSuccess(null);

    try {
      const res = await fetch('/api/email/preferences', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uid, category, token, enabled }),
      });

      if (res.ok) {
        setPreferences((prev) =>
          prev.map((p) => (p.category === category ? { ...p, enabled } : p)),
        );
        setSaveSuccess(category);
        setTimeout(() => setSaveSuccess(null), 2000);
      }
    } catch {
      // Revert nothing — preference state stays as-is
    } finally {
      setSaving(null);
    }
  }

  // -----------------------------------------------------------------------
  // Helper: get enabled state for a category
  // -----------------------------------------------------------------------
  function isEnabled(category: EmailCategory): boolean {
    const pref = preferences.find((p) => p.category === category);
    if (REQUIRED_CATEGORIES.includes(category)) return true;
    return pref?.enabled ?? true;
  }

  // -----------------------------------------------------------------------
  // Error state
  // -----------------------------------------------------------------------
  if (error) {
    return (
      <div className="min-h-screen bg-c-bg flex items-center justify-center px-4">
        <div className="max-w-lg mx-auto text-center">
          <div className="flex justify-center mb-8">
            <Logo size="md" href="/" />
          </div>
          <div className="bezel border border-c-border rounded-xl p-8">
            <p className="font-mono text-xs text-c-red tracking-[0.3em] uppercase mb-2">
              Error
            </p>
            <p className="text-sm text-c-muted leading-relaxed">{error}</p>
          </div>
          <Footer />
        </div>
      </div>
    );
  }

  // -----------------------------------------------------------------------
  // Loading state
  // -----------------------------------------------------------------------
  if (loading) {
    return (
      <div className="min-h-screen bg-c-bg flex items-center justify-center px-4">
        <div className="max-w-lg mx-auto text-center">
          <div className="flex justify-center mb-8">
            <Logo size="md" href="/" />
          </div>
          <div className="bezel border border-c-border rounded-xl p-8">
            <p className="text-sm text-c-muted animate-pulse">
              Loading preferences…
            </p>
          </div>
        </div>
      </div>
    );
  }

  // -----------------------------------------------------------------------
  // Main UI
  // -----------------------------------------------------------------------
  return (
    <div className="min-h-screen bg-c-bg flex flex-col items-center px-4 py-12">
      <div className="max-w-lg mx-auto w-full">
        {/* Logo */}
        <div className="flex justify-center mb-8">
          <Logo size="md" href="/" />
        </div>

        {/* Unsubscribe confirmation banner */}
        {unsubscribed && cat && (
          <div className="bg-c-green-lo border border-c-green-dim rounded-lg p-4 mb-6">
            <p className="text-sm text-c-green-readable text-center">
              You&apos;ve been unsubscribed from{' '}
              <span className="font-semibold">{CATEGORY_LABELS[cat]}</span>.
            </p>
          </div>
        )}

        {/* Preferences card */}
        <div className="bezel border border-c-border rounded-xl overflow-hidden">
          {/* Header */}
          <div className="px-6 py-5 border-b border-c-border">
            <h1 className="text-base font-bold tracking-tight text-c-text">
              Email preferences
            </h1>
            <p className="text-sm text-c-muted mt-1">
              Choose which emails you&apos;d like to receive from HeyDPE.
            </p>
          </div>

          {/* Optional categories */}
          <div className="divide-y divide-c-border">
            {OPTIONAL_CATEGORIES.map((category) => {
              const enabled = isEnabled(category);
              const isSaving = saving === category;
              const justSaved = saveSuccess === category;
              const isLinked = category === cat;

              return (
                <div
                  key={category}
                  className={`px-6 py-3 flex items-center justify-between ${
                    isLinked ? 'bg-c-amber-lo/40' : ''
                  }`}
                >
                  <div className="flex-1 min-w-0 mr-4">
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-c-text">
                        {CATEGORY_LABELS[category]}
                      </span>
                      {isLinked && (
                        <span className="font-mono text-c-amber text-xs tracking-wider uppercase">
                          Linked
                        </span>
                      )}
                      {justSaved && (
                        <span className="font-mono text-c-green-readable text-xs tracking-wider uppercase">
                          Saved
                        </span>
                      )}
                    </div>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={enabled}
                    aria-label={`Toggle ${CATEGORY_LABELS[category]}`}
                    disabled={isSaving}
                    onClick={() => togglePref(category, !enabled)}
                    className={`relative inline-flex h-11 w-11 flex-shrink-0 items-center justify-center cursor-pointer rounded-md ${
                      isSaving ? 'cursor-wait' : ''
                    }`}
                  >
                    <span
                      className={`relative inline-flex h-6 w-11 rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out ${
                        enabled ? 'bg-c-amber' : 'bg-c-bezel border-c-border'
                      } ${isSaving ? 'opacity-50' : ''}`}
                    >
                      <span
                        className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                          enabled ? 'translate-x-5' : 'translate-x-0'
                        }`}
                      />
                    </span>
                  </button>
                </div>
              );
            })}
          </div>

          {/* Required categories */}
          <div className="border-t border-c-border">
            <div className="px-6 py-3">
              <p className="font-mono text-c-dim text-xs tracking-[0.2em] uppercase">
                // Required — cannot be disabled
              </p>
            </div>
            <div className="divide-y divide-c-border/50">
              {REQUIRED_CATEGORIES.map((category) => (
                <div
                  key={category}
                  className="px-6 py-3 flex items-center justify-between opacity-60"
                >
                  <span className="text-sm text-c-muted">
                    {CATEGORY_LABELS[category]}
                  </span>
                  <div
                    className="relative inline-flex h-6 w-11 flex-shrink-0 rounded-full bg-c-border cursor-not-allowed"
                    title="This email category is required and cannot be disabled"
                  >
                    <span className="pointer-events-none inline-block h-5 w-5 translate-x-5 transform rounded-full bg-c-dim shadow ring-0 mt-0.5 ml-0.5" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <Footer />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Footer
// ---------------------------------------------------------------------------

function Footer() {
  return (
    <div className="mt-8 text-center">
      <p className="text-xs text-c-dim">
        Imagine Flying LLC &middot; Jacksonville, FL
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page export (with Suspense boundary for useSearchParams)
// ---------------------------------------------------------------------------

export default function EmailPreferencesPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-c-bg flex items-center justify-center px-4">
          <div className="max-w-lg mx-auto text-center">
            <div className="flex justify-center mb-8">
              <Logo size="md" href="/" />
            </div>
            <div className="bezel border border-c-border rounded-xl p-8">
              <p className="text-sm text-c-muted animate-pulse">
                Loading…
              </p>
            </div>
          </div>
        </div>
      }
    >
      <EmailPreferencesInner />
    </Suspense>
  );
}
