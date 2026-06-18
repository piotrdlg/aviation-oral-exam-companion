import {
  IBMPlexSans_400Regular,
  IBMPlexSans_500Medium,
  IBMPlexSans_600SemiBold,
  IBMPlexSans_700Bold,
} from '@expo-google-fonts/ibm-plex-sans';
import {
  JetBrainsMono_400Regular,
  JetBrainsMono_700Bold,
} from '@expo-google-fonts/jetbrains-mono';
import { useFonts } from 'expo-font';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { AuthProvider, useAuth } from '@/lib/auth';
import { OnboardingGateProvider, useOnboardingGate } from '@/lib/onboarding-gate';
import { colors, font, fontSize, radius, space } from '@/theme/tokens';

function DarkFrame() {
  return (
    <View style={styles.frame}>
      <ActivityIndicator color={colors.amber} />
    </View>
  );
}

// Shown when the onboarding gate can't reach GET /api/user/tier after retries.
// We never guess onboarding status (failing open would skip store-required
// consent), so the user retries rather than entering the app blind.
function GateErrorFrame({ onRetry }: { onRetry: () => void }) {
  return (
    <View style={styles.frame}>
      <Text style={styles.errTitle}>Couldn&apos;t connect</Text>
      <Text style={styles.errMsg}>We couldn&apos;t reach HeyDPE. Check your connection and try again.</Text>
      <Pressable onPress={onRetry} style={styles.retry}>
        <Text style={styles.retryText}>Retry</Text>
      </Pressable>
    </View>
  );
}

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    IBMPlexSans_400Regular,
    IBMPlexSans_500Medium,
    IBMPlexSans_600SemiBold,
    IBMPlexSans_700Bold,
    JetBrainsMono_400Regular,
    JetBrainsMono_700Bold,
  });

  if (!fontsLoaded) return <DarkFrame />;

  return (
    <AuthProvider>
      <OnboardingGateProvider>
        <StatusBar style="light" />
        <RootNavigator />
      </OnboardingGateProvider>
    </AuthProvider>
  );
}

// Gate: no session → /login; signed-in but not onboarded → /onboarding (modal);
// signed-in + onboarded while on an auth/onboarding route → /(tabs).
function RootNavigator() {
  const { session, loading } = useAuth();
  const { needsOnboarding, gateError, retry } = useOnboardingGate();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    const root = segments[0];
    const onAuthRoute = root === 'login' || root === 'dev-login';

    if (!session) {
      if (!onAuthRoute) router.replace('/login');
      return;
    }
    // Signed in. Wait until the tier fetch resolves before deciding onboarding.
    if (needsOnboarding === null) return;
    if (needsOnboarding) {
      if (root !== 'onboarding') router.replace('/onboarding');
      return;
    }
    // Onboarded: bounce off auth/onboarding routes into the app.
    if (onAuthRoute || root === 'onboarding') router.replace('/(tabs)');
  }, [session, loading, needsOnboarding, segments, router]);

  if (loading) return <DarkFrame />;
  // Don't mount the tab UI until onboarding status is known for a signed-in user
  // (otherwise a not-onboarded user flashes/interacts with the tabs pre-redirect).
  if (session && gateError) return <GateErrorFrame onRetry={retry} />;
  if (session && needsOnboarding === null) return <DarkFrame />;

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.bg },
      }}>
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="login" />
      <Stack.Screen name="dev-login" />
      <Stack.Screen name="onboarding" options={{ presentation: 'modal', gestureEnabled: false }} />
    </Stack>
  );
}

const styles = StyleSheet.create({
  frame: {
    flex: 1,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
    gap: space[3],
    padding: space[5],
  },
  errTitle: { fontFamily: font.sansBold, fontSize: fontSize.xl, color: colors.text },
  errMsg: { fontFamily: font.sans, fontSize: fontSize.sm, color: colors.dim, textAlign: 'center', lineHeight: 20 },
  retry: {
    marginTop: space[2],
    minHeight: 48,
    paddingHorizontal: space[6],
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.amber,
    borderRadius: radius.md,
  },
  retryText: { fontFamily: font.sansSemibold, fontSize: 15, color: colors.bg },
});
