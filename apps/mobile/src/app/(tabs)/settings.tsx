import { StyleSheet, Text, View } from 'react-native';

import { Card, H1, MicroLabel, Screen } from '@/components/cockpit';
import { colors, font, fontSize, space } from '@/theme/tokens';

type Row = { label: string; value?: string; danger?: boolean };

const SECTIONS: { title: string; rows: Row[] }[] = [
  {
    title: 'ACCOUNT',
    rows: [
      { label: 'Email', value: 'pilot@example.com' },
      { label: 'Plan', value: 'Trial' },
    ],
  },
  {
    title: 'EXAM',
    rows: [
      { label: 'Examiner voice', value: 'Aura-2 · Orion' },
      { label: 'Theme', value: 'Flight deck' },
    ],
  },
  {
    title: 'DANGER ZONE',
    rows: [
      { label: 'Sign out' },
      { label: 'Delete account', danger: true },
    ],
  },
];

export default function SettingsScreen() {
  return (
    <Screen scroll>
      <MicroLabel>SETTINGS</MicroLabel>
      <H1>Account</H1>

      {SECTIONS.map((section) => (
        <View key={section.title} style={{ marginTop: space[4] }}>
          <MicroLabel color={colors.cyanReadable}>{section.title}</MicroLabel>
          <Card style={styles.card}>
            {section.rows.map((row, i) => (
              <View
                key={row.label}
                style={[styles.row, i < section.rows.length - 1 && styles.rowBorder]}>
                <Text style={[styles.rowLabel, row.danger && styles.danger]}>{row.label}</Text>
                {row.value ? <Text style={styles.rowValue}>{row.value}</Text> : null}
              </View>
            ))}
          </Card>
        </View>
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: { paddingVertical: space[1], paddingHorizontal: space[4] },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 48,
  },
  rowBorder: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  rowLabel: { fontFamily: font.sans, fontSize: fontSize.base, color: colors.text },
  rowValue: { fontFamily: font.mono, fontSize: fontSize.sm, color: colors.muted },
  danger: { color: colors.red },
});
