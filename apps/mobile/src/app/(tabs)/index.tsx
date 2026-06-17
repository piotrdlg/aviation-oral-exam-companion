import { router } from 'expo-router';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { Card, H1, Lead, MicroLabel, PrimaryButton, Screen, Stat } from '@/components/cockpit';
import { getResumable, getStats, getTier } from '@/lib/endpoints';
import { useAsync } from '@/lib/use-async';
import { colors, font, fontSize, space } from '@/theme/tokens';

export default function HomeScreen() {
  const { data, error, loading, refresh } = useAsync(async () => {
    const tier = await getTier();
    const [stats, resumable] = await Promise.all([getStats(tier.preferredRating), getResumable()]);
    return { tier, stats: stats.stats, resumable: resumable.session };
  });

  if (loading && !data) {
    return (
      <Screen>
        <View style={styles.center}>
          <ActivityIndicator color={colors.amber} />
        </View>
      </Screen>
    );
  }

  if (error || !data) {
    return (
      <Screen>
        <View style={styles.center}>
          <Text style={styles.errTitle}>Couldn&apos;t load your dashboard</Text>
          <Text style={styles.errMsg}>{error?.message ?? 'Unknown error'}</Text>
          <Pressable onPress={refresh} style={styles.retry}>
            <Text style={styles.retryText}>Retry</Text>
          </Pressable>
        </View>
      </Screen>
    );
  }

  const { tier, stats, resumable } = data;
  const paid = tier.tier === 'dpe_live';

  return (
    <Screen scroll>
      <View style={styles.topRow}>
        <MicroLabel>FLIGHT DECK</MicroLabel>
        <View style={[styles.chip, { borderColor: paid ? colors.greenDim : colors.amberDim }]}>
          <Text style={[styles.chipText, { color: paid ? colors.greenReadable : colors.amber }]}>
            {paid ? 'PAID' : `TRIAL · ${tier.usage.sessionsThisMonth}/3`}
          </Text>
        </View>
      </View>

      <H1>{tier.displayName ? `Welcome back,\n${firstName(tier.displayName)}` : 'Ready for your\ncheckride?'}</H1>
      <Lead>
        Practice the oral with an AI examiner that actually listens — voice-first, ACS-scored.
      </Lead>

      {resumable ? (
        <Card style={{ marginBottom: space[6] }}>
          <MicroLabel color={colors.amber}>RESUME</MicroLabel>
          <Text style={styles.cardTitle}>{ratingLabel(resumable.rating)} — in progress</Text>
          <Text style={styles.cardMeta}>
            {(resumable.acs_tasks_covered?.length ?? 0)} tasks covered · {resumable.exchange_count} exchanges
          </Text>
          <PrimaryButton label="Continue exam" onPress={() => router.push('/practice')} />
        </Card>
      ) : (
        <Card style={{ marginBottom: space[6] }}>
          <MicroLabel color={colors.cyanReadable}>GET STARTED</MicroLabel>
          <Text style={styles.cardTitle}>No exam in progress</Text>
          <Text style={styles.cardMeta}>
            Start a {ratingLabel(tier.preferredRating)} oral whenever you&apos;re ready.
          </Text>
          <PrimaryButton label="Start an exam" onPress={() => router.push('/practice')} />
        </Card>
      )}

      <View style={styles.statsRow}>
        <Stat value={String(stats.totalSessions)} label="EXAMS" />
        <Stat value={String(stats.totalExchanges)} label="EXCHANGES" accent={colors.cyanReadable} />
        <Stat value={String(stats.uniqueTasksCovered)} label="TASKS" accent={colors.greenReadable} />
      </View>
    </Screen>
  );
}

function firstName(name: string) {
  return name.trim().split(/\s+/)[0];
}
function ratingLabel(r: string) {
  return r === 'commercial' ? 'Commercial' : r === 'instrument' ? 'Instrument' : 'Private Pilot';
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: space[3] },
  errTitle: { fontFamily: font.sansSemibold, fontSize: fontSize.lg, color: colors.text },
  errMsg: { fontFamily: font.sans, fontSize: fontSize.sm, color: colors.dim, textAlign: 'center', paddingHorizontal: space[5] },
  retry: {
    marginTop: space[2],
    paddingHorizontal: space[5],
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  retryText: { fontFamily: font.sansMedium, fontSize: fontSize.sm, color: colors.cyanReadable },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  chip: {
    paddingHorizontal: space[3],
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
    marginBottom: space[3],
  },
  chipText: { fontFamily: font.mono, fontSize: 11, letterSpacing: 1 },
  cardTitle: {
    fontFamily: font.sansSemibold,
    fontSize: fontSize.xl,
    color: colors.text,
    marginBottom: space[1],
  },
  cardMeta: { fontFamily: font.sans, fontSize: fontSize.sm, color: colors.dim, marginBottom: space[4] },
  statsRow: { flexDirection: 'row', gap: space[3] },
});
