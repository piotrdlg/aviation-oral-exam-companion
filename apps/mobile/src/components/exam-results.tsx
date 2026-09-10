import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useCallback } from 'react';

import { MicroLabel, PrimaryButton } from './cockpit';
import { apiFetch } from '@/lib/api';
import { getSessions } from '@/lib/endpoints';
import type { ElementScoresResponse } from '@/lib/types';
import { useAsync } from '@/lib/use-async';
import { colors, font, fontSize, space } from '@/theme/tokens';

export function ExamResults({ sessionId }: { sessionId: string }) {
  const load = useCallback(async () => {
    const [elements, sessions] = await Promise.all([
      apiFetch<ElementScoresResponse>(`/api/session?action=session-element-scores&sessionId=${encodeURIComponent(sessionId)}`),
      getSessions(),
    ]);
    return { scores: elements.scores, result: sessions.sessions.find((s) => s.id === sessionId)?.result };
  }, [sessionId]);
  const { data, error, loading, refresh } = useAsync(load);

  if (loading) return <ActivityIndicator color={colors.amber} />;
  if (error || !data) return <PrimaryButton label="Retry results" onPress={refresh} />;
  const labels = { satisfactory: 'Satisfactory', partial: 'Partial', unsatisfactory: 'Unsatisfactory' } as const;
  const weakAreas = [...new Set(data.scores.filter((s) => s.latest_score === 'partial' || s.latest_score === 'unsatisfactory').map((s) => s.area))];

  return (
    <View style={styles.section}>
      <MicroLabel>RESULT</MicroLabel>
      <Text style={styles.grade}>{data.result?.grade === 'satisfactory' ? 'Satisfactory' : data.result?.grade === 'unsatisfactory' ? 'Needs more practice' : 'Incomplete coverage'}</Text>
      {Object.entries(labels).map(([score, label]) => (
        <View key={score} style={styles.row}>
          <Text style={styles.label}>{label}</Text>
          <Text style={styles.count}>{data.scores.filter((s) => s.latest_score === score).length}</Text>
        </View>
      ))}
      {!data.scores.length ? <Text style={styles.label}>No graded answers in this session.</Text> : null}
      {weakAreas.length ? <View style={{ marginTop: space[4] }}>
        <MicroLabel>AREAS TO REVIEW</MicroLabel>
        {weakAreas.map((area) => <Text key={area} style={styles.label}>{area}</Text>)}
      </View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { marginVertical: space[5], gap: space[2] },
  grade: { color: colors.text, fontFamily: font.sansSemibold, fontSize: fontSize.xl, marginBottom: space[3] },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: space[3], paddingVertical: space[2] },
  label: { color: colors.muted, fontFamily: font.sans, fontSize: fontSize.base, flexShrink: 1 },
  count: { color: colors.cyanReadable, fontFamily: font.mono, fontSize: fontSize.base },
});
