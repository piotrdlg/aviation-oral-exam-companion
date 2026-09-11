import { Session } from '@supabase/supabase-js';
import { createContext, ReactNode, useContext, useEffect, useState } from 'react';

import { supabase } from './supabase';

type AuthState = { session: Session | null; loading: boolean; error: boolean; retry: () => void };

const AuthContext = createContext<AuthState>({ session: null, loading: true, error: false, retry: () => {} });

export function useAuth() {
  return useContext(AuthContext);
}

/** Tracks the Supabase session (restored from the Keychain on launch, then live). */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let mounted = true;
    let receivedAuthEvent = false;
    supabase.auth.getSession().then(({ data, error }) => {
      if (!mounted || receivedAuthEvent) return;
      if (error) throw error;
      setSession(data.session);
      setLoading(false);
    }).catch(() => {
      if (!mounted || receivedAuthEvent) return;
      setError(true);
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      if (!mounted) return;
      receivedAuthEvent = true;
      setSession(next);
      setLoading(false);
      setError(false);
    });
    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, [attempt]);

  return <AuthContext.Provider value={{ session, loading, error, retry: () => { setError(false); setLoading(true); setAttempt((value) => value + 1); } }}>{children}</AuthContext.Provider>;
}
