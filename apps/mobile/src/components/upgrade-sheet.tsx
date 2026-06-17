import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, font, fontSize, radius, space } from '@/theme/tokens';

/** Server reason codes (session create 403 + exam 429) that mean "upgrade to continue". */
export const UPGRADE_CODES = new Set([
  'trial_limit_reached',
  'trial_expired',
  'resubscribe_required',
  'session_expired',
  'quota_exceeded',
  'daily_cap_reached',
]);

const COPY: Record<string, { title: string; body: string }> = {
  trial_limit_reached: {
    title: 'Trial limit reached',
    body: "You've used all 3 free practice exams. Upgrade for unlimited checkride prep — full orals, every rating, voice and all.",
  },
  trial_expired: {
    title: 'Your free trial ended',
    body: 'The 7-day trial is over. Upgrade to keep practicing with unlimited exams and full ACS coverage.',
  },
  resubscribe_required: {
    title: 'Subscription ended',
    body: 'Resubscribe to pick your checkride prep back up right where you left off.',
  },
  session_expired: {
    title: 'Trial window closed',
    body: 'Your free trial window has closed. Upgrade to finish this exam and keep going.',
  },
  quota_exceeded: {
    title: "Today's limit reached",
    body: "You've hit today's exam limit. It resets tomorrow — or upgrade for more headroom.",
  },
  daily_cap_reached: {
    title: "Today's limit reached",
    body: "You've hit today's exam limit. It resets tomorrow — or upgrade for more headroom.",
  },
};

/**
 * Trial/quota paywall overlay. Render-only for the simulator milestone — the
 * actual purchase (RevenueCat IAP) lands with the App Store build (M4 wall), so
 * the CTA explains where upgrading will live rather than charging.
 */
export function UpgradeSheet({ reason, onDismiss }: { reason: string; onDismiss: () => void }) {
  const copy = COPY[reason] ?? {
    title: 'Upgrade to continue',
    body: 'Upgrade for unlimited checkride practice.',
  };
  return (
    <View style={styles.backdrop}>
      <View style={styles.sheet}>
        <Text style={styles.kicker}>// HEYDPE PRO</Text>
        <Text style={styles.title}>{copy.title}</Text>
        <Text style={styles.body}>{copy.body}</Text>

        <View style={styles.bullets}>
          {['Unlimited oral exams', 'Private, Commercial & Instrument', 'Voice examiner + ACS scoring'].map((b) => (
            <View key={b} style={styles.bulletRow}>
              <Text style={styles.check}>✓</Text>
              <Text style={styles.bulletText}>{b}</Text>
            </View>
          ))}
        </View>

        <View style={styles.cta}>
          <Text style={styles.ctaText}>Upgrade in the App Store</Text>
        </View>
        <Text style={styles.ctaNote}>In-app subscriptions unlock with the App Store release.</Text>

        <Pressable onPress={onDismiss} style={styles.dismiss} accessibilityRole="button">
          <Text style={styles.dismissText}>Not now</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(4,7,11,0.86)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: space[5],
    zIndex: 50,
  },
  sheet: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: colors.bezel,
    borderWidth: 1,
    borderColor: colors.amberDim,
    borderRadius: radius.xl,
    padding: space[5],
  },
  kicker: { fontFamily: font.mono, fontSize: fontSize.micro, letterSpacing: 3, color: colors.amber, marginBottom: space[2] },
  title: { fontFamily: font.sansBold, fontSize: fontSize.h2, color: colors.text, letterSpacing: -0.3, marginBottom: space[2] },
  body: { fontFamily: font.sans, fontSize: fontSize.base, lineHeight: 23, color: colors.muted, marginBottom: space[4] },
  bullets: { gap: space[2], marginBottom: space[5] },
  bulletRow: { flexDirection: 'row', alignItems: 'center', gap: space[3] },
  check: { fontFamily: font.sansBold, fontSize: fontSize.base, color: colors.greenReadable },
  bulletText: { fontFamily: font.sans, fontSize: fontSize.sm, color: colors.text },
  cta: {
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.amber,
    borderRadius: radius.md,
  },
  ctaText: { fontFamily: font.sansSemibold, fontSize: 15, color: colors.bg },
  ctaNote: { fontFamily: font.sans, fontSize: fontSize.xs, color: colors.dim, textAlign: 'center', marginTop: space[2] },
  dismiss: { minHeight: 44, alignItems: 'center', justifyContent: 'center', marginTop: space[2] },
  dismissText: { fontFamily: font.sansMedium, fontSize: fontSize.sm, color: colors.muted },
});
