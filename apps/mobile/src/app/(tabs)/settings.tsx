import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { Card, H1, MicroLabel, Screen } from '@/components/cockpit';
import { ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { deleteAccount, getTier, planLabel } from '@/lib/endpoints';
import { supabase } from '@/lib/supabase';
import { useAsync } from '@/lib/use-async';
import { colors, font, fontSize, radius, space } from '@/theme/tokens';

export default function SettingsScreen() {
  const { session } = useAuth();
  const { data: tier, loading } = useAsync(getTier);

  const [confirming, setConfirming] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const email = session?.user?.email ?? '—';

  async function signOut() {
    await supabase.auth.signOut();
    // root gate redirects to /login on the auth-state change
  }

  async function confirmDelete() {
    if (confirmText !== 'DELETE' || busy) return;
    setBusy(true);
    setErr(null);
    try {
      await deleteAccount();
      await supabase.auth.signOut();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : (e as Error)?.message ?? 'Deletion failed');
      setBusy(false);
    }
  }

  return (
    <Screen scroll>
      <MicroLabel>SETTINGS</MicroLabel>
      <H1>Account</H1>

      <Section title="ACCOUNT">
        <Row label="Email" value={email} />
        <Row label="Plan" value={loading ? '…' : tier ? planLabel(tier.tier) : '—'} last />
      </Section>

      <Section title="EXAM">
        <Row label="Examiner voice" value={voiceLabel(tier?.preferredVoice, tier?.voiceEnabled)} />
        <Row label="Examiner style" value={titleCase(tier?.examinerProfile) ?? 'Standard'} />
        <Row label="Theme" value={titleCase(tier?.preferredTheme) ?? 'Flight deck'} last />
      </Section>

      <Section title="SUBSCRIPTION">
        <Row
          label="Manage subscription"
          value={tier?.tier === 'dpe_live' ? 'Active' : 'Trial'}
          last
        />
      </Section>
      <Text style={styles.note}>
        Manage or cancel your subscription from the App Store account settings.
      </Text>

      <View style={{ marginTop: space[5] }}>
        <MicroLabel color={colors.red}>DANGER ZONE</MicroLabel>
        <Card style={styles.card}>
          <Pressable onPress={signOut} style={[styles.row, styles.rowBorder]}>
            <Text style={styles.rowLabel}>Sign out</Text>
            <Text style={styles.chevron}>›</Text>
          </Pressable>

          {!confirming ? (
            <Pressable onPress={() => setConfirming(true)} style={styles.row}>
              <Text style={[styles.rowLabel, styles.danger]}>Delete account</Text>
              <Text style={[styles.chevron, styles.danger]}>›</Text>
            </Pressable>
          ) : (
            <View style={styles.confirmBox}>
              <Text style={styles.confirmTitle}>This permanently deletes your account and all exam data.</Text>
              <Text style={styles.confirmHint}>Type DELETE to confirm.</Text>
              <TextInput
                value={confirmText}
                onChangeText={setConfirmText}
                placeholder="DELETE"
                placeholderTextColor={colors.dim}
                autoCapitalize="characters"
                autoCorrect={false}
                editable={!busy}
                style={styles.input}
              />
              {err ? <Text style={styles.errText}>{err}</Text> : null}
              <View style={styles.confirmActions}>
                <Pressable
                  onPress={() => {
                    setConfirming(false);
                    setConfirmText('');
                    setErr(null);
                  }}
                  disabled={busy}
                  style={styles.cancelBtn}>
                  <Text style={styles.cancelText}>Cancel</Text>
                </Pressable>
                <Pressable
                  onPress={confirmDelete}
                  disabled={confirmText !== 'DELETE' || busy}
                  style={[styles.deleteBtn, (confirmText !== 'DELETE' || busy) && { opacity: 0.4 }]}>
                  {busy ? (
                    <ActivityIndicator color={colors.bg} size="small" />
                  ) : (
                    <Text style={styles.deleteText}>Delete forever</Text>
                  )}
                </Pressable>
              </View>
            </View>
          )}
        </Card>
      </View>
    </Screen>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={{ marginTop: space[4] }}>
      <MicroLabel color={colors.cyanReadable}>{title}</MicroLabel>
      <Card style={styles.card}>{children}</Card>
    </View>
  );
}

function Row({ label, value, last }: { label: string; value?: string; last?: boolean }) {
  return (
    <View style={[styles.row, !last && styles.rowBorder]}>
      <Text style={styles.rowLabel}>{label}</Text>
      {value ? (
        <Text style={styles.rowValue} numberOfLines={1}>
          {value}
        </Text>
      ) : null}
    </View>
  );
}

function voiceLabel(voice?: string | null, enabled?: boolean) {
  if (enabled === false) return 'Off';
  return titleCase(voice) ?? 'Aura-2';
}
function titleCase(s?: string | null): string | undefined {
  if (!s) return undefined;
  return s.replace(/[_-]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

const styles = StyleSheet.create({
  card: { paddingVertical: space[1], paddingHorizontal: space[4] },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 48, gap: space[3] },
  rowBorder: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  rowLabel: { fontFamily: font.sans, fontSize: fontSize.base, color: colors.text },
  rowValue: { flexShrink: 1, fontFamily: font.mono, fontSize: fontSize.sm, color: colors.muted },
  chevron: { fontFamily: font.sans, fontSize: fontSize.xl, color: colors.dim },
  danger: { color: colors.red },
  note: { fontFamily: font.sans, fontSize: fontSize.xs, color: colors.dim, marginTop: space[2], lineHeight: 18 },
  confirmBox: { paddingVertical: space[4], gap: space[2] },
  confirmTitle: { fontFamily: font.sansMedium, fontSize: fontSize.sm, color: colors.text, lineHeight: 20 },
  confirmHint: { fontFamily: font.mono, fontSize: fontSize.xs, color: colors.dim },
  input: {
    marginTop: space[1],
    minHeight: 44,
    fontFamily: font.mono,
    fontSize: fontSize.base,
    color: colors.text,
    letterSpacing: 2,
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: space[3],
  },
  errText: { fontFamily: font.sans, fontSize: fontSize.xs, color: colors.red },
  confirmActions: { flexDirection: 'row', gap: space[2], marginTop: space[2] },
  cancelBtn: {
    flex: 1,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cancelText: { fontFamily: font.sansMedium, fontSize: fontSize.sm, color: colors.muted },
  deleteBtn: {
    flex: 1,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
    backgroundColor: colors.red,
  },
  deleteText: { fontFamily: font.sansSemibold, fontSize: fontSize.sm, color: colors.bg },
});
