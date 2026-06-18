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

import { Card, H1, Lead, MicroLabel, PrimaryButton, Screen } from '@/components/cockpit';
import { UPGRADE_CODES, UpgradeSheet } from '@/components/upgrade-sheet';
import { useExaminerVoice } from '@/hooks/use-examiner-voice';
import { useStudentSTT } from '@/hooks/use-student-stt';
import { track } from '@/lib/analytics';
import { ApiError } from '@/lib/api';
import { completeSession, getResumable, getTier, reactivateSession } from '@/lib/endpoints';
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
  const [rating, setRating] = useState<Rating>('private');
  const [aircraftClass, setAircraftClass] = useState<AircraftClass>('ASEL');
  const [studyMode, setStudyMode] = useState<StudyMode>('linear');
  const [difficulty, setDifficulty] = useState<Diff>('mixed');

  const [bubbles, setBubbles] = useState<Bubble[]>([]);
  const [answer, setAnswer] = useState('');
  const [busy, setBusy] = useState(false);
  const [upgrade, setUpgrade] = useState<string | null>(null);
  const [voiceOn, setVoiceOn] = useState(false);

  const voice = useExaminerVoice();
  const stt = useStudentSTT();
  const lastSpoken = useRef<string>('');

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
        const ac = (tier.preferredAircraftClass || 'ASEL') as AircraftClass;
        setAircraftClass(ac);
        const { session: open } = await getResumable();
        if (open) {
          await resumeExam(open.id, open.rating, open.study_mode, ac, open.status);
        } else {
          setPhase('config');
        }
      } catch (e) {
        fail(e);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Speak the most recent examiner turn whenever it changes (start / respond
  // feedback / next-task question / resumed pending question), if voice is on.
  useEffect(() => {
    if (!voiceOn || phase !== 'active') return;
    for (let i = bubbles.length - 1; i >= 0; i--) {
      if (bubbles[i].role === 'examiner') {
        if (bubbles[i].text !== lastSpoken.current) {
          lastSpoken.current = bubbles[i].text;
          voice.speak(bubbles[i].text);
        }
        break;
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bubbles, voiceOn, phase]);

  function toggleVoice() {
    setVoiceOn((on) => {
      const next = !on;
      if (!next) voice.stop();
      else {
        // turning on mid-exam: speak the current pending question
        lastSpoken.current = '';
      }
      track('voice_mode_toggled', { enabled: next });
      return next;
    });
  }

  // Live-fill the answer field from the speech transcript while listening (the
  // student can then edit before sending — never auto-submit a misheard answer).
  // Only overwrite once there's recognized content, so tapping the mic doesn't
  // instantly wipe an already-typed answer before any speech arrives.
  useEffect(() => {
    if ((stt.listening || stt.connecting) && (stt.transcript || stt.interim)) {
      setAnswer(`${stt.transcript}${stt.interim ? ` ${stt.interim}` : ''}`.trim());
    }
  }, [stt.transcript, stt.interim, stt.listening, stt.connecting]);

  async function toggleMic() {
    if (stt.listening || stt.connecting) {
      stt.stop();
      return;
    }
    voice.stop(); // barge-in: the examiner must stop before we take the mic (half-duplex)
    await stt.start();
  }

  function fail(e: unknown) {
    // Trial/quota blocks (403 create, 429 mid-exam) route to the paywall, not an error.
    if (e instanceof ApiError && e.code && UPGRADE_CODES.has(e.code)) {
      setUpgrade(e.code);
      track('paywall_shown', { reason: e.code });
      setBusy(false);
      setPhase((p) => (p === 'active' ? 'active' : 'config'));
      return;
    }
    setError(e instanceof ApiError ? e.message : (e as Error)?.message ?? 'Something went wrong');
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

  async function resumeExam(id: string, r: string, mode: string, ac: AircraftClass, status?: string) {
    setPhase('loading');
    const cfg: ExamConfig = {
      studyMode: (mode || 'linear') as StudyMode,
      difficulty: 'mixed',
      rating: (r || 'private') as Rating,
      aircraftClass: ac,
    };
    session.current = { id, config: cfg, aircraftClass: ac };

    // A paused session must be reactivated first, or the first respond/next-task
    // (which require status 'active') 409s straight into the error screen.
    if (status === 'paused') await reactivateSession(id);

    const transcripts = await getTranscripts(id);
    const restored: Bubble[] = transcripts.map((t) => ({ role: t.role, text: t.text }));
    // Assessments persist on the STUDENT row (exam route updates the student
    // transcript), but the live UI renders the score badge on the following
    // examiner (feedback) bubble — shift them so resumed badges match.
    transcripts.forEach((t, i) => {
      if (t.assessment && t.role === 'student' && restored[i + 1]?.role === 'examiner') {
        restored[i + 1].assessment = t.assessment;
      }
    });

    const turn = await resumeCurrent({ sessionId: id, sessionConfig: cfg });
    applyOpaque(turn);
    setBubbles(restored);
    setPhase(turn.sessionComplete ? 'complete' : 'active');
    scrollEnd();
  }

  async function begin() {
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
      setPhase('active');
      scrollEnd();
    } catch (e) {
      fail(e);
    }
  }

  async function submit() {
    const a = answer.trim();
    if (!a || busy || !session.current) return;
    stt.stop(); // finalize + release the mic / restore the playback session
    voice.stop(); // barge-in: the student is answering, cut off the examiner
    setBusy(true);
    setAnswer('');
    const withAnswer = [...bubbles, { role: 'student' as const, text: a }];
    setBubbles(withAnswer);
    scrollEnd();
    try {
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
      applyOpaque(turn);
      const next: Bubble[] = [
        ...withAnswer,
        { role: 'examiner', text: turn.examinerMessage ?? '…', assessment: turn.assessment },
      ];
      setBubbles(next);
      scrollEnd();

      if (turn.assessment?.advance || turn.advance) {
        const adv = await nextTask({
          sessionId: s.id,
          history: toHistory(next),
          plannerState: s.plannerState,
          examPlan: s.examPlan,
          sessionConfig: s.config,
        });
        applyOpaque(adv);
        const advMsg = adv.examinerMessage ?? (adv.sessionComplete ? 'Exam complete.' : '…');
        setBubbles((b) => [...b, { role: 'examiner', text: advMsg }]);
        if (adv.sessionComplete) setPhase('complete');
        scrollEnd();
      }
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  }

  async function endExam() {
    const s = session.current;
    if (!s || busy) return;
    setBusy(true);
    try {
      await completeSession(s.id);
      setPhase('complete');
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
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
          <Pressable onPress={() => setPhase('config')} style={styles.retry}>
            <Text style={styles.retryText}>Back</Text>
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
        <Lead>Nice work. Review your coverage in Progress, or start another exam.</Lead>
        <PrimaryButton
          label="New exam"
          onPress={() => {
            setBubbles([]);
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
              <Text style={[styles.voiceBtn, voiceOn && styles.voiceBtnOn]}>
                {voiceOn ? (voice.speaking ? '◉ speaking' : '🔊 voice') : '🔇 voice'}
              </Text>
            </Pressable>
            <Pressable onPress={endExam} disabled={busy} hitSlop={8}>
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
              <View style={styles.thinking}>
                <ActivityIndicator color={colors.cyanReadable} size="small" />
                <Text style={styles.thinkingText}>Examiner is considering your answer…</Text>
              </View>
            ) : null}
          </ScrollView>
          {stt.error ? <Text style={styles.sttError}>{stt.error}</Text> : null}
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
              disabled={busy}
              accessibilityRole="button"
              accessibilityLabel={stt.listening ? 'Stop voice input' : 'Answer by voice'}
              style={[styles.mic, (stt.listening || stt.connecting) && styles.micOn, busy && { opacity: 0.4 }]}>
              <Text style={[styles.micGlyph, (stt.listening || stt.connecting) && styles.micGlyphOn]}>
                {stt.connecting ? '…' : stt.listening ? '■' : '🎤'}
              </Text>
            </Pressable>
            <TextInput
              value={answer}
              onChangeText={setAnswer}
              placeholder="Type or speak your answer…"
              placeholderTextColor={colors.dim}
              style={styles.input}
              multiline
              editable={!busy && !stt.listening && !stt.connecting}
            />
            <Pressable
              onPress={submit}
              disabled={busy || !answer.trim()}
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
