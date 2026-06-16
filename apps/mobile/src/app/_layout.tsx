import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

import { colors } from '@/theme/tokens';

// HeyDPE is dark-first (FLIGHT DECK cockpit theme). The root stack hosts the
// (tabs) group; deep-linked stacks (exam, upgrade, auth) mount here later.
export default function RootLayout() {
  return (
    <>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.bg },
        }}>
        <Stack.Screen name="(tabs)" />
      </Stack>
    </>
  );
}
