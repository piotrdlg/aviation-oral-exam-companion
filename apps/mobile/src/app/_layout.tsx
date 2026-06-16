import { DarkTheme, ThemeProvider } from 'expo-router';

import { AnimatedSplashOverlay } from '@/components/animated-icon';
import AppTabs from '@/components/app-tabs';

// HeyDPE is dark-first (FLIGHT DECK cockpit theme). Force the dark navigation
// theme regardless of the device color scheme; full token-level navigation
// theming lands with the design-system + tabs build.
export default function RootLayout() {
  return (
    <ThemeProvider value={DarkTheme}>
      <AnimatedSplashOverlay />
      <AppTabs />
    </ThemeProvider>
  );
}
