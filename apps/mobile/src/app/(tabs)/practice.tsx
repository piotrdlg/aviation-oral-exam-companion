import { useEffect, useRef, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Card, H1, Lead, MicroLabel, PrimaryButton, Screen } from '@/components/cockpit';
import { UPGRADE_CODES, UpgradeSheet } from '@/components/upgrade-sheet';
import { useVoiceSession } from '@/hooks/use-voice-session';
import { ExamResults } from '@/components/exam-results';
import { track } from '@/lib/analytics';
import { ApiError } from '@/lib/api';
import { beginVoiceExchange, markExamResponse, markVoiceFinalized } from '@/lib/voice-metrics';
import { completeSession, getResumable, getSessions, getTier, reactivateSession } from '@/lib/endpoints';
import {
  AircraftClass,
  Assessment,
  ExamConfig,
  ExamMessage,
  ExamTurn,
  Rating,
  Score,
  StudyMode,
  createSession,
  getTranscripts,
  nextTask,
  resumeCurrent,
  respond,
  restoreTranscript,
  startExam,
} from '@/lib/exam';
import { colors, font, fontSize, radius, space } from '@/theme/tokens';

type Bubble = { role: 'examiner' | 'student'; text: string; assessment?: Assessment };
type Phase = 'config' | 'loading' | 'active' | 'complete' | 'error';

const RATINGS: { key: Rating; label: string }[] = [
  { key: 'private', label: 'Private' },
  { key: 'commercial', label: 'Commercial' },
  { key: 'instrument', label: 'Instrument' },
];

const MODES: { key: StudyMode; label: string }[] = [
  { key: 'linear', label: 'Linear' },
  { key: 'cross_acs', label: 'Cross-ACS' },
  { key: 'weak_areas', label: 'Weak areas' },
  { key: 'quick_drill', label: 'Quick drill' },
];

type Diff = 'easy' | 'medium' | 'hard' | 'mixed';
const DIFFS: { key: Diff; label: string }[] = [
  { key: 'easy', label: 'Easy' },
  { key: 'medium', label: 'Medium' },
  { key: 'hard', label: 'Hard' },
  { key: 'mixed', label: 'Mixed' },
];

export default function PracticeScreen() {
  const [phase, setPhase] = useState<Phase>('loading');
  const [error, setError] = useState<string | null>(null);
  const [errorStatus, setErrorStatus] = useState(0);
  const [rating, setRating] = useState<Rating>('private');
  const [aircraftClass, setAircraftClass] = useState<AircraftClass>('ASEL');
  const [studyMode, setStudyMode] = useState<StudyMode>('linear');
  const [difficulty, setDifficulty] = useState<Diff>('mixed');

  const [bubbles, setBubbles] = useState<Bubble[]>([]);
  const [answer, setAnswer] = useState('');
  const [busy, setBusy] = useState(false);
  const [upgrade, setUpgrade] = useState<string | null>(null);
  const [voiceOn, setVoiceOn] = useState(false);
  const voiceEnabled = useRef(false);
  const audio = useVoiceSession();
  const controller = audio.controller;
  const stt = { listening: audio.mode === 'listening' && !audio.connecting, connecting: audio.connecting, interim: '', error: audio.error };
  const finalizing = audio.mode === 'finalizing';
  const submitting = useRef(false);
  const pendingAnswer = useRef<string | null>(null);
  const pendingStudentCount = useRef(0);
  const pendingAdvance = useRef(false);
  const responseId = useRef(0);
  const router = useRouter();

  // Opaque, server-owned exam state — passed back unchanged each turn.
  const session = useRef<{
    id: string;
    config: ExamConfig;
    aircraftClass: AircraftClass;
    taskData?: Record<string, unknown>;
    plannerState?: Record<string, unknown>;
    examPlan?: Record<string, unknown>;
    elementCode?: string;
  } | null>(null);

  const scroll = useRef<ScrollView>(null);
  const scrollEnd = () => setTimeout(() => scroll.current?.scrollToEnd({ animated: true }), 60);

  // On mount: resume an in-progress exam if there is one, else show config.
  useEffect(() => {
    (async () => {
      try {
        const tier = await getTier();
        setRating(tier.preferredRating);
        setVoiceOn(tier.voiceEnabled);
        voiceEnabled.current = tier.voiceEnabled;
        const ac = (tier.preferredAircraftClass || 'ASEL') as AircraftClass;
        setAircraftClass(ac);
        const { session: open } = await getResumable();
        if (open) {
          await resumeExam(open.id, open.rating, open.study_mode, (open.aircraft_class || ac) as AircraftClass, open.status, {
            difficulty: open.difficulty_preference ?? 'mixed',
            selectedAreas: open.selected_areas ?? [], selectedTasks: open.selected_tasks ?? [],
            ...open.metadata?.sessionConfig,
          });
        } else {
          setPhase('config');
        }
      } catch (e) {
        fail(e);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function speak(text?: string, source: 'fresh' | 'replay' | 'resume' = 'fresh') {
    if (text && voiceEnabled.current) void controller.enqueue(text, String(responseId.current), source);
  }

  function toggleVoice() {
    const next = !voiceEnabled.current;
    voiceEnabled.current = next;
    setVoiceOn(next);
    if (!next && audio.mode === 'speaking') void controller.abort().catch(() => {});
    if (next && audio.mode !== 'listening' && !finalizing) {
      speak(bubbles.findLast((bubble) => bubble.role === 'examiner')?.text, 'replay');
    }
    track('voice_mode_toggled', { enabled: next });
  }

  useEffect(() => {
    let previous = controller.getSnapshot().draft;
    return controller.subscribe(() => {
      const { draft } = controller.getSnapshot();
      if (draft !== previous) { previous = draft; setAnswer(draft); }
    });
  }, [controller]);

  async function toggleMic() {
    if (submitting.current || finalizing) return;
    if (audio.mode === 'listening') {
      try { setAnswer(await controller.finalize()); } catch { /* Voice error is shown below. */ }
    } else {
      await controller.startListening(answer);
    }
  }

  function fail(e: unknown) {
    void controller.abort().catch(() => {});
    // Trial/quota blocks (403 create, 429 mid-exam) route to the paywall, not an error.
    if (e instanceof ApiError && e.code && UPGRADE_CODES.has(e.code)) {
      setUpgrade(e.code);
      track('paywall_shown', { reason: e.code });
      setBusy(false);
      setPhase((p) => (p === 'active' ? 'active' : 'config'));
      return;
    }
    const status = e instanceof ApiError ? e.status : 0;
    setErrorStatus(status);
    setError(status === 409 ? 'This exam is active on another device. Continue here to reclaim it.'
      : status === 503 ? 'The examiner is temporarily unavailable. Your session is saved.'
        : status === 0 ? 'Could not reach HeyDPE. Check your connection and retry.'
          : e instanceof ApiError ? e.message : (e as Error)?.message ?? 'Something went wrong');
    setPhase('error');
  }

  const toHistory = (bs: Bubble[]): ExamMessage[] => bs.map((b) => ({ role: b.role, text: b.text }));

  function applyOpaque(turn: ExamTurn) {
    const s = session.current;
    if (!s) return;
    if (turn.taskData) s.taskData = turn.taskData;
    if (turn.plannerState) s.plannerState = turn.plannerState;
    if (turn.examPlan) s.examPlan = turn.examPlan;
    if (turn.elementCode) s.elementCode = turn.elementCode;
  }

  async function resumeExam(id: string, r: string, mode: string, ac: AircraftClass, status?: string, stored?: Partial<ExamConfig>) {
    responseId.current++;
    setPhase('loading');
    const cfg: ExamConfig = {
      studyMode: (mode || 'linear') as StudyMode,
      difficulty: 'mixed',
      rating: (r || 'private') as Rating,
      aircraftClass: ac,
      ...stored,
    };
    session.current = { id, config: cfg, aircraftClass: ac };

    // A paused session must be reactivated first, or the first respond/next-task
    // (which require status 'active') 409s straight into the error screen.
    if (status === 'paused') await reactivateSession(id);

    const transcripts = await getTranscripts(id);
    const turn = await resumeCurrent({ sessionId: id, sessionConfig: cfg });
    applyOpaque(turn);
    const restored = restoreTranscript(transcripts, turn.sessionComplete ? undefined : turn.examinerMessage);
    setBubbles(restored);
    setPhase(turn.sessionComplete ? 'complete' : 'active');
    if (turn.sessionComplete) await controller.abort();
    else speak(restored.findLast((bubble) => bubble.role === 'examiner')?.text, 'resume');
    scrollEnd();
  }

  async function begin() {
    if (submitting.current) return;
    submitting.current = true;
    responseId.current++;
    setPhase('loading');
    try {
      const ac = aircraftClass;
      const cfg: ExamConfig = {
        studyMode,
        difficulty,
        rating,
        aircraftClass: ac,
      };
      const created = await createSession(cfg);
      session.current = { id: created.id, config: cfg, aircraftClass: ac };
      const turn = await startExam(created.id, cfg);
      applyOpaque(turn);
      setBubbles([{ role: 'examiner', text: turn.examinerMessage ?? '…' }]);
      setPhase(turn.sessionComplete ? 'complete' : 'active');
      if (!turn.sessionComplete) speak(turn.examinerMessage);
      scrollEnd();
    } catch (e) {
      fail(e);
    } finally {
      submitting.current = false;
    }
  }

  async function submit() {
    if (submitting.current || busy || finalizing || !session.current) return;
    submitting.current = true;
    beginVoiceExchange();
    responseId.current++;
    setBusy(true);
    try {
      const a = (audio.mode === 'listening' ? await controller.finalize() : answer).trim();
      markVoiceFinalized();
      if (!a || !controller.active) return;
      await controller.abort();
      pendingAnswer.current = a;
      pendingStudentCount.current = bubbles.filter((bubble) => bubble.role === 'student').length;
      setAnswer('');
      const withAnswer = [...bubbles, { role: 'student' as const, text: a }];
      setBubbles(withAnswer);
      scrollEnd();
      const s = session.current;
      const turn = await respond({
        sessionId: s.id,
        studentAnswer: a,
        history: toHistory(bubbles), // history BEFORE this answer (ends with examiner Q)
        taskData: s.taskData,
        plannerState: s.plannerState,
        examPlan: s.examPlan,
        sessionConfig: s.config,
      });
      markExamResponse();
      applyOpaque(turn);
      pendingAnswer.current = null;
      const next: Bubble[] = [
        ...withAnswer,
        { role: 'examiner', text: turn.examinerMessage ?? '…', assessment: turn.assessment },
      ];
      setBubbles(next);
      speak(turn.examinerMessage);
      scrollEnd();

      if (turn.sessionComplete) {
        await controller.abort();
        setPhase('complete');
      } else if (turn.assessment?.advance || turn.advance) {
        pendingAdvance.current = true;
        const adv = await nextTask({
          sessionId: s.id,
          history: toHistory(next),
          plannerState: s.plannerState,
          examPlan: s.examPlan,
          sessionConfig: s.config,
        });
        applyOpaque(adv);
        pendingAdvance.current = false;
        const advMsg = adv.examinerMessage ?? (adv.sessionComplete ? 'Exam complete.' : '…');
        setBubbles((b) => [...b, { role: 'examiner', text: advMsg }]);
        if (adv.sessionComplete) {
          await controller.abort();
          setPhase('complete');
        } else speak(adv.examinerMessage);
        scrollEnd();
      }
    } catch (e) {
      if (pendingAnswer.current) setAnswer(pendingAnswer.current);
      fail(e);
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }

  async function endExam() {
    const s = session.current;
    if (!s || busy || submitting.current) return;
    submitting.current = true;
    setBusy(true);
    try {
      await controller.abort();
      await completeSession(s.id);
      setPhase('complete');
    } catch (e) {
      fail(e);
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }

  async function recover() {
    if (submitting.current) return;
    submitting.current = true;
    setPhase('loading');
    try {
      if (errorStatus === 503) await new Promise((resolve) => setTimeout(resolve, 1000));
      const s = session.current;
      if (!s) { setPhase('config'); return; }
      const { sessions } = await getSessions();
      if (sessions.find((item) => item.id === s.id)?.status === 'completed') {
        pendingAdvance.current = false;
        pendingAnswer.current = null;
        setPhase('complete');
        return;
      }
      await reactivateSession(s.id);
      if (!bubbles.length) {
        const turn = await startExam(s.id, s.config);
        applyOpaque(turn);
        setBubbles(restoreTranscript([], turn.examinerMessage));
        setPhase(turn.sessionComplete ? 'complete' : 'active');
        if (!turn.sessionComplete) speak(turn.examinerMessage);
        return;
      }
      const oldElement = s.elementCode;
      const turn = await resumeCurrent({ sessionId: s.id, sessionConfig: s.config });
      applyOpaque(turn);
      const rows = await getTranscripts(s.id);
      const restored = restoreTranscript(rows, turn.sessionComplete ? undefined : turn.examinerMessage);
      if (pendingAdvance.current && oldElement === turn.elementCode && !turn.sessionComplete) {
        const next = await nextTask({ sessionId: s.id, sessionConfig: s.config, history: toHistory(restored) });
        applyOpaque(next);
        if (next.examinerMessage) restored.push({ role: 'examiner', text: next.examinerMessage });
        if (next.sessionComplete) {
          setPhase('complete');
        } else { setPhase('active'); speak(next.examinerMessage); }
      } else {
        setPhase(turn.sessionComplete ? 'complete' : 'active');
      }
      pendingAdvance.current = false;
      setBubbles(restored);
      // A response may have committed before a network failure. Never resubmit it blindly.
      const lastStudent = rows.findLast((row) => row.role === 'student');
      if (pendingAnswer.current && lastStudent?.text === pendingAnswer.current
        && rows.filter((row) => row.role === 'student').length > pendingStudentCount.current
        && rows.at(-1)?.role === 'examiner') {
        pendingAnswer.current = null;
        setAnswer('');
      }
    } catch (error) { fail(error); }
    finally { submitting.current = false; }
  }

  // ---- render ----
  const overlay = upgrade ? <UpgradeSheet reason={upgrade} onDismiss={() => setUpgrade(null)} /> : null;

  if (phase === 'loading') {
    return (
      <Screen>
        <View style={styles.center}>
          <ActivityIndicator color={colors.amber} />
        </View>
      </Screen>
    );
  }

  if (phase === 'error') {
    return (
      <Screen>
        <View style={styles.center}>
          <Text style={styles.errTitle}>Exam error</Text>
          <Text style={styles.errMsg}>{error}</Text>
          <Pressable accessibilityRole="button" onPress={recover} style={styles.retry}>
            <Text style={styles.retryText}>{errorStatus === 409 ? 'Continue here' : 'Retry'}</Text>
          </Pressable>
        </View>
      </Screen>
    );
  }

  if (phase === 'config') {
    return (
      <>
        <Screen scroll>
          <MicroLabel>PRACTICE</MicroLabel>
          <H1>Start an exam</H1>
          <Lead>Pick a rating, then talk through the oral with your AI examiner.</Lead>
          <Card style={{ marginBottom: space[4] }}>
            <MicroLabel color={colors.amber}>RATING</MicroLabel>
            <View style={styles.chips}>
              {RATINGS.map((r) => (
                <Pressable
                  key={r.key}
                  onPress={() => setRating(r.key)}
                  style={[styles.chip, rating === r.key && styles.chipActive]}>
                  <Text style={[styles.chipText, rating === r.key && styles.chipTextActive]}>
                    {r.label}
                  </Text>
                </Pressable>
              ))}
            </View>

            <View style={{ height: space[4] }} />
            <MicroLabel color={colors.amber}>MODE</MicroLabel>
            <View style={styles.chips}>
              {MODES.map((m) => (
                <Pressable
                  key={m.key}
                  onPress={() => setStudyMode(m.key)}
                  style={[styles.chip, studyMode === m.key && styles.chipActive]}>
                  <Text style={[styles.chipText, studyMode === m.key && styles.chipTextActive]}>
                    {m.label}
                  </Text>
                </Pressable>
              ))}
            </View>

            <View style={{ height: space[4] }} />
            <MicroLabel color={colors.amber}>DIFFICULTY</MicroLabel>
            <View style={styles.chips}>
              {DIFFS.map((d) => (
                <Pressable
                  key={d.key}
                  onPress={() => setDifficulty(d.key)}
                  style={[styles.chip, difficulty === d.key && styles.chipActive]}>
                  <Text style={[styles.chipText, difficulty === d.key && styles.chipTextActive]}>
                    {d.label}
                  </Text>
                </Pressable>
              ))}
            </View>

            <View style={{ height: space[5] }} />
            <PrimaryButton label="Begin exam" onPress={begin} />
          </Card>
        </Screen>
        {overlay}
      </>
    );
  }

  if (phase === 'complete') {
    return (
      <Screen scroll>
        <MicroLabel color={colors.greenReadable}>COMPLETE</MicroLabel>
        <H1>Exam complete</H1>
        {session.current ? <ExamResults sessionId={session.current.id} /> : null}
        <PrimaryButton label="Review in Progress" onPress={() => router.push('/(tabs)/progress')} />
        <View style={{ height: space[3] }} />
        <PrimaryButton
          label="New exam"
          onPress={() => {
            setBubbles([]);
            setAnswer('');
            pendingAnswer.current = null;
            pendingAdvance.current = false;
            session.current = null;
            setPhase('config');
          }}
        />
      </Screen>
    );
  }

  // active
  const elementCode = session.current?.elementCode;
  return (
    <View style={styles.root}>
      {overlay}
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>
        <View style={styles.header}>
          <MicroLabel>{elementCode ? `EXAM · ${elementCode}` : 'EXAM'}</MicroLabel>
          <View style={styles.headerActions}>
            <Pressable
              onPress={toggleVoice}
              hitSlop={8}
              accessibilityRole="switch"
              accessibilityState={{ checked: voiceOn }}
              accessibilityLabel="Examiner voice">
              <Ionicons name={voiceOn ? 'volume-high-outline' : 'volume-mute-outline'} size={24} color={voiceOn ? colors.amber : colors.muted} />
            </Pressable>
            <Pressable testID="end-exam" accessibilityRole="button" onPress={endExam} disabled={busy} hitSlop={8}>
              <Text style={styles.endBtn}>End exam</Text>
            </Pressable>
          </View>
        </View>
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          keyboardVerticalOffset={8}>
          <ScrollView
            ref={scroll}
            contentContainerStyle={styles.convo}
            keyboardShouldPersistTaps="handled">
            {bubbles.map((b, i) =>
              b.role === 'examiner' ? (
                <ExaminerBubble key={i} text={b.text} assessment={b.assessment} />
              ) : (
                <StudentBubble key={i} text={b.text} />
              )
            )}
            {busy ? (
              <View testID="exam-thinking" style={styles.thinking}>
                <ActivityIndicator color={colors.cyanReadable} size="small" />
                <Text style={styles.thinkingText}>Examiner is considering your answer…</Text>
              </View>
            ) : null}
          </ScrollView>
          {voiceOn && bubbles.some((bubble) => bubble.role === 'examiner') && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Listen to last examiner turn"
              testID="replay-examiner"
              disabled={busy || finalizing || stt.listening || stt.connecting || audio.mode === 'speaking'}
              onPress={() => speak(bubbles.findLast((bubble) => bubble.role === 'examiner')?.text, 'replay')}
              style={[styles.retry, { alignSelf: 'center', marginBottom: space[2] }]}>
              <Text style={styles.retryText}>Listen to last examiner turn</Text>
            </Pressable>
          )}
          {stt.error ? /permission|microphone access is off/i.test(stt.error)
            ? <Pressable accessibilityRole="button" accessibilityLabel="Open microphone settings" onPress={() => Linking.openSettings()}><Text style={styles.sttError}>{stt.error}</Text></Pressable>
            : <Text accessibilityRole="alert" style={styles.sttError}>{stt.error}</Text>
            : null}
          {stt.listening || stt.connecting ? (
            <View style={styles.sttBar}>
              <View style={[styles.sttDot, stt.listening && styles.sttDotLive]} />
              <Text style={styles.sttBarText} numberOfLines={1}>
                {stt.connecting ? 'Connecting…' : stt.interim ? stt.interim : 'Listening — speak your answer'}
              </Text>
            </View>
          ) : null}
          <View style={styles.inputBar}>
            <Pressable
              onPress={toggleMic}
              disabled={busy || finalizing}
              accessibilityRole="button"
              accessibilityLabel={stt.listening ? 'Stop voice input' : 'Answer by voice'}
              style={[styles.mic, (stt.listening || stt.connecting) && styles.micOn, busy && { opacity: 0.4 }]}>
              <Ionicons name={stt.listening ? 'stop' : 'mic'} size={22} color={stt.listening ? colors.bg : colors.cyanReadable} />
            </Pressable>
            <TextInput
              testID="exam-answer"
              value={answer}
              onChangeText={setAnswer}
              placeholder="Type or speak your answer…"
              placeholderTextColor={colors.dim}
              style={styles.input}
              multiline
              accessibilityLabel="Your answer"
              editable={!busy && !stt.listening && !stt.connecting && !finalizing}
            />
            <Pressable
              testID="send-answer"
              onPress={submit}
              accessibilityRole="button"
              accessibilityLabel="Send answer"
              disabled={busy || finalizing || (!answer.trim() && !stt.listening)}
              style={[styles.send, (busy || !answer.trim()) && { opacity: 0.4 }]}>
              <Text style={styles.sendText}>Send</Text>
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

function ExaminerBubble({ text, assessment }: { text: string; assessment?: Assessment }) {
  return (
    <View style={styles.examinerRow}>
      <View style={styles.examinerBubble}>
        {assessment ? <ScoreBadge score={assessment.score} /> : null}
        <Text style={styles.examinerText}>{text}</Text>
      </View>
    </View>
  );
}

function StudentBubble({ text }: { text: string }) {
  return (
    <View style={styles.studentRow}>
      <View style={styles.studentBubble}>
        <Text style={styles.studentText}>{text}</Text>
      </View>
    </View>
  );
}

function ScoreBadge({ score }: { score: Score }) {
  const map: Record<Score, { c: string; label: string }> = {
    satisfactory: { c: colors.greenReadable, label: 'SATISFACTORY' },
    partial: { c: colors.amber, label: 'PARTIAL' },
    unsatisfactory: { c: colors.red, label: 'UNSATISFACTORY' },
    ungraded: { c: colors.dim, label: 'UNGRADED' },
  };
  const { c, label } = map[score] ?? map.ungraded;
  return (
    <View style={[styles.badge, { borderColor: c }]}>
      <Text style={[styles.badgeText, { color: c }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: space[3], padding: space[5] },
  errTitle: { fontFamily: font.sansSemibold, fontSize: fontSize.lg, color: colors.text },
  errMsg: { fontFamily: font.sans, fontSize: fontSize.sm, color: colors.dim, textAlign: 'center' },
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space[5],
    paddingTop: space[3],
    paddingBottom: space[2],
  },
  endBtn: { fontFamily: font.sansMedium, fontSize: fontSize.sm, color: colors.dim },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: space[4] },
  voiceBtn: { fontFamily: font.mono, fontSize: fontSize.xs, color: colors.dim },
  voiceBtnOn: { color: colors.cyanReadable },
  convo: { paddingHorizontal: space[4], paddingBottom: space[4], gap: space[3] },
  examinerRow: { flexDirection: 'row' },
  examinerBubble: {
    maxWidth: '88%',
    backgroundColor: colors.bezel,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderTopLeftRadius: 4,
    padding: space[4],
  },
  examinerText: { fontFamily: font.sans, fontSize: fontSize.base, lineHeight: 22, color: colors.text },
  studentRow: { flexDirection: 'row', justifyContent: 'flex-end' },
  studentBubble: {
    maxWidth: '88%',
    backgroundColor: colors.amberLo,
    borderWidth: 1,
    borderColor: colors.amberDim,
    borderRadius: radius.lg,
    borderTopRightRadius: 4,
    padding: space[4],
  },
  studentText: { fontFamily: font.sans, fontSize: fontSize.base, lineHeight: 22, color: colors.amberBright },
  badge: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: space[2],
    paddingVertical: 2,
    marginBottom: space[2],
  },
  badgeText: { fontFamily: font.mono, fontSize: fontSize.micro, letterSpacing: 1 },
  thinking: { flexDirection: 'row', alignItems: 'center', gap: space[2], paddingVertical: space[2] },
  thinkingText: { fontFamily: font.mono, fontSize: fontSize.xs, color: colors.dim },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: space[2],
    paddingHorizontal: space[4],
    paddingTop: space[2],
    paddingBottom: space[3],
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    backgroundColor: colors.panel,
  },
  input: {
    flex: 1,
    maxHeight: 120,
    minHeight: 44,
    fontFamily: font.sans,
    fontSize: fontSize.base,
    color: colors.text,
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: space[3],
    paddingTop: 12,
  },
  send: {
    minHeight: 44,
    paddingHorizontal: space[4],
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.amber,
    borderRadius: radius.md,
  },
  sendText: { fontFamily: font.sansSemibold, fontSize: 15, color: colors.bg },
  mic: {
    minHeight: 44,
    minWidth: 44,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bezel,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
  },
  micOn: { backgroundColor: colors.cyanLo, borderColor: colors.cyanDim },
  micGlyph: { fontFamily: font.sans, fontSize: 18, color: colors.muted },
  micGlyphOn: { color: colors.cyanReadable },
  sttBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[2],
    paddingHorizontal: space[4],
    paddingVertical: space[2],
  },
  sttDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.dim },
  sttDotLive: { backgroundColor: colors.cyan },
  sttBarText: { flex: 1, fontFamily: font.sans, fontSize: fontSize.sm, color: colors.cyanReadable },
  sttError: {
    fontFamily: font.sans,
    fontSize: fontSize.xs,
    color: colors.red,
    paddingHorizontal: space[4],
    paddingTop: space[2],
  },
});
