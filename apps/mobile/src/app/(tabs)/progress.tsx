import { StyleSheet, Text, View } from 'react-native';

import { Card, H1, Lead, MicroLabel, Screen, Stat } from '@/components/cockpit';
import { colors, font, fontSize, space } from '@/theme/tokens';

const AREAS = [
  { code: 'PA.I', name: 'Preflight preparation', pct: 0.82 },
  { code: 'PA.II', name: 'Preflight procedures', pct: 0.55 },
  { code: 'PA.III', name: 'Airport operations', pct: 0.23 },
  { code: 'PA.VI', name: 'Navigation', pct: 0.4 },
];

export default function ProgressScreen() {
  return (
    <Screen scroll>
      <MicroLabel>PROGRESS</MicroLabel>
      <H1>Your readiness</H1>
      <Lead>ACS coverage across every area of operation, scored from your sessions.</Lead>

      <View style={styles.statsRow}>
        <Stat value="12" label="SESSIONS" />
        <Stat value="148" label="EXCHANGES" accent={colors.cyanReadable} />
        <Stat value="61%" label="READY" accent={colors.greenReadable} />
      </View>

      <View style={{ height: space[5] }} />
      <Card>
        <MicroLabel color={colors.cyanReadable}>ACS COVERAGE</MicroLabel>
        {AREAS.map((a) => (
          <View key={a.code} style={styles.row}>
            <View style={styles.rowHead}>
              <Text style={styles.code}>{a.code}</Text>
              <Text style={styles.name}>{a.name}</Text>
              <Text style={styles.pct}>{Math.round(a.pct * 100)}%</Text>
            </View>
            <View style={styles.track}>
              <View style={[styles.fill, { width: `${a.pct * 100}%`, backgroundColor: barColor(a.pct) }]} />
            </View>
          </View>
        ))}
      </Card>
    </Screen>
  );
}

function barColor(pct: number) {
  if (pct >= 0.7) return colors.green;
  if (pct >= 0.4) return colors.amber;
  return colors.red;
}

const styles = StyleSheet.create({
  statsRow: { flexDirection: 'row', gap: space[3] },
  row: { marginTop: space[4] },
  rowHead: { flexDirection: 'row', alignItems: 'center', marginBottom: space[2] },
  code: {
    fontFamily: font.mono,
    fontSize: fontSize.micro,
    color: colors.cyanReadable,
    width: 56,
  },
  name: { flex: 1, fontFamily: font.sans, fontSize: fontSize.sm, color: colors.text },
  pct: { fontFamily: font.mono, fontSize: fontSize.sm, color: colors.muted },
  track: { height: 6, borderRadius: 3, backgroundColor: colors.elevated, overflow: 'hidden' },
  fill: { height: 6, borderRadius: 3 },
});
