'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';

interface ConsentPreferences {
  analytics: boolean;
  marketing: boolean;
  timestamp: number;
}

const CONSENT_KEY = 'heydpe_consent';

declare global {
  interface Window {
    gtag: (...args: unknown[]) => void;
  }
}

function updateConsent(preferences: { analytics: boolean; marketing: boolean }) {
  // Ensure dataLayer exists for GTM consent mode
  const dl = (window.dataLayer = window.dataLayer ?? []);
  if (!window.gtag) {
    window.gtag = function (...args: unknown[]) {
      dl.push(args as unknown as Object);
    };
  }
  window.gtag('consent', 'update', {
    analytics_storage: preferences.analytics ? 'granted' : 'denied',
    ad_storage: preferences.marketing ? 'granted' : 'denied',
    ad_user_data: preferences.marketing ? 'granted' : 'denied',
    ad_personalization: preferences.marketing ? 'granted' : 'denied',
  });
}

function loadConsent(): ConsentPreferences | null {
  try {
    const stored = localStorage.getItem(CONSENT_KEY);
    if (stored) {
      return JSON.parse(stored) as ConsentPreferences;
    }
  } catch {
    // Ignore parse errors
  }
  return null;
}

function saveConsent(preferences: ConsentPreferences) {
  localStorage.setItem(CONSENT_KEY, JSON.stringify(preferences));
}

export function CookieConsent() {
  const [visible, setVisible] = useState(false);
  const [showCustomize, setShowCustomize] = useState(false);
  const [analyticsEnabled, setAnalyticsEnabled] = useState(false);
  const [marketingEnabled, setMarketingEnabled] = useState(false);

  useEffect(() => {
    const existing = loadConsent();
    if (existing) {
      // Consent already stored — silently update GTM and don't show banner
      updateConsent({ analytics: existing.analytics, marketing: existing.marketing });
    } else {
      // No consent stored — show banner after brief delay
      const timer = setTimeout(() => setVisible(true), 500);
      return () => clearTimeout(timer);
    }
  }, []);

  const handleAcceptAll = useCallback(() => {
    const preferences: ConsentPreferences = {
      analytics: true,
      marketing: true,
      timestamp: Date.now(),
    };
    saveConsent(preferences);
    updateConsent(preferences);
    setVisible(false);
    setShowCustomize(false);
  }, []);

  const handleNecessaryOnly = useCallback(() => {
    const preferences: ConsentPreferences = {
      analytics: false,
      marketing: false,
      timestamp: Date.now(),
    };
    saveConsent(preferences);
    updateConsent(preferences);
    setVisible(false);
    setShowCustomize(false);
  }, []);

  const handleSavePreferences = useCallback(() => {
    const preferences: ConsentPreferences = {
      analytics: analyticsEnabled,
      marketing: marketingEnabled,
      timestamp: Date.now(),
    };
    saveConsent(preferences);
    updateConsent(preferences);
    setVisible(false);
    setShowCustomize(false);
  }, [analyticsEnabled, marketingEnabled]);

  const handleOpenCustomize = useCallback(() => {
    setShowCustomize(true);
  }, []);

  const handleCloseCustomize = useCallback(() => {
    setShowCustomize(false);
  }, []);

  // Handle Escape key to close customize modal
  useEffect(() => {
    if (!showCustomize) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setShowCustomize(false);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [showCustomize]);

  if (!visible) return null;

  return (
    <>
      {/* Banner — fixed at bottom */}
      {!showCustomize && (
        <div
          className="fixed bottom-0 left-0 right-0 z-50 animate-[slideUp_0.4s_ease-out]"
          role="region"
          aria-label="Cookie consent"
        >
          <div className="border-t border-c-border bg-c-panel/95 backdrop-blur-sm">
            <div className="mx-auto flex max-w-5xl flex-col items-center gap-3 px-4 py-3 sm:flex-row sm:gap-4 sm:py-3">
              <p className="font-mono text-xs text-c-muted sm:flex-1">
                We use cookies to analyze traffic and improve your experience.{' '}
                <Link
                  href="/privacy"
                  className="text-c-amber underline underline-offset-2 hover:text-c-amber/80 transition-colors"
                >
                  Privacy Policy
                </Link>
              </p>
              <div className="flex shrink-0 items-center gap-2">
                <button
                  onClick={handleAcceptAll}
                  className="rounded border border-c-amber bg-c-amber/10 px-3 py-1.5 font-mono text-[11px] font-semibold uppercase tracking-wider text-c-amber hover:bg-c-amber/20 transition-colors focus:outline-none focus:ring-1 focus:ring-c-amber"
                >
                  Accept All
                </button>
                <button
                  onClick={handleNecessaryOnly}
                  className="rounded border border-c-border px-3 py-1.5 font-mono text-[11px] font-semibold uppercase tracking-wider text-c-muted hover:border-c-border-hi hover:text-c-text transition-colors focus:outline-none focus:ring-1 focus:ring-c-border-hi"
                >
                  Necessary Only
                </button>
                <button
                  onClick={handleOpenCustomize}
                  className="rounded border border-c-border px-3 py-1.5 font-mono text-[11px] font-semibold uppercase tracking-wider text-c-muted hover:border-c-border-hi hover:text-c-text transition-colors focus:outline-none focus:ring-1 focus:ring-c-border-hi"
                >
                  Customize
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Customize Modal */}
      {showCustomize && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-c-bg/70 backdrop-blur-sm"
          onClick={handleCloseCustomize}
          role="dialog"
          aria-modal="true"
          aria-label="Cookie preferences"
        >
          <div
            className="mx-4 w-full max-w-md animate-[slideUp_0.3s_ease-out] rounded-lg border border-c-border bg-c-panel shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="border-b border-c-border px-5 py-3">
              <h2 className="font-mono text-sm font-semibold uppercase tracking-wider text-c-amber">
                Cookie Preferences
              </h2>
            </div>

            {/* Categories */}
            <div className="space-y-0 divide-y divide-c-border">
              {/* Strictly Necessary */}
              <div className="flex items-center justify-between px-5 py-3">
                <div className="flex-1 pr-4">
                  <h3 className="font-mono text-xs font-semibold uppercase tracking-wider text-c-text">
                    Strictly Necessary
                  </h3>
                  <p className="mt-0.5 text-[11px] leading-relaxed text-c-muted">
                    Auth sessions, security, consent storage
                  </p>
                </div>
                {/* Always on — disabled toggle */}
                <div
                  className="relative inline-flex h-5 w-9 shrink-0 cursor-not-allowed items-center rounded-full bg-c-amber/30"
                  title="Always enabled"
                  aria-label="Strictly necessary cookies — always enabled"
                >
                  <span className="inline-block h-3.5 w-3.5 translate-x-[18px] rounded-full bg-c-amber transition-transform" />
                </div>
              </div>

              {/* Analytics */}
              <div className="flex items-center justify-between px-5 py-3">
                <div className="flex-1 pr-4">
                  <h3 className="font-mono text-xs font-semibold uppercase tracking-wider text-c-text">
                    Analytics
                  </h3>
                  <p className="mt-0.5 text-[11px] leading-relaxed text-c-muted">
                    Google Analytics, Microsoft Clarity, PostHog
                  </p>
                </div>
                <button
                  role="switch"
                  aria-checked={analyticsEnabled}
                  aria-label="Toggle analytics cookies"
                  onClick={() => setAnalyticsEnabled(!analyticsEnabled)}
                  className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full transition-colors focus:outline-none focus:ring-1 focus:ring-c-amber ${
                    analyticsEnabled ? 'bg-c-amber/30' : 'bg-c-border-hi'
                  }`}
                >
                  <span
                    className={`inline-block h-3.5 w-3.5 rounded-full transition-transform ${
                      analyticsEnabled
                        ? 'translate-x-[18px] bg-c-amber'
                        : 'translate-x-[3px] bg-c-muted'
                    }`}
                  />
                </button>
              </div>

              {/* Marketing */}
              <div className="flex items-center justify-between px-5 py-3">
                <div className="flex-1 pr-4">
                  <h3 className="font-mono text-xs font-semibold uppercase tracking-wider text-c-text">
                    Marketing
                  </h3>
                  <p className="mt-0.5 text-[11px] leading-relaxed text-c-muted">
                    Google Ads remarketing, conversion tracking
                  </p>
                </div>
                <button
                  role="switch"
                  aria-checked={marketingEnabled}
                  aria-label="Toggle marketing cookies"
                  onClick={() => setMarketingEnabled(!marketingEnabled)}
                  className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full transition-colors focus:outline-none focus:ring-1 focus:ring-c-amber ${
                    marketingEnabled ? 'bg-c-amber/30' : 'bg-c-border-hi'
                  }`}
                >
                  <span
                    className={`inline-block h-3.5 w-3.5 rounded-full transition-transform ${
                      marketingEnabled
                        ? 'translate-x-[18px] bg-c-amber'
                        : 'translate-x-[3px] bg-c-muted'
                    }`}
                  />
                </button>
              </div>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-end gap-2 border-t border-c-border px-5 py-3">
              <button
                onClick={handleCloseCustomize}
                className="rounded border border-c-border px-3 py-1.5 font-mono text-[11px] font-semibold uppercase tracking-wider text-c-muted hover:border-c-border-hi hover:text-c-text transition-colors focus:outline-none focus:ring-1 focus:ring-c-border-hi"
              >
                Cancel
              </button>
              <button
                onClick={handleSavePreferences}
                className="rounded border border-c-amber bg-c-amber/10 px-3 py-1.5 font-mono text-[11px] font-semibold uppercase tracking-wider text-c-amber hover:bg-c-amber/20 transition-colors focus:outline-none focus:ring-1 focus:ring-c-amber"
              >
                Save Preferences
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
