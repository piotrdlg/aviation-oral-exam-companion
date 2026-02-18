'use client';

import posthog from 'posthog-js';
import { PostHogProvider as PHProvider } from 'posthog-js/react';
import { useEffect } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';

function getConsent(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const raw = localStorage.getItem('heydpe_consent');
    if (!raw) return false;
    const parsed = JSON.parse(raw);
    return parsed.analytics === true;
  } catch {
    return false;
  }
}

let posthogInitialized = false;

function initPostHog() {
  if (posthogInitialized) return;
  if (!process.env.NEXT_PUBLIC_POSTHOG_KEY) return;

  posthog.init(process.env.NEXT_PUBLIC_POSTHOG_KEY, {
    api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST || 'https://us.i.posthog.com',
    person_profiles: 'identified_only',
    capture_pageview: false, // We capture manually on route change
    loaded: (ph) => {
      if (process.env.NODE_ENV === 'development') ph.debug();
    },
  });
  posthogInitialized = true;
}

function PostHogPageview() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    if (!posthogInitialized) return;
    const url = window.origin + pathname + (searchParams?.toString() ? `?${searchParams.toString()}` : '');
    posthog.capture('$pageview', { $current_url: url });
  }, [pathname, searchParams]);

  return null;
}

export default function PostHogProviderWrapper({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    if (getConsent()) {
      initPostHog();
    }

    // Listen for consent changes
    const handleStorage = (e: StorageEvent) => {
      if (e.key === 'heydpe_consent') {
        if (getConsent()) initPostHog();
      }
    };
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, []);

  if (!posthogInitialized) return <>{children}</>;

  return (
    <PHProvider client={posthog}>
      <PostHogPageview />
      {children}
    </PHProvider>
  );
}
