import 'react-native-url-polyfill/auto';

import { AppState } from 'react-native';
import { createClient } from '@supabase/supabase-js';

import { config } from './config';
import { SecureStorageAdapter } from './secure-storage';

/**
 * Native Supabase client. Sessions persist in the Keychain/Keystore (chunked
 * SecureStore adapter); tokens auto-refresh. `detectSessionInUrl` is off — native
 * OAuth/OTP completes in-process via deep links, not a browser redirect URL.
 */
export const supabase = createClient(config.supabaseUrl, config.supabaseAnonKey, {
  auth: {
    storage: SecureStorageAdapter,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

// Refresh the session while the app is foregrounded, pause when backgrounded
// (the Supabase RN guidance — avoids refresh churn while suspended).
AppState.addEventListener('change', (state) => {
  if (state === 'active') supabase.auth.startAutoRefresh();
  else supabase.auth.stopAutoRefresh();
});
