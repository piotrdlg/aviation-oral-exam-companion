import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ApiError } from '@/lib/api';
import { recoverExamOperation } from '@/lib/exam-operation';
import { track } from '@/lib/analytics';
import { getTier, recordConsent, skipOnboarding, updateTier } from '@/lib/endpoints';
import { AircraftClass, ExamConfig, Rating, createSession, startExam } from '@/lib/exam';
import { useOnboardingGate } from '@/lib/onboarding-gate';
import { colors, font, fontSize, radius, space } from '@/theme/tokens';

// ── Static option tables (mirror OnboardingWizard.tsx) ──────────────────────
const RATINGS: { key: Rating; label: string; abbr: string; desc: string }[] = [
  { key: 'private', label: 'Private Pilot', abbr: 'PPL', desc: 'Your first certificate' },
  { key: 'commercial', label: 'Commercial Pilot', abbr: 'CPL', desc: 'Fly for compensation' },
  { key: 'instrument', label: 'Instrument Rating', abbr: 'IR', desc: 'Fly in the clouds' },
];

const CLASSES: { key: AircraftClass; label: string; desc: string }[] = [
  { key: 'ASEL', label: 'ASEL', desc: 'Single-Engine Land' },
  { key: 'AMEL', label: 'AMEL', desc: 'Multi-Engine Land' },
  { key: 'ASES', label: 'ASES', desc: 'Single-Engine Sea' },
  { key: 'AMES', label: 'AMES', desc: 'Multi-Engine Sea' },
];

const THEMES: { key: string; label: string; swatch: string }[] = [
  { key: 'cockpit', label: 'Flight deck', swatch: colors.amber },
  { key: 'glass', label: 'Glass', swatch: colors.cyan },
  { key: 'sectional', label: 'Sectional', swatch: colors.green },
  { key: 'briefing', label: 'Briefing', swatch: colors.muted },
];

const RATING_LABELS: Record<string, string> = {
  private: 'Private Pilot',
  commercial: 'Commercial Pilot',
  instrument: 'Instrument Rating',
};

type Phase = 'loading' | 'wizard' | 'ai_consent' | 'disclaimer' | 'starting' | 'error';
const TOTAL_STEPS = 6;

export default function Onboarding() {
  const router = useRouter();
  const { setOnboarded } = useOnboardingGate();

  const [phase, setPhase] = useState<Phase>('loading');
  const [step, setStep] = useState(1);

  // Preferences (defaults backfilled from tier on mount).
  const [rating, setRating] = useState<Rating>('private');
  const [aircraftClass, setAircraftClass] = useState<AircraftClass>('ASEL');
  const [aircraftType, setAircraftType] = useState('');
  const [homeAirport, setHomeAirport] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [theme, setTheme] = useState('cockpit');

  // Consent-already-given flags (skip the matching gate).
  const aiConsented = useRef(false);
  const disclaimerAcked = useRef(false);

  // Handoff idempotency: a retry after a partial handoff must not re-create the
  // session (a 2nd create would be counted) nor re-start the exam.
  const createdSessionId = useRef<string | null>(null);
  const examStarted = useRef(false);
  const handoffInFlight = useRef(false);
  const destination = useRef<'exam' | 'explore' | 'config'>('exam');

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const showClassPicker = rating === 'private' || rating === 'commercial';

  useEffect(() => {
    (async () => {
      try {
        const t = await getTier();
        setRating(t.preferredRating);
        setAircraftClass((t.preferredAircraftClass || 'ASEL') as AircraftClass);
        setTheme(t.preferredTheme || 'cockpit');
        if (t.displayName) setDisplayName(t.displayName);
        if (t.aircraftType) setAircraftType(t.aircraftType);
        if (t.homeAirport) setHomeAirport(t.homeAirport);
        aiConsented.current = t.aiDataConsented;
        disclaimerAcked.current = t.disclaimerAcknowledged;
      } catch {
        /* defaults are fine */
      }
      setPhase('wizard');
      track('onboarding_step_viewed', { step: 1 });
    })();
  }, []);

  function goStep(n: number) {
    setStep(n);
    track('onboarding_step_viewed', { step: n });
  }

  function prefsPayload(complete: boolean) {
    return {
      preferredRating: rating,
      preferredAircraftClass: aircraftClass,
      aircraftType: aircraftType.trim() || null,
      homeAirport: homeAirport.trim() || null,
      preferredTheme: theme,
      displayName: displayName.trim() || null,
      voiceEnabled: false, // M2: type-only, no mic
      onboardingCompleted: complete,
    };
  }

  // ── Terminal paths ────────────────────────────────────────────────────────
  async function onSkip() {
    requestExit('config');
  }

  async function onExplore() {
    requestExit('explore');
  }

  function requestExit(path: 'exam' | 'explore' | 'config') {
    if (busy || handoffInFlight.current) return;
    destination.current = path;
    if (!aiConsented.current) return setPhase('ai_consent');
    if (!disclaimerAcked.current) return setPhase('disclaimer');
    void finishChosenPath();
  }

  async function finishChosenPath() {
    if (destination.current === 'exam') return handoff();
    if (handoffInFlight.current) return;
    handoffInFlight.current = true;
    setBusy(true);
    setError(null);
    try {
      if (destination.current === 'config') await skipOnboarding();
      else await updateTier(prefsPayload(true));
      track('onboarding_completed', { path: destination.current, rating });
      setOnboarded();
      router.replace(destination.current === 'config' ? '/(tabs)/practice' : '/(tabs)');
    } catch {
      setError('Could not save your preferences. Please try again.');
    } finally {
      handoffInFlight.current = false;
      setBusy(false);
    }
  }

  // "Start exam now" → consent gates → handoff. We record consents and create the
  // (free, uncounted) onboarding exam BEFORE marking onboarding complete: the
  // server computes is_onboarding = !onboarding_completed && noPriorOnboardingExam,
  // so completing first would make the exam count against the 3-exam trial.
  function onStartExam() {
    requestExit('exam');
  }

  async function acceptAiConsent() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await recordConsent('ai_data_processing', { third_party_ai_v1: true });
      aiConsented.current = true;
      track('onboarding_ai_consent_accepted', { choices: 'third_party_ai_v1' });
      setBusy(false);
      if (!disclaimerAcked.current) return setPhase('disclaimer');
      void finishChosenPath();
    } catch {
      setBusy(false);
      setError('Could not save your consent. Please try again.');
      track('onboarding_error', { stage: 'ai_consent', status: 'persist_failed' });
    }
  }

  async function acceptDisclaimer() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await recordConsent('disclaimer', { faa_disclaimer_v1: true });
      disclaimerAcked.current = true;
      track('onboarding_consent_accepted', {});
      setBusy(false); // handoff drives its own 'starting' phase from here
      void finishChosenPath();
    } catch {
      setBusy(false);
      setError('Could not save your consent. Please try again.');
      track('onboarding_error', { stage: 'consent', status: 'persist_failed' });
    }
  }

  // Idempotent: each step guards on a ref so a retry after a partial failure
  // resumes (never re-creates the session — a 2nd create would be COUNTED — and
  // never re-starts the exam). onboarding_completed is the gate, so updateTier is
  // required-with-retry: we don't navigate until it persists, else the user would
  // re-onboard and mint a second (counted) exam.
  async function handoff() {
    if (handoffInFlight.current) return;
    handoffInFlight.current = true;
    setPhase('starting');
    setBusy(false);
    setError(null);
    const cfg: ExamConfig = {
      studyMode: 'linear',
      difficulty: 'easy',
      rating,
      aircraftClass,
      selectedAreas: [],
      selectedTasks: [],
    };
    try {
      if (!createdSessionId.current) {
        const created = await createSession(cfg, true); // is_onboarding (uncounted)
        createdSessionId.current = created.id;
      }
      if (!examStarted.current) {
        // A timeout may have committed start. Read its durable receipt first.
        const recovered = await recoverExamOperation(createdSessionId.current);
        if (!recovered) await startExam(createdSessionId.current, cfg);
        examStarted.current = true;
      }
      await completeOnboarding(); // updateTier with retry — throws if it can't persist
      track('onboarding_completed', {
        rating,
        aircraftClass,
        voiceEnabled: false,
        theme,
        hasDisplayName: !!displayName.trim(),
        path: 'start',
      });
      setOnboarded();
      router.replace('/(tabs)/practice'); // Practice auto-resumes the new exam
    } catch (e) {
      track('onboarding_error', {
        stage: 'start',
        status: e instanceof ApiError ? String(e.status) : 'unknown',
      });
      setError(
        e instanceof ApiError && e.code === 'trial_limit_reached'
          ? 'Your trial exams are used up. Continue to the app to upgrade.'
          : "We couldn't start your exam. Please try again."
      );
      setPhase('error');
    } finally {
      handoffInFlight.current = false;
    }
  }

  async function completeOnboarding() {
    let lastErr: unknown;
    for (let i = 0; i < 3; i++) {
      try {
        await updateTier(prefsPayload(true));
        return;
      } catch (e) {
        lastErr = e;
        track('onboarding_error', { stage: 'tier', status: 'post_start' });
        await new Promise((r) => setTimeout(r, 400 * (i + 1)));
      }
    }
    throw lastErr ?? new Error('onboarding_complete_failed');
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  if (phase === 'loading' || phase === 'starting') {
    return (
      <SafeAreaView style={styles.root}>
        <View style={styles.center}>
          <ActivityIndicator color={colors.amber} />
          {phase === 'starting' ? <Text style={styles.startingText}>Starting your exam…</Text> : null}
        </View>
      </SafeAreaView>
    );
  }

  if (phase === 'ai_consent') {
    return (
      <ConsentGate
        kicker="HOW YOUR EXAM WORKS"
        title="Before we begin"
        body="Your answers and transcripts are sent to third-party AI providers to run the exam — Anthropic (your AI examiner), Deepgram (speech-to-text and text-to-speech), and OpenAI (backup text-to-speech). We don't store raw audio; only transcripts are kept."
        processors={['Anthropic', 'Deepgram', 'OpenAI']}
        primaryLabel="I consent — continue"
        busy={busy}
        error={error}
        onPrimary={acceptAiConsent}
        onCancel={() => {
          setError(null);
          setPhase('wizard');
          setStep(TOTAL_STEPS);
        }}
      />
    );
  }

  if (phase === 'disclaimer') {
    return (
      <ConsentGate
        kicker="BEFORE YOUR FIRST EXAM"
        title="A quick heads-up"
        bullets={[
          'HeyDPE is a study aid — not an FAA-approved testing device, and not affiliated with the FAA.',
          'The AI examiner can make mistakes. Always verify answers against the current FARs, AIM, and ACS.',
          'It is not a substitute for instruction from a certificated flight instructor, or for an actual DPE checkride.',
        ]}
        primaryLabel="I understand — begin"
        busy={busy}
        error={error}
        onPrimary={acceptDisclaimer}
        onCancel={() => {
          setError(null);
          setPhase('wizard');
          setStep(TOTAL_STEPS);
        }}
      />
    );
  }

  if (phase === 'error') {
    return (
      <SafeAreaView style={styles.root}>
        <View style={styles.center}>
          <Text style={styles.errTitle}>Couldn&apos;t start</Text>
          <Text style={styles.errMsg}>{error}</Text>
          <Pressable onPress={() => void handoff()} style={styles.primaryBtn}>
            <Text style={styles.primaryText}>Retry</Text>
          </Pressable>
          <Pressable onPress={() => { setPhase('wizard'); setStep(TOTAL_STEPS); }} style={styles.linkBtn}>
            <Text style={styles.linkText}>Back</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  // wizard
  return (
    <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.topBar}>
          <Dots total={TOTAL_STEPS} current={step} />
          <Pressable onPress={onSkip} hitSlop={8}>
            <Text style={styles.skip}>Full config →</Text>
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          {step === 1 && (
            <Step title="What are you preparing for?" sub="Select your certificate or rating">
              {RATINGS.map((r) => (
                <SelectCard
                  key={r.key}
                  selected={rating === r.key}
                  onPress={() => setRating(r.key)}
                  title={r.label}
                  desc={r.desc}
                  badge={r.abbr}
                />
              ))}
            </Step>
          )}

          {step === 2 && (
            <Step title="Tell us about your aircraft" sub="This helps personalize your exam">
              {showClassPicker ? (
                <>
                  <MicroLabel>CLASS</MicroLabel>
                  {CLASSES.map((c) => (
                    <SelectCard
                      key={c.key}
                      selected={aircraftClass === c.key}
                      onPress={() => setAircraftClass(c.key)}
                      title={c.label}
                      desc={c.desc}
                    />
                  ))}
                </>
              ) : (
                <View style={styles.readonlyChip}>
                  <Text style={styles.readonlyChipText}>Instrument Rating — Airplane</Text>
                </View>
              )}
              <View style={{ height: space[4] }} />
              <MicroLabel>AIRCRAFT TYPE (OPTIONAL)</MicroLabel>
              <TextInput
                value={aircraftType}
                onChangeText={(t) => setAircraftType(t.slice(0, 100))}
                placeholder="e.g. Cessna 172"
                placeholderTextColor={colors.dim}
                style={styles.input}
              />
              <View style={{ height: space[3] }} />
              <MicroLabel>HOME AIRPORT (OPTIONAL)</MicroLabel>
              <TextInput
                value={homeAirport}
                onChangeText={(t) => setHomeAirport(t.toUpperCase().slice(0, 10))}
                placeholder="e.g. KJAX"
                placeholderTextColor={colors.dim}
                autoCapitalize="characters"
                autoCorrect={false}
                style={styles.input}
              />
            </Step>
          )}

          {step === 3 && (
            <Step
              title="What should we call you?"
              sub="Your examiner will address you by name during exams">
              <TextInput
                value={displayName}
                onChangeText={(t) => setDisplayName(t.slice(0, 50))}
                placeholder="First name"
                placeholderTextColor={colors.dim}
                autoFocus
                returnKeyType="done"
                style={[styles.input, styles.inputCentered]}
              />
              <Text style={styles.helper}>Optional — you can change this in settings.</Text>
            </Step>
          )}

          {step === 4 && (
            <Step title="Customize your cockpit" sub="Choose your instrument panel aesthetic">
              <View style={styles.themeGrid}>
                {THEMES.map((t) => (
                  <Pressable
                    key={t.key}
                    onPress={() => setTheme(t.key)}
                    style={[styles.themeCard, theme === t.key && styles.themeCardActive]}>
                    <View style={[styles.swatch, { backgroundColor: t.swatch }]} />
                    <Text style={[styles.themeLabel, theme === t.key && styles.themeLabelActive]}>
                      {t.label}
                    </Text>
                  </Pressable>
                ))}
              </View>
              <Text style={styles.helper}>More themes arrive in a later update — your pick is saved.</Text>
            </Step>
          )}

          {step === 5 && (
            <Step title="Your free trial" sub="7 days or 3 exams — no credit card required">
              <InfoWell label="WHAT'S INCLUDED">
                <Bullet>1 onboarding exam — pre-configured, starts right away (doesn&apos;t count toward your trial)</Bullet>
                <Bullet>3 practice exams — full control over study mode, difficulty, and focus areas</Bullet>
                <Bullet>FAA source references and ACS scoring — everything included</Bullet>
              </InfoWell>
              <InfoWell label="WHAT IS AN EXAM?">
                <Text style={styles.wellBody}>
                  An exam is one practice session with your AI examiner. You choose the rating, study
                  mode, and difficulty. The examiner asks questions, assesses your answers, and grades
                  your performance. Pause and resume any exam while your trial is active.
                </Text>
              </InfoWell>
              <InfoWell label="AFTER THE TRIAL">
                <Text style={styles.wellBody}>
                  When your trial ends — after 7 days or once you&apos;ve used your 3 exams — subscribe
                  to continue with unlimited exams. Plans start at{' '}
                  <Text style={styles.price}>$39/month</Text>, billed when you subscribe. No card needed
                  until then.
                </Text>
              </InfoWell>
            </Step>
          )}

          {step === 6 && (
            <Step title="Your first exam" sub="We've pre-configured this one so you can jump right in">
              <InfoWell label="SUMMARY">
                <SummaryRow label="Rating" value={RATING_LABELS[rating]} accent={colors.greenReadable} />
                {showClassPicker ? (
                  <SummaryRow label="Class" value={aircraftClass} accent={colors.cyanReadable} />
                ) : null}
                <SummaryRow label="Study mode" value="Area by area (linear)" />
                <SummaryRow label="Difficulty" value="Easy" />
                <SummaryRow label="Coverage" value="All ACS areas" />
                {aircraftType.trim() || homeAirport.trim() ? (
                  <SummaryRow
                    label="Aircraft"
                    value={[aircraftType.trim(), homeAirport.trim()].filter(Boolean).join(' / ')}
                  />
                ) : null}
              </InfoWell>
              <View style={styles.freeBadge}>
                <Text style={styles.freeBadgeText}>
                  ✓ Onboarding exam — free, doesn&apos;t count toward your 3 trial exams
                </Text>
              </View>
            </Step>
          )}
        </ScrollView>

        {/* Button row */}
        <View style={styles.buttonRow}>
          {step > 1 ? (
            <Pressable onPress={() => goStep(step - 1)} style={styles.backBtn} hitSlop={6}>
              <Text style={styles.backText}>← Back</Text>
            </Pressable>
          ) : (
            <View style={{ flex: 1 }} />
          )}

          {step < TOTAL_STEPS ? (
            <Pressable onPress={() => goStep(step + 1)} style={styles.primaryBtn}>
              <Text style={styles.primaryText}>{step === 3 && !displayName.trim() ? 'Skip' : 'Next'}</Text>
            </Pressable>
          ) : (
            <View style={styles.finalCol}>
              <Pressable onPress={onStartExam} style={styles.primaryBtn} disabled={busy}>
                <Text style={styles.primaryText}>Start exam now</Text>
              </Pressable>
              <Pressable onPress={onExplore} style={styles.secondaryBtn} disabled={busy}>
                <Text style={styles.secondaryText}>Explore first</Text>
              </Pressable>
            </View>
          )}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// ── Subcomponents ────────────────────────────────────────────────────────────
function Dots({ total, current }: { total: number; current: number }) {
  return (
    <View style={styles.dots} accessibilityLabel={`Step ${current} of ${total}`}>
      {Array.from({ length: total }, (_, i) => {
        const n = i + 1;
        const c = n === current ? colors.amber : n < current ? colors.amberDim : colors.border;
        return <View key={n} style={[styles.dot, { backgroundColor: c }]} />;
      })}
    </View>
  );
}

function Step({ title, sub, children }: { title: string; sub: string; children: React.ReactNode }) {
  return (
    <View style={styles.card}>
      <Text style={styles.h2}>{title}</Text>
      <Text style={styles.sub}>{sub}</Text>
      {children}
    </View>
  );
}

function MicroLabel({ children }: { children: React.ReactNode }) {
  return <Text style={styles.micro}>{`// ${children}`}</Text>;
}

function SelectCard({
  selected,
  onPress,
  title,
  desc,
  badge,
}: {
  selected: boolean;
  onPress: () => void;
  title: string;
  desc: string;
  badge?: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      style={[styles.selectCard, selected && styles.selectCardActive]}>
      <View style={{ flex: 1 }}>
        <Text style={[styles.selectTitle, selected && { color: colors.amberBright }]}>{title}</Text>
        <Text style={styles.selectDesc}>{desc}</Text>
      </View>
      {badge ? <Text style={styles.selectBadge}>{badge}</Text> : null}
    </Pressable>
  );
}

function InfoWell({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={styles.well}>
      <MicroLabel>{label}</MicroLabel>
      {children}
    </View>
  );
}

function Bullet({ children }: { children: React.ReactNode }) {
  return (
    <View style={styles.bulletRow}>
      <Text style={styles.bulletCheck}>✓</Text>
      <Text style={styles.bulletText}>{children}</Text>
    </View>
  );
}

function SummaryRow({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <View style={styles.summaryRow}>
      <Text style={styles.summaryLabel}>{label}</Text>
      <Text style={[styles.summaryValue, accent ? { color: accent } : null]} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

function ConsentGate({
  kicker,
  title,
  body,
  bullets,
  processors,
  primaryLabel,
  busy,
  error,
  onPrimary,
  onCancel,
}: {
  kicker: string;
  title: string;
  body?: string;
  bullets?: string[];
  processors?: string[];
  primaryLabel: string;
  busy: boolean;
  error: string | null;
  onPrimary: () => void;
  onCancel: () => void;
}) {
  return (
    <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={styles.consentScroll}>
        <Text style={styles.consentKicker}>{`// ${kicker}`}</Text>
        <Text style={styles.consentTitle}>{title}</Text>
        {body ? <Text style={styles.consentBody}>{body}</Text> : null}
        {processors ? (
          <View style={styles.processorRow}>
            {processors.map((p) => (
              <View key={p} style={styles.processorChip}>
                <Text style={styles.processorText}>{p}</Text>
              </View>
            ))}
          </View>
        ) : null}
        {bullets
          ? bullets.map((b, i) => (
              <View key={i} style={styles.consentBulletRow}>
                <Text style={styles.consentBulletDot}>•</Text>
                <Text style={styles.consentBulletText}>{b}</Text>
              </View>
            ))
          : null}
        {error ? <Text style={styles.consentError}>{error}</Text> : null}
      </ScrollView>
      <View style={styles.consentActions}>
        <Pressable onPress={onPrimary} style={styles.primaryBtn} disabled={busy}>
          {busy ? <ActivityIndicator color={colors.bg} size="small" /> : <Text style={styles.primaryText}>{primaryLabel}</Text>}
        </Pressable>
        <Pressable onPress={onCancel} style={styles.linkBtn} disabled={busy}>
          <Text style={styles.linkText}>Cancel</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: space[3], padding: space[5] },
  startingText: { fontFamily: font.mono, fontSize: fontSize.sm, color: colors.muted },
  errTitle: { fontFamily: font.sansBold, fontSize: fontSize.xl, color: colors.text },
  errMsg: { fontFamily: font.sans, fontSize: fontSize.sm, color: colors.dim, textAlign: 'center', lineHeight: 20 },

  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space[5],
    paddingTop: space[3],
    paddingBottom: space[2],
  },
  dots: { flexDirection: 'row', gap: space[2] },
  dot: { width: 8, height: 8, borderRadius: 4 },
  skip: { fontFamily: font.sansMedium, fontSize: fontSize.sm, color: colors.amber },

  scroll: { paddingHorizontal: space[4], paddingBottom: space[5] },
  card: { backgroundColor: colors.bezel, borderWidth: 1, borderColor: colors.border, borderRadius: radius.xl, padding: space[5] },
  h2: { fontFamily: font.sansBold, fontSize: fontSize.h2, color: colors.text, letterSpacing: -0.3, textAlign: 'center', marginBottom: space[2] },
  sub: { fontFamily: font.sans, fontSize: fontSize.base, color: colors.muted, textAlign: 'center', marginBottom: space[5], lineHeight: 22 },
  micro: { fontFamily: font.mono, fontSize: fontSize.micro, letterSpacing: 2, color: colors.cyanReadable, marginBottom: space[2], marginTop: space[2] },

  selectCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[3],
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: space[4],
    marginBottom: space[2],
    minHeight: 48,
  },
  selectCardActive: { borderColor: colors.amber, backgroundColor: colors.amberLo },
  selectTitle: { fontFamily: font.sansSemibold, fontSize: fontSize.base, color: colors.text },
  selectDesc: { fontFamily: font.sans, fontSize: fontSize.xs, color: colors.dim, marginTop: 2 },
  selectBadge: { fontFamily: font.mono, fontSize: fontSize.xs, letterSpacing: 1, color: colors.muted },

  readonlyChip: { backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, padding: space[4] },
  readonlyChipText: { fontFamily: font.sans, fontSize: fontSize.base, color: colors.text },

  input: {
    minHeight: 48,
    fontFamily: font.sans,
    fontSize: fontSize.base,
    color: colors.text,
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: space[3],
  },
  inputCentered: { textAlign: 'center' },
  helper: { fontFamily: font.sans, fontSize: fontSize.xs, color: colors.dim, marginTop: space[3], textAlign: 'center' },

  themeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: space[3] },
  themeCard: {
    width: '47%',
    flexGrow: 1,
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: space[4],
    alignItems: 'center',
    gap: space[2],
  },
  themeCardActive: { borderColor: colors.amber, backgroundColor: colors.amberLo },
  swatch: { width: 28, height: 28, borderRadius: 8 },
  themeLabel: { fontFamily: font.sans, fontSize: fontSize.sm, color: colors.muted },
  themeLabelActive: { color: colors.amberBright, fontWeight: '600' },

  well: { backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, padding: space[4], marginBottom: space[3] },
  wellBody: { fontFamily: font.sans, fontSize: fontSize.sm, color: colors.muted, lineHeight: 20 },
  price: { fontFamily: font.monoBold, color: colors.amber },
  bulletRow: { flexDirection: 'row', gap: space[2], marginTop: space[2] },
  bulletCheck: { fontFamily: font.sansBold, fontSize: fontSize.sm, color: colors.greenReadable },
  bulletText: { flex: 1, fontFamily: font.sans, fontSize: fontSize.sm, color: colors.text, lineHeight: 20 },

  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: space[3], paddingVertical: space[2] },
  summaryLabel: { fontFamily: font.mono, fontSize: fontSize.xs, letterSpacing: 1, color: colors.dim },
  summaryValue: { flexShrink: 1, fontFamily: font.sansMedium, fontSize: fontSize.sm, color: colors.text },
  freeBadge: { backgroundColor: colors.greenLo, borderWidth: 1, borderColor: colors.greenDim, borderRadius: radius.md, padding: space[3], marginTop: space[2] },
  freeBadgeText: { fontFamily: font.sans, fontSize: fontSize.xs, color: colors.greenReadable, lineHeight: 18 },

  buttonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[3],
    paddingHorizontal: space[4],
    paddingTop: space[3],
    paddingBottom: space[2],
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  finalCol: { flex: 1, gap: space[2] },
  backBtn: { minHeight: 48, justifyContent: 'center', paddingHorizontal: space[2] },
  backText: { fontFamily: font.sansMedium, fontSize: fontSize.sm, color: colors.dim },
  primaryBtn: { flex: 1, minHeight: 48, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.amber, borderRadius: radius.md, paddingHorizontal: space[5] },
  primaryText: { fontFamily: font.sansSemibold, fontSize: 15, color: colors.bg },
  secondaryBtn: { flex: 1, minHeight: 48, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bezel, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md },
  secondaryText: { fontFamily: font.sansMedium, fontSize: fontSize.sm, color: colors.text },
  linkBtn: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  linkText: { fontFamily: font.sansMedium, fontSize: fontSize.sm, color: colors.muted },

  // consent gates
  consentScroll: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: space[5], paddingVertical: space[6] },
  consentKicker: { fontFamily: font.mono, fontSize: fontSize.micro, letterSpacing: 3, color: colors.amber, marginBottom: space[3] },
  consentTitle: { fontFamily: font.sansBold, fontSize: fontSize.h1, color: colors.text, letterSpacing: -0.5, marginBottom: space[4] },
  consentBody: { fontFamily: font.sans, fontSize: fontSize.base, lineHeight: 24, color: colors.muted, marginBottom: space[4] },
  processorRow: { flexDirection: 'row', flexWrap: 'wrap', gap: space[2], marginBottom: space[2] },
  processorChip: { borderWidth: 1, borderColor: colors.cyanDim, borderRadius: radius.sm, paddingHorizontal: space[3], paddingVertical: space[1] },
  processorText: { fontFamily: font.mono, fontSize: fontSize.xs, color: colors.cyanReadable },
  consentBulletRow: { flexDirection: 'row', gap: space[3], marginBottom: space[3] },
  consentBulletDot: { fontFamily: font.sansBold, fontSize: fontSize.base, color: colors.amber },
  consentBulletText: { flex: 1, fontFamily: font.sans, fontSize: fontSize.base, color: colors.text, lineHeight: 23 },
  consentError: { fontFamily: font.sans, fontSize: fontSize.sm, color: colors.red, marginTop: space[3] },
  consentActions: { paddingHorizontal: space[5], paddingBottom: space[3], gap: space[2] },
});
