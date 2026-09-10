import { createContext, ReactNode, useCallback, useContext, useEffect, useState } from 'react';

import { useAuth } from './auth';
import { getTier } from './endpoints';

type GateState = {
  /** null = unknown (tier in flight); true = show /onboarding; false = past it. */
  needsOnboarding: boolean | null;
  /** true once the tier fetch has failed every retry — render a retry screen, never guess. */
  gateError: boolean;
  /** Re-run the tier fetch (from the gate-error screen). */
  retry: () => void;
  /** Called by the wizard on completion/skip so the gate stops redirecting (no loop). */
  setOnboarded: () => void;
};

const Ctx = createContext<GateState>({
  needsOnboarding: null,
  gateError: false,
  retry: () => {},
  setOnboarded: () => {},
});

export const useOnboardingGate = () => useContext(Ctx);

const MAX_ATTEMPTS = 3;

/**
 * Resolves whether the signed-in user still needs onboarding by reading
 * onboardingCompleted from GET /api/user/tier. Server-truth, never guessed.
 *
 * On error we DO NOT fail open (that would let a real first-run user skip
 * onboarding + the store-required consents — consent isn't enforced server-side
 * on exam start). Instead we retry with backoff and, on persistent failure,
 * surface a retry screen via `gateError`.
 */
export function OnboardingGateProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth();
  const userId = session?.user?.id ?? null;
  const [resolved, setResolved] = useState<{ userId: string | null; attempt: number; needs: boolean | null; error: boolean }>({ userId: null, attempt: 0, needs: null, error: false });
  const [attempt, setAttempt] = useState(0);

  const retry = useCallback(() => setAttempt((a) => a + 1), []);

  // Key on the user id (not the session object, which churns on token refresh).
  // Reset to null while re-fetching so the gate WAITS on a user switch instead of
  // acting on the previous user's stale value (which would bounce mid-transition).
  useEffect(() => {
    if (!userId) {
      return;
    }
    let cancelled = false;
    (async () => {
      for (let i = 0; i < MAX_ATTEMPTS; i++) {
        if (cancelled) return;
        try {
          const t = await getTier();
          if (!cancelled) setResolved({ userId, attempt, needs: !t.onboardingCompleted || !t.aiDataConsented || !t.disclaimerAcknowledged, error: false });
          return;
        } catch {
          if (i < MAX_ATTEMPTS - 1) {
            await new Promise((r) => setTimeout(r, 400 * (i + 1)));
          }
        }
      }
      if (!cancelled) setResolved({ userId, attempt, needs: null, error: true });
    })();
    return () => {
      cancelled = true;
    };
  }, [userId, attempt]);

  const current = resolved.userId === userId && resolved.attempt === attempt;
  return (
    <Ctx.Provider value={{ needsOnboarding: current ? resolved.needs : null, gateError: current && resolved.error, retry, setOnboarded: () => setResolved({ userId, attempt, needs: false, error: false }) }}>
      {children}
    </Ctx.Provider>
  );
}
