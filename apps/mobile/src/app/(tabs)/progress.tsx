import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { Card, H1, Lead, MicroLabel, Screen, Stat } from '@/components/cockpit';
import { getElementScores, getSessions, getStats, getTier } from '@/lib/endpoints';
import type { ElementScore, SessionRow } from '@/lib/types';
import { useAsync } from '@/lib/use-async';
import { colors, font, fontSize, radius, space } from '@/theme/tokens';

type AreaCov = { area: string; total: number; attempted: number; satisfactory: number };

function aggregateByArea(scores: ElementScore[]): AreaCov[] {
  const map = new Map<string, AreaCov>();
  for (const s of scores) {
    let a = map.get(s.area);
    if (!a) {
      a = { area: s.area, total: 0, attempted: 0, satisfactory: 0 };
      map.set(s.area, a);
    }
    a.total += 1;
    if (s.total_attempts > 0) a.attempted += 1;
    if (s.latest_score === 'satisfactory') a.satisfactory += 1;
  }
  // Areas you've touched first (most attempted), then the rest alphabetically.
  return [...map.values()].sort(
    (x, y) => y.attempted - x.attempted || x.area.localeCompare(y.area)
  );
}

export default function ProgressScreen() {
  const { data, error, loading, refresh } = useAsync(async () => {
    const tier = await getTier();
    const r = tier.preferredRating;
    const [stats, elementScores, sessions] = await Promise.all([
      getStats(r),
      getElementScores(r),
      getSessions(),
    ]);
    return { stats: stats.stats, scores: elementScores.scores, sessions: sessions.sessions };
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
          <Text style={styles.errTitle}>Couldn&apos;t load your progress</Text>
          <Text style={styles.errMsg}>{error?.message ?? 'Unknown error'}</Text>
          <Pressable onPress={refresh} style={styles.retry}>
            <Text style={styles.retryText}>Retry</Text>
          </Pressable>
        </View>
      </Screen>
    );
  }

  const { stats, scores, sessions } = data;
  const areas = aggregateByArea(scores);
  const totalElements = scores.length;
  const attemptedElements = scores.filter((s) => s.total_attempts > 0).length;
  const coveragePct = totalElements ? Math.round((attemptedElements / totalElements) * 100) : 0;
  const touched = areas.filter((a) => a.attempted > 0);
  const completed = sessions.filter((s) => s.status === 'completed').length;

  return (
    <Screen scroll>
      <MicroLabel>PROGRESS</MicroLabel>
      <H1>Your readiness</H1>
      <Lead>ACS coverage across every area of operation, scored from your sessions.</Lead>

      <View style={styles.statsRow}>
        <Stat value={String(stats.totalSessions)} label="EXAMS" />
        <Stat value={String(stats.totalExchanges)} label="EXCHANGES" accent={colors.cyanReadable} />
        <Stat value={`${coveragePct}%`} label="COVERAGE" accent={colors.greenReadable} />
      </View>

      <View style={{ height: space[5] }} />
      <Card>
        <MicroLabel color={colors.cyanReadable}>ACS COVERAGE</MicroLabel>
        <Text style={styles.coverageNote}>
          {attemptedElements} of {totalElements} elements attempted
        </Text>
        {touched.length === 0 ? (
          <Text style={styles.empty}>
            No elements scored yet. Finish an exam and your coverage shows up here.
          </Text>
        ) : (
          touched.map((a) => {
            const mastery = a.attempted ? a.satisfactory / a.attempted : 0;
            return (
              <View key={a.area} style={styles.row}>
                <View style={styles.rowHead}>
                  <Text style={styles.name} numberOfLines={1}>
                    {a.area}
                  </Text>
                  <Text style={styles.pct}>
                    {a.satisfactory}/{a.attempted}
                  </Text>
                </View>
                <View style={styles.track}>
                  <View
                    style={[styles.fill, { width: `${Math.max(mastery * 100, 3)}%`, backgroundColor: barColor(mastery) }]}
                  />
                </View>
              </View>
            );
          })
        )}
      </Card>

      <View style={{ height: space[5] }} />
      <Card>
        <MicroLabel color={colors.amber}>RECENT SESSIONS</MicroLabel>
        {sessions.length === 0 ? (
          <Text style={styles.empty}>No sessions yet.</Text>
        ) : (
          sessions.slice(0, 6).map((s) => <SessionItem key={s.id} s={s} />)
        )}
        {completed > 0 ? (
          <Text style={styles.coverageNote}>{completed} completed</Text>
        ) : null}
      </Card>
    </Screen>
  );
}

function SessionItem({ s }: { s: SessionRow }) {
  const grade = s.result?.grade;
  return (
    <View style={styles.sessionRow}>
      <View style={{ flex: 1 }}>
        <Text style={styles.sessionTitle}>
          {ratingLabel(s.rating)} · {modeLabel(s.study_mode)}
        </Text>
        <Text style={styles.sessionMeta}>
          {fmtDate(s.started_at)} · {s.exchange_count} exchanges
        </Text>
      </View>
      <View style={[styles.statusChip, statusStyle(s.status, grade)]}>
        <Text style={[styles.statusText, { color: statusColor(s.status, grade) }]}>
          {grade ? grade.toUpperCase() : s.status.toUpperCase()}
        </Text>
      </View>
    </View>
  );
}

function barColor(m: number) {
  if (m >= 0.7) return colors.green;
  if (m >= 0.4) return colors.amber;
  return colors.red;
}
function statusColor(status: string, grade?: string) {
  if (grade === 'pass') return colors.greenReadable;
  if (grade === 'fail') return colors.red;
  if (status === 'active' || status === 'paused') return colors.amber;
  return colors.dim;
}
function statusStyle(status: string, grade?: string) {
  return { borderColor: statusColor(status, grade) };
}
function ratingLabel(r: string) {
  return r === 'commercial' ? 'Commercial' : r === 'instrument' ? 'Instrument' : 'Private';
}
function modeLabel(m: string) {
  return (
    { linear: 'Linear', cross_acs: 'Cross-ACS', weak_areas: 'Weak areas', quick_drill: 'Quick drill', scenario: 'Mock checkride' }[m] ??
    m
  );
}
function fmtDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
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
  statsRow: { flexDirection: 'row', gap: space[3] },
  coverageNote: { fontFamily: font.mono, fontSize: fontSize.xs, color: colors.dim, marginTop: space[2] },
  empty: { fontFamily: font.sans, fontSize: fontSize.sm, color: colors.dim, marginTop: space[3], lineHeight: 20 },
  row: { marginTop: space[4] },
  rowHead: { flexDirection: 'row', alignItems: 'center', marginBottom: space[2], gap: space[2] },
  name: { flex: 1, fontFamily: font.sans, fontSize: fontSize.sm, color: colors.text },
  pct: { fontFamily: font.mono, fontSize: fontSize.xs, color: colors.muted },
  track: { height: 6, borderRadius: 3, backgroundColor: colors.elevated, overflow: 'hidden' },
  fill: { height: 6, borderRadius: 3 },
  sessionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[3],
    paddingVertical: space[3],
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  sessionTitle: { fontFamily: font.sansMedium, fontSize: fontSize.sm, color: colors.text },
  sessionMeta: { fontFamily: font.mono, fontSize: fontSize.xs, color: colors.dim, marginTop: 2 },
  statusChip: { borderWidth: 1, borderRadius: radius.sm, paddingHorizontal: space[2], paddingVertical: 2 },
  statusText: { fontFamily: font.mono, fontSize: 10, letterSpacing: 1 },
});
