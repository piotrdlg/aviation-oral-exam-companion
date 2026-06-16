import { StyleSheet, Text, View } from 'react-native';

import { Body, Card, H1, Lead, MicroLabel, PrimaryButton, Screen } from '@/components/cockpit';
import { colors, font, fontSize, space } from '@/theme/tokens';

const RATINGS = ['Private', 'Commercial', 'Instrument'] as const;

export default function PracticeScreen() {
  return (
    <Screen scroll>
      <MicroLabel>PRACTICE</MicroLabel>
      <H1>Start an exam</H1>
      <Lead>Pick a rating and study mode, then talk through the oral with your AI examiner.</Lead>

      <Card style={{ marginBottom: space[4] }}>
        <MicroLabel color={colors.amber}>RATING</MicroLabel>
        <View style={styles.chips}>
          {RATINGS.map((r, i) => (
            <View key={r} style={[styles.chip, i === 0 && styles.chipActive]}>
              <Text style={[styles.chipText, i === 0 && styles.chipTextActive]}>{r}</Text>
            </View>
          ))}
        </View>
        <View style={{ height: space[4] }} />
        <MicroLabel color={colors.amber}>MODE</MicroLabel>
        <Body>Linear · Cross-ACS · Weak areas · Quick drill · Mock checkride</Body>
        <View style={{ height: space[5] }} />
        <PrimaryButton label="Begin exam" />
      </Card>

      <Text style={styles.note}>Voice and the live exam loop wire up next.</Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  chips: { flexDirection: 'row', gap: space[2], flexWrap: 'wrap' },
  chip: {
    paddingHorizontal: space[4],
    paddingVertical: space[2],
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.panel,
  },
  chipActive: { borderColor: colors.amber, backgroundColor: colors.amberLo },
  chipText: { fontFamily: font.sans, fontSize: fontSize.sm, color: colors.muted },
  chipTextActive: { color: colors.amberBright, fontWeight: '600' },
  note: { fontFamily: font.mono, fontSize: fontSize.micro, color: colors.dim, marginTop: space[5] },
});
