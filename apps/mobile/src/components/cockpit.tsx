import { ReactNode } from 'react';
import {
  Pressable,
  ScrollView,
  StyleProp,
  StyleSheet,
  Text,
  TextStyle,
  View,
  ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors, font, fontSize, radius, space } from '@/theme/tokens';

/** Dark cockpit screen wrapper: full-bleed bg + top safe area + horizontal gutters. */
export function Screen({
  children,
  scroll = false,
  style,
}: {
  children: ReactNode;
  scroll?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const Inner = scroll ? (
    <ScrollView
      contentContainerStyle={[s.scrollContent, style]}
      showsVerticalScrollIndicator={false}>
      {children}
    </ScrollView>
  ) : (
    <View style={[s.body, style]}>{children}</View>
  );
  return (
    <View style={s.root}>
      <SafeAreaView style={s.safe} edges={['top']}>
        {Inner}
      </SafeAreaView>
    </View>
  );
}

/** Cockpit micro-label — caps-mono, tracked, colored. The // accent is part of the mark. */
export function MicroLabel({
  children,
  color = colors.cyanReadable,
  style,
}: {
  children: ReactNode;
  color?: string;
  style?: StyleProp<TextStyle>;
}) {
  return <Text style={[s.micro, { color }, style]}>{`// ${children}`}</Text>;
}

/** Interior page heading — sentence-case, bold, no glow. */
export function H1({ children, style }: { children: ReactNode; style?: StyleProp<TextStyle> }) {
  return <Text style={[s.h1, style]}>{children}</Text>;
}

export function H2({ children, style }: { children: ReactNode; style?: StyleProp<TextStyle> }) {
  return <Text style={[s.h2, style]}>{children}</Text>;
}

export function Lead({ children, style }: { children: ReactNode; style?: StyleProp<TextStyle> }) {
  return <Text style={[s.lead, style]}>{children}</Text>;
}

export function Body({ children, style }: { children: ReactNode; style?: StyleProp<TextStyle> }) {
  return <Text style={[s.bodyText, style]}>{children}</Text>;
}

/** Raised instrument-glass card (the bezel surface). */
export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[s.card, style]}>{children}</View>;
}

/** Primary amber command button (sentence-case, >=48pt target). */
export function PrimaryButton({
  label,
  onPress,
}: {
  label: string;
  onPress?: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [s.cta, pressed && { backgroundColor: colors.amberBright }]}>
      <Text style={s.ctaText}>{label}</Text>
    </Pressable>
  );
}

/** Instrument stat readout — mono numeric value + caps-mono label. */
export function Stat({
  value,
  label,
  accent = colors.amber,
}: {
  value: string;
  label: string;
  accent?: string;
}) {
  return (
    <View style={s.stat}>
      <Text style={[s.statValue, { color: accent }]}>{value}</Text>
      <Text style={s.statLabel}>{label}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  safe: { flex: 1 },
  body: { flex: 1, paddingHorizontal: space[5], paddingTop: space[4] },
  scrollContent: { paddingHorizontal: space[5], paddingTop: space[4], paddingBottom: space[8] },
  micro: {
    fontFamily: font.mono,
    fontSize: fontSize.micro,
    letterSpacing: 3,
    marginBottom: space[3],
  },
  h1: {
    fontFamily: font.sansBold,
    fontSize: fontSize.h1,
    lineHeight: 40,
    fontWeight: '700',
    color: colors.text,
    letterSpacing: -0.5,
    marginBottom: space[3],
  },
  h2: {
    fontFamily: font.sansSemibold,
    fontSize: fontSize.h2,
    fontWeight: '700',
    color: colors.text,
    letterSpacing: -0.3,
    marginBottom: space[2],
  },
  lead: {
    fontFamily: font.sans,
    fontSize: fontSize.base,
    lineHeight: 23,
    color: colors.muted,
    marginBottom: space[6],
  },
  bodyText: {
    fontFamily: font.sans,
    fontSize: fontSize.sm,
    lineHeight: 21,
    color: colors.muted,
  },
  card: {
    backgroundColor: colors.bezel,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.xl,
    padding: space[5],
  },
  cta: {
    backgroundColor: colors.amber,
    borderRadius: radius.md,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space[5],
  },
  ctaText: {
    fontFamily: font.sansSemibold,
    color: colors.bg,
    fontSize: 15,
    fontWeight: '600',
  },
  stat: {
    flex: 1,
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    paddingVertical: space[4],
    alignItems: 'center',
  },
  statValue: {
    fontFamily: font.mono,
    fontSize: fontSize.xxl,
    fontWeight: '700',
    marginBottom: space[1],
  },
  statLabel: {
    fontFamily: font.mono,
    fontSize: fontSize.micro,
    letterSpacing: 2,
    color: colors.muted,
  },
});
