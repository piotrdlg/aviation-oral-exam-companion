import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { supabase } from '@/lib/supabase';
import { colors, font, fontSize, space } from '@/theme/tokens';

// Dev-only fast sign-in for simulator verification — no typing required: open
// `heydpe://dev-login` (or `exp://…/--/dev-login` in Expo Go). Credentials come
// from the gitignored .env (a throwaway test account); the route is inert in
// production builds (the effect early-returns under !__DEV__).
const DEV_EMAIL = process.env.EXPO_PUBLIC_DEV_EMAIL;
const DEV_PASSWORD = process.env.EXPO_PUBLIC_DEV_PASSWORD;

export default function DevLogin() {
  const [msg, setMsg] = useState('Signing in…');

  useEffect(() => {
    if (!__DEV__) {
      router.replace('/login');
      return;
    }
    (async () => {
      if (!DEV_EMAIL || !DEV_PASSWORD) {
        setMsg('Set EXPO_PUBLIC_DEV_EMAIL / EXPO_PUBLIC_DEV_PASSWORD in apps/mobile/.env');
        return;
      }
      const { error } = await supabase.auth.signInWithPassword({
        email: DEV_EMAIL,
        password: DEV_PASSWORD,
      });
      if (error) setMsg(`Dev sign-in failed: ${error.message}`);
      // success → onAuthStateChange → the root gate redirects to /(tabs)
    })();
  }, []);

  return (
    <View style={styles.root}>
      <ActivityIndicator color={colors.amber} />
      <Text style={styles.msg}>{msg}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
    padding: space[5],
  },
  msg: {
    fontFamily: font.mono,
    fontSize: fontSize.sm,
    color: colors.muted,
    marginTop: space[4],
    textAlign: 'center',
  },
});
