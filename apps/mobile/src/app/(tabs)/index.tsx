import { StyleSheet, Text, View } from 'react-native';

import { Card, H1, Lead, MicroLabel, PrimaryButton, Screen, Stat } from '@/components/cockpit';
import { colors, font, fontSize, space } from '@/theme/tokens';

export default function HomeScreen() {
  return (
    <Screen scroll>
      <MicroLabel>FLIGHT DECK</MicroLabel>
      <H1>Ready for your{'\n'}checkride?</H1>
      <Lead>
        Practice the oral with an AI examiner that actually listens — voice-first, ACS-scored.
      </Lead>

      <Card style={{ marginBottom: space[6] }}>
        <MicroLabel color={colors.amber}>RESUME</MicroLabel>
        <Text style={styles.cardTitle}>Private Pilot — Area III</Text>
        <Text style={styles.cardMeta}>Weather · 14 of 61 tasks covered</Text>
        <PrimaryButton label="Continue exam" />
      </Card>

      <View style={styles.statsRow}>
        <Stat value="3" label="EXAMS" />
        <Stat value="2" label="STREAK" accent={colors.cyanReadable} />
        <Stat value="61%" label="READY" accent={colors.greenReadable} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  cardTitle: {
    fontFamily: font.sansSemibold,
    fontSize: fontSize.xl,
    fontWeight: '600',
    color: colors.text,
    marginBottom: space[1],
  },
  cardMeta: {
    fontFamily: font.sans,
    fontSize: fontSize.sm,
    color: colors.dim,
    marginBottom: space[4],
  },
  statsRow: { flexDirection: 'row', gap: space[3] },
});
