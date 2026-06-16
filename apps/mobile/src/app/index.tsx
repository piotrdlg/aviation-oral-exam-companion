import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';

import { colors, fontSize, radius, space } from '@/theme/tokens';

export default function HomeScreen() {
  return (
    <View style={styles.root}>
      <StatusBar style="light" />
      <SafeAreaView style={styles.safe} edges={['top']}>
        <Text style={styles.microLabel}>// FLIGHT DECK</Text>
        <Text style={styles.h1}>Ready for your{'\n'}checkride?</Text>
        <Text style={styles.lead}>
          Practice the oral with an AI examiner that actually listens — voice-first, ACS-scored.
        </Text>

        {/* Resume card — raised instrument glass */}
        <View style={styles.card}>
          <Text style={styles.cardLabel}>// RESUME</Text>
          <Text style={styles.cardTitle}>Private Pilot — Area III</Text>
          <Text style={styles.cardMeta}>Weather · 14 of 61 tasks covered</Text>
          <Pressable style={styles.cta} accessibilityRole="button">
            <Text style={styles.ctaText}>Continue exam</Text>
          </Pressable>
        </View>

        {/* Instrument readouts */}
        <View style={styles.statsRow}>
          <Stat value="3" label="EXAMS" />
          <Stat value="2" label="STREAK" accent={colors.cyanReadable} />
          <Stat value="61%" label="READY" accent={colors.greenReadable} />
        </View>
      </SafeAreaView>
    </View>
  );
}

function Stat({ value, label, accent = colors.amber }: { value: string; label: string; accent?: string }) {
  return (
    <View style={styles.stat}>
      <Text style={[styles.statValue, { color: accent }]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  safe: {
    flex: 1,
    paddingHorizontal: space[5],
    paddingTop: space[4],
  },
  microLabel: {
    fontFamily: 'Menlo',
    fontSize: fontSize.micro,
    letterSpacing: 3,
    color: colors.cyanReadable,
    marginBottom: space[3],
  },
  h1: {
    fontSize: fontSize.h1,
    lineHeight: 40,
    fontWeight: '700',
    color: colors.text,
    letterSpacing: -0.5,
    marginBottom: space[3],
  },
  lead: {
    fontSize: fontSize.base,
    lineHeight: 23,
    color: colors.muted,
    marginBottom: space[6],
  },
  card: {
    backgroundColor: colors.bezel,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.xl,
    padding: space[5],
    marginBottom: space[6],
  },
  cardLabel: {
    fontFamily: 'Menlo',
    fontSize: fontSize.micro,
    letterSpacing: 3,
    color: colors.amber,
    marginBottom: space[2],
  },
  cardTitle: {
    fontSize: fontSize.xl,
    fontWeight: '600',
    color: colors.text,
    marginBottom: space[1],
  },
  cardMeta: {
    fontSize: fontSize.sm,
    color: colors.dim,
    marginBottom: space[4],
  },
  cta: {
    backgroundColor: colors.amber,
    borderRadius: radius.md,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaText: {
    color: colors.bg,
    fontSize: 15,
    fontWeight: '600',
  },
  statsRow: {
    flexDirection: 'row',
    gap: space[3],
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
    fontFamily: 'Menlo',
    fontSize: fontSize.xxl,
    fontWeight: '700',
    marginBottom: space[1],
  },
  statLabel: {
    fontFamily: 'Menlo',
    fontSize: fontSize.micro,
    letterSpacing: 2,
    color: colors.muted,
  },
});
