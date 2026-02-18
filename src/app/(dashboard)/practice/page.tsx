'use client';

import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import SessionConfig, { type SessionConfigData } from './components/SessionConfig';
import OnboardingWizard from './components/OnboardingWizard';
import type { PlannerState, SessionConfig as SessionConfigType, Rating, AircraftClass } from '@/types/database';
import type { VoiceTier } from '@/lib/voice/types';
import { useVoiceProvider } from '@/hooks/useVoiceProvider';
import { ExamImages } from '@/components/ui/ExamImages';

/**
 * Retry a fetch call once on transient infrastructure errors (405, 502, 503, 504).
 * These status codes on known-valid endpoints indicate Vercel edge/routing glitches,
 * not application errors.
 */
async function fetchWithRetry(input: RequestInfo, init?: RequestInit): Promise<Response> {
  const res = await fetch(input, init);
  if ([405, 502, 503, 504].includes(res.status)) {
    await new Promise((r) => setTimeout(r, 500));
    return fetch(input, init);
  }
  return res;
}

interface Source {
  doc_abbreviation: string;
  heading: string | null;
  content: string;
  page_start: number | null;
}

interface Assessment {
  score: 'satisfactory' | 'unsatisfactory' | 'partial';
  feedback: string;
  misconceptions: string[];
  source_summary?: string | null;
}

interface ExamImage {
  image_id: string;
  figure_label: string | null;
  caption: string | null;
  image_category: string;
  public_url: string;
  width: number;
  height: number;
  description: string | null;
  doc_abbreviation: string;
  page_number: number;
  link_type: string;
  relevance_score: number;
}

interface Message {
  role: 'examiner' | 'student';
  text: string;
  assessment?: Assessment;
  sources?: Source[];
  images?: ExamImage[];
}

interface TaskData {
  id: string;
  area: string;
  task: string;
  knowledge_elements: { code: string; description: string }[];
  risk_management_elements: { code: string; description: string }[];
  skill_elements: { code: string; description: string }[];
}

export default function PracticePage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [sessionActive, setSessionActive] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [taskData, setTaskData] = useState<TaskData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [voiceEnabled, setVoiceEnabled] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [exchangeCount, setExchangeCount] = useState(0);
  const [coveredTaskIds, setCoveredTaskIds] = useState<string[]>([]);
  const [currentElement, setCurrentElement] = useState<string | null>(null);
  const [plannerState, setPlannerState] = useState<PlannerState | null>(null);
  const [sessionConfig, setSessionConfig] = useState<SessionConfigType | null>(null);
  const [tier, setTier] = useState<VoiceTier>('checkride_prep');
  const [preferredRating, setPreferredRating] = useState<Rating>('private');
  const [preferredAircraftClass, setPreferredAircraftClass] = useState<AircraftClass>('ASEL');
  const [prefsLoaded, setPrefsLoaded] = useState(false);
  const [onboardingCompleted, setOnboardingCompleted] = useState<boolean | null>(null);
  const [showWizard, setShowWizard] = useState(false);
  // Upgrade prompt states (Task 34)
  const [showQuotaModal, setShowQuotaModal] = useState(false);
  const [quotaWarning, setQuotaWarning] = useState<string | null>(null);
  // Post-checkout success banner (Task 36)
  const [checkoutSuccess, setCheckoutSuccess] = useState(false);
  // Report inaccurate answer modal state (Task 26)
  const [reportModal, setReportModal] = useState<{ exchangeIndex: number; examinerText: string } | null>(null);
  const [reportErrorType, setReportErrorType] = useState<'factual' | 'scoring' | 'safety'>('factual');
  const [reportComment, setReportComment] = useState('');
  const [reportSubmitting, setReportSubmitting] = useState(false);
  // Session paused notification toast (Task 30)
  const [pausedSessionToast, setPausedSessionToast] = useState(false);
  // Error recovery modal state
  const [showErrorRecovery, setShowErrorRecovery] = useState(false);
  const [lastFailedAnswer, setLastFailedAnswer] = useState<string | null>(null);
  // Scroll-to-bottom FAB visibility
  const [showScrollFab, setShowScrollFab] = useState(false);
  // Resumable session (active/paused with planner state in metadata)
  const [resumableSession, setResumableSession] = useState<{
    id: string;
    rating: Rating;
    exchange_count: number;
    started_at: string;
    study_mode: string;
    difficulty_preference: string;
    aircraft_class: string;
    metadata: Record<string, unknown>;
  } | null>(null);
  const [resumeVoiceToggle, setResumeVoiceToggle] = useState(true);
  // Track per-task assessment scores (ref avoids stale closures in fire-and-forget fetches)
  const taskScoresRef = useRef<Record<string, { score: 'satisfactory' | 'unsatisfactory' | 'partial'; attempts: number }>>({});
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const voiceEnabledRef = useRef(false);
  // Text waiting to be revealed when TTS audio actually starts playing
  const pendingFullTextRef = useRef<string | null>(null);
  // When true, user is manually editing the textarea — don't overwrite with STT transcript
  const userEditingRef = useRef(false);

  // Unified voice provider hook (handles STT + TTS for all tiers)
  const voice = useVoiceProvider({ tier, sessionId: sessionId || undefined });

  // Fetch user's tier + practice preferences on mount + check quota usage
  useEffect(() => {
    fetch('/api/user/tier')
      .then((res) => res.ok ? res.json() : null)
      .then((data) => {
        if (data?.tier) setTier(data.tier);
        if (data?.preferredRating) setPreferredRating(data.preferredRating);
        if (data?.preferredAircraftClass) setPreferredAircraftClass(data.preferredAircraftClass);
        if (data?.onboardingCompleted !== undefined) setOnboardingCompleted(data.onboardingCompleted);
        setPrefsLoaded(true);
        // Check if usage is at 80% or above for proactive warning (Task 34)
        if (data?.usage && data?.features) {
          const sessionPct = data.features.maxSessionsPerMonth !== Infinity
            ? data.usage.sessionsThisMonth / data.features.maxSessionsPerMonth
            : 0;
          const ttsPct = data.features.maxTtsCharsPerMonth !== Infinity
            ? data.usage.ttsCharsThisMonth / data.features.maxTtsCharsPerMonth
            : 0;
          if (sessionPct >= 0.8 || ttsPct >= 0.8) {
            const pct = Math.max(sessionPct, ttsPct);
            setQuotaWarning(`You've used ${Math.round(pct * 100)}% of your monthly limit.`);
          }
        }
      })
      .catch(() => { setPrefsLoaded(true); setOnboardingCompleted(true); }); // Fallback to defaults
  }, []);

  // Check for a resumable session on mount
  useEffect(() => {
    fetch('/api/session?action=get-resumable')
      .then((res) => res.ok ? res.json() : null)
      .then((data) => {
        if (data?.session) {
          const meta = data.session.metadata as Record<string, unknown> | null;
          // Only show resume if planner state exists in metadata
          if (meta?.plannerState && meta?.sessionConfig) {
            setResumableSession(data.session);
          }
        }
      })
      .catch(() => {});
  }, []);

  // Fetch practice stats for progress indicators
  interface PracticeSession {
    started_at: string;
    rating: string;
    acs_tasks_covered: { task_id: string; status: string }[];
  }
  interface TaskMeta { id: string; area: string; }
  const [practiceStats, setPracticeStats] = useState<{
    sessions: PracticeSession[];
    totalTasks: number;
    areaNames: Record<string, string>;
  } | null>(null);

  useEffect(() => {
    if (!prefsLoaded) return;
    Promise.all([
      fetch('/api/session').then((r) => r.json()),
      fetch(`/api/exam?action=list-tasks&rating=${preferredRating}`).then((r) => r.json()),
    ])
      .then(([sessionData, taskData]) => {
        const tasks: TaskMeta[] = taskData.tasks || [];
        const areaNames: Record<string, string> = {};
        for (const t of tasks) {
          const areaKey = t.id.split('.').slice(0, 2).join('.');
          if (!areaNames[areaKey]) areaNames[areaKey] = t.area;
        }
        setPracticeStats({
          sessions: sessionData.sessions || [],
          totalTasks: tasks.length,
          areaNames,
        });
      })
      .catch(() => {});
  }, [prefsLoaded, preferredRating]);

  // Sticky onboarding gate: once we determine the user needs onboarding, set showWizard = true.
  // This is NOT derived — it can only be dismissed by user interaction (complete or skip).
  useEffect(() => {
    if (onboardingCompleted === false && practiceStats !== null) {
      const sessions = (practiceStats.sessions || []).filter((s: PracticeSession) => s.rating === preferredRating);
      if (sessions.length === 0) {
        setShowWizard(true);
      }
    }
  }, [onboardingCompleted, practiceStats, preferredRating]);

  // Derived stats
  const ratingSessions = useMemo(
    () => (practiceStats?.sessions || []).filter((s) => s.rating === preferredRating),
    [practiceStats, preferredRating]
  );

  const coveragePct = useMemo(() => {
    if (!practiceStats?.totalTasks) return 0;
    const covered = new Set(ratingSessions.flatMap((s) => (s.acs_tasks_covered || []).map((t) => t.task_id)));
    return Math.round((covered.size / practiceStats.totalTasks) * 100);
  }, [ratingSessions, practiceStats]);

  const streak = useMemo(() => {
    if (ratingSessions.length === 0) return 0;
    const uniqueDates = [...new Set(ratingSessions.map((s) => new Date(s.started_at).toDateString()))]
      .map((d) => new Date(d))
      .sort((a, b) => b.getTime() - a.getTime());
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const daysSinceLast = Math.floor((now.getTime() - uniqueDates[0].getTime()) / 86400000);
    if (daysSinceLast > 1) return 0;
    let count = 1;
    for (let i = 1; i < uniqueDates.length; i++) {
      const gap = Math.floor((uniqueDates[i - 1].getTime() - uniqueDates[i].getTime()) / 86400000);
      if (gap === 1) count++;
      else break;
    }
    return count;
  }, [ratingSessions]);

  const suggestedFocus = useMemo(() => {
    const areaStats: Record<string, { unsat: number; total: number }> = {};
    for (const s of ratingSessions) {
      for (const t of s.acs_tasks_covered || []) {
        const key = t.task_id.split('.').slice(0, 2).join('.');
        if (!areaStats[key]) areaStats[key] = { unsat: 0, total: 0 };
        areaStats[key].total++;
        if (t.status === 'unsatisfactory') areaStats[key].unsat++;
      }
    }
    let worst = '';
    let worstRate = 0;
    for (const [key, stats] of Object.entries(areaStats)) {
      if (stats.total < 2) continue;
      const rate = stats.unsat / stats.total;
      if (rate > worstRate) { worstRate = rate; worst = key; }
    }
    return worst ? practiceStats?.areaNames[worst] || '' : '';
  }, [ratingSessions, practiceStats]);

  // Post-checkout entitlement sync (Task 36)
  useEffect(() => {
    if (searchParams.get('checkout') === 'success') {
      fetch('/api/stripe/status')
        .then((res) => res.ok ? res.json() : null)
        .then((data) => {
          if (data?.tier) {
            setTier(data.tier);
            setCheckoutSuccess(true);
            setQuotaWarning(null); // Clear any quota warning after upgrade
          }
        })
        .catch(() => {});
      // Clean the URL so the banner doesn't reappear on refresh
      router.replace('/practice');
    }
  }, [searchParams, router]);

  // Sync voice transcript to input field when listening (unless user is manually editing)
  useEffect(() => {
    if (voice.isListening && !userEditingRef.current) {
      const combined = voice.transcript + (voice.interimTranscript ? ' ' + voice.interimTranscript : '');
      if (combined.trim()) {
        setInput(combined.trim());
      }
    }
    // Reset editing flag when listening stops (next listen session starts fresh)
    if (!voice.isListening) {
      userEditingRef.current = false;
    }
  }, [voice.transcript, voice.interimTranscript, voice.isListening]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Track scroll position to show/hide scroll-to-bottom FAB
  const handleChatScroll = useCallback(() => {
    const el = chatContainerRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    setShowScrollFab(distanceFromBottom > 100);
  }, []);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  // Keep ref in sync so speakText never has stale closure
  useEffect(() => {
    voiceEnabledRef.current = voiceEnabled;
  }, [voiceEnabled]);

  // Show pending examiner text immediately (used on barge-in, TTS error, end session)
  const flushReveal = useCallback(() => {
    const fullText = pendingFullTextRef.current;
    if (fullText) {
      pendingFullTextRef.current = null;
      setMessages(prev => {
        const updated = [...prev];
        const lastIdx = updated.length - 1;
        if (lastIdx >= 0 && updated[lastIdx].role === 'examiner') {
          updated[lastIdx] = { ...updated[lastIdx], text: fullText };
        }
        return updated;
      });
    }
  }, []);

  // When TTS audio starts playing, reveal the pending text
  // When audio stops (barge-in) and text is still pending, flush it
  useEffect(() => {
    if (voice.isSpeaking && pendingFullTextRef.current) {
      flushReveal();
    } else if (!voice.isSpeaking && pendingFullTextRef.current) {
      flushReveal();
    }
  }, [voice.isSpeaking, flushReveal]);

  // Voice failure auto-fallback: disable voice mode on TTS/STT errors
  useEffect(() => {
    if (voice.error && voiceEnabled && sessionActive) {
      setVoiceEnabled(false);
      voiceEnabledRef.current = false;
      flushReveal();
    }
  }, [voice.error, voiceEnabled, sessionActive, flushReveal]);

  // Play examiner's message via the voice provider
  const speakText = useCallback(async (text: string) => {
    if (!voiceEnabledRef.current) return;

    // Stop listening before playing audio
    if (voice.isListening) {
      voice.stopListening();
    }

    try {
      await voice.speak(text);
    } catch (err) {
      console.error('TTS playback error:', err);
      flushReveal(); // Ensure text is visible if TTS fails
    }
  }, [voice, flushReveal]);

  async function startSession(configData: SessionConfigData) {
    // If there's a resumable session, mark it completed before starting fresh
    if (resumableSession) {
      fetch('/api/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'update', sessionId: resumableSession.id, status: 'completed' }),
      }).catch(() => {});
      setResumableSession(null);
    }

    setSessionActive(true);
    setLoading(true);
    setError(null);
    setMessages([]);
    setExchangeCount(0);
    setCoveredTaskIds([]);
    setCurrentElement(null);
    setPlannerState(null);
    taskScoresRef.current = {};
    setVoiceEnabled(configData.voiceEnabled);
    voiceEnabledRef.current = configData.voiceEnabled;

    // Build session config for the planner
    const config: SessionConfigType = {
      rating: configData.rating,
      aircraftClass: configData.aircraftClass,
      studyMode: configData.studyMode,
      difficulty: configData.difficulty,
      selectedAreas: configData.selectedAreas,
      selectedTasks: configData.selectedTasks,
    };
    setSessionConfig(config);

    try {
      // Create a session record in the database
      const sessionRes = await fetch('/api/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'create',
          rating: configData.rating,
          study_mode: configData.studyMode,
          difficulty_preference: configData.difficulty,
          selected_areas: configData.selectedAreas,
          aircraft_class: configData.aircraftClass,
          selected_tasks: configData.selectedTasks,
        }),
      });
      const sessionData = await sessionRes.json();
      let newSessionId: string | null = null;
      if (sessionRes.ok && sessionData.session) {
        newSessionId = sessionData.session.id;
        setSessionId(newSessionId);
      }

      const res = await fetchWithRetry('/api/exam', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'start',
          sessionId: newSessionId,
          sessionConfig: config,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to start session');

      // Task 30: Show notification if another session was paused
      if (data.pausedSessionId) {
        setPausedSessionToast(true);
        setTimeout(() => setPausedSessionToast(false), 8000);
      }

      setTaskData(data.taskData);
      if (data.taskId) {
        setCoveredTaskIds([data.taskId]);
      }
      if (data.elementCode) {
        setCurrentElement(data.elementCode);
      }
      if (data.plannerState) {
        setPlannerState(data.plannerState);
      }
      const examinerMsg = data.examinerMessage;

      // Persist voiceEnabled to metadata for resume (non-blocking)
      if (newSessionId) {
        fetch('/api/session', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'update', sessionId: newSessionId, voice_enabled: configData.voiceEnabled }),
        }).catch(() => {});
      }

      if (configData.voiceEnabled) {
        // Voice ON: start with empty text, reveal when audio actually starts playing
        setMessages([{ role: 'examiner', text: '' }]);
        pendingFullTextRef.current = examinerMsg;
        speakText(examinerMsg);
      } else {
        // Voice OFF: show full text immediately
        setMessages([{ role: 'examiner', text: examinerMsg }]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start session');
    } finally {
      setLoading(false);
    }
  }

  async function sendAnswer(overrideText?: string) {
    const studentAnswer = overrideText || input.trim();
    if (!studentAnswer || !taskData || loading) return;

    // Stop mic when sending — user is done talking
    if (voice.isListening) {
      voice.stopListening();
    }

    setInput('');
    userEditingRef.current = false;
    setMessages((prev) => [...prev, { role: 'student', text: studentAnswer }]);
    setLoading(true);

    try {
      const res = await fetchWithRetry('/api/exam', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'respond',
          taskData,
          history: messages,
          studentAnswer,
          sessionId,
          sessionConfig,
          stream: true,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        // Show upgrade modal on quota exceeded (Task 34)
        if (res.status === 429 && errData.error === 'quota_exceeded') {
          setShowQuotaModal(true);
          setLoading(false);
          return;
        }
        // Handle session superseded by another device (Task 30)
        if (res.status === 409 && errData.error === 'session_superseded') {
          setError('This exam session has been superseded by another device. Please end this session.');
          setLoading(false);
          return;
        }
        throw new Error(errData.error || 'Failed to get response');
      }

      const contentType = res.headers.get('content-type') || '';

      if (contentType.includes('text/event-stream') && res.body) {
        // Streaming path: read SSE tokens incrementally
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let examinerMsg = '';
        let receivedAssessment: Assessment | null = null;
        let receivedSources: Source[] | undefined;

        if (!voiceEnabledRef.current) {
          // Voice OFF: show placeholder and stream tokens visually
          setMessages((prev) => [...prev, { role: 'examiner', text: '' }]);
          setLoading(false); // Hide typing indicator — we're showing real tokens now
        }
        // Voice ON: keep loading indicator (typing dots) visible during generation

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });

          // Process complete SSE lines from buffer
          const lines = buffer.split('\n');
          buffer = lines.pop() || ''; // Keep incomplete line in buffer

          for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            const payload = line.slice(6);

            if (payload === '[DONE]') continue;

            try {
              const parsed = JSON.parse(payload);

              if (parsed.token) {
                // Incremental token — append to examiner message
                examinerMsg += parsed.token;
                if (!voiceEnabledRef.current) {
                  // Voice OFF: update message text in real-time (streaming display)
                  setMessages((prev) => {
                    const updated = [...prev];
                    const lastIdx = updated.length - 1;
                    if (lastIdx >= 0 && updated[lastIdx].role === 'examiner') {
                      updated[lastIdx] = { ...updated[lastIdx], text: examinerMsg };
                    }
                    return updated;
                  });
                }
                // Voice ON: accumulate silently, reveal after stream completes
              } else if (parsed.examinerMessage) {
                // Full message event — use as authoritative final text
                examinerMsg = parsed.examinerMessage;
                if (!voiceEnabledRef.current) {
                  setMessages((prev) => {
                    const updated = [...prev];
                    const lastIdx = updated.length - 1;
                    if (lastIdx >= 0 && updated[lastIdx].role === 'examiner') {
                      updated[lastIdx] = { ...updated[lastIdx], text: examinerMsg };
                    }
                    return updated;
                  });
                }
              } else if (parsed.images) {
                // Image references for the examiner message
                const showImages = process.env.NEXT_PUBLIC_SHOW_EXAM_IMAGES === 'true';
                if (showImages && Array.isArray(parsed.images) && parsed.images.length > 0) {
                  setMessages((prev) => {
                    const updated = [...prev];
                    const lastIdx = updated.length - 1;
                    if (lastIdx >= 0 && updated[lastIdx].role === 'examiner') {
                      updated[lastIdx] = { ...updated[lastIdx], images: parsed.images };
                    }
                    return updated;
                  });
                }
              } else if (parsed.assessment) {
                // Assessment arrived (from parallel assessment call)
                receivedAssessment = parsed.assessment;
                receivedSources = parsed.assessment.rag_chunks?.map((c: { doc_abbreviation: string; heading: string | null; content: string; page_start: number | null }) => ({
                  doc_abbreviation: c.doc_abbreviation,
                  heading: c.heading,
                  content: c.content,
                  page_start: c.page_start,
                }));
              }
            } catch {
              // Ignore malformed SSE payloads
            }
          }
        }

        // Apply assessment to the student message
        if (receivedAssessment) {
          setMessages((prev) => {
            const updated = [...prev];
            for (let i = updated.length - 1; i >= 0; i--) {
              if (updated[i].role === 'student') {
                updated[i] = {
                  ...updated[i],
                  assessment: receivedAssessment!,
                  sources: receivedSources,
                };
                break;
              }
            }
            return updated;
          });
        }

        // Track assessment + session updates
        const newExchangeCount = exchangeCount + 1;
        setExchangeCount(newExchangeCount);

        if (receivedAssessment?.score && taskData.id) {
          const prev = taskScoresRef.current[taskData.id];
          taskScoresRef.current[taskData.id] = {
            score: receivedAssessment.score,
            attempts: (prev?.attempts || 0) + 1,
          };
        }

        setCoveredTaskIds((prev) =>
          prev.includes(taskData.id) ? prev : [...prev, taskData.id]
        );

        // Update session stats (examiner transcript is persisted server-side via onComplete callback)
        if (sessionId) {
          fetch('/api/session', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              action: 'update',
              sessionId,
              exchange_count: newExchangeCount,
              acs_tasks_covered: Object.entries(taskScoresRef.current).map(([id, s]) => ({
                task_id: id,
                status: s.score,
                attempts: s.attempts,
              })),
              planner_state: plannerState,
              session_config: sessionConfig,
              task_data: taskData,
              voice_enabled: voiceEnabled,
            }),
          }).catch(() => {});
        }

        if (voiceEnabledRef.current && examinerMsg) {
          // Voice ON: add placeholder with empty text, reveal when audio starts
          setMessages((prev) => [...prev, { role: 'examiner', text: '' }]);
          setLoading(false);
          pendingFullTextRef.current = examinerMsg;
          speakText(examinerMsg);
        }
      } else {
        // Fallback: non-streaming JSON response
        const data = await res.json();
        const examinerMsg = data.examinerMessage;
        const newExchangeCount = exchangeCount + 1;
        setExchangeCount(newExchangeCount);

        if (data.assessment) {
          setMessages((prev) => {
            const updated = [...prev];
            for (let i = updated.length - 1; i >= 0; i--) {
              if (updated[i].role === 'student') {
                updated[i] = {
                  ...updated[i],
                  assessment: data.assessment,
                  sources: data.assessment.rag_chunks?.map((c: { doc_abbreviation: string; heading: string | null; content: string; page_start: number | null }) => ({
                    doc_abbreviation: c.doc_abbreviation,
                    heading: c.heading,
                    content: c.content,
                    page_start: c.page_start,
                  })),
                };
                break;
              }
            }
            return [...updated, { role: 'examiner', text: examinerMsg }];
          });
        } else {
          setMessages((prev) => [
            ...prev,
            { role: 'examiner', text: examinerMsg },
          ]);
        }

        if (data.assessment?.score && data.taskId) {
          const prev = taskScoresRef.current[data.taskId];
          taskScoresRef.current[data.taskId] = {
            score: data.assessment.score,
            attempts: (prev?.attempts || 0) + 1,
          };
        }

        if (data.taskId) {
          setCoveredTaskIds((prev) =>
            prev.includes(data.taskId) ? prev : [...prev, data.taskId]
          );
        }

        if (sessionId) {
          const scores = taskScoresRef.current;
          fetch('/api/session', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              action: 'update',
              sessionId,
              exchange_count: newExchangeCount,
              acs_tasks_covered: Object.entries(scores).map(([id, s]) => ({
                task_id: id,
                status: s.score,
                attempts: s.attempts,
              })),
              planner_state: plannerState,
              session_config: sessionConfig,
              task_data: taskData,
              voice_enabled: voiceEnabled,
            }),
          }).catch(() => {});
        }

        if (voiceEnabledRef.current) {
          speakText(examinerMsg);
        }
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to get response';
      setError(errorMsg);
      setLastFailedAnswer(studentAnswer);
      setShowErrorRecovery(true);
    } finally {
      setLoading(false);
    }
  }

  // Retry failed answer from error recovery modal
  function retryLastAnswer() {
    if (!lastFailedAnswer) return;
    setShowErrorRecovery(false);
    setError(null);
    sendAnswer(lastFailedAnswer);
  }

  async function endSession() {
    flushReveal(); // Clear any pending sentence reveal timers
    voice.stopSpeaking();
    voice.stopListening();

    // Mark session as completed in database — await to ensure it saves
    if (sessionId) {
      try {
        await fetch('/api/session', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'update',
            sessionId,
            status: 'completed',
            exchange_count: exchangeCount,
            acs_tasks_covered: Object.entries(taskScoresRef.current).map(([id, s]) => ({
              task_id: id,
              status: s.score,
              attempts: s.attempts,
            })),
          }),
        });
      } catch {
        // Session update failed, but still clean up UI
      }
    }

    setSessionActive(false);
    setMessages([]);
    setTaskData(null);
    setError(null);
    setInput('');
    setSessionId(null);
    setExchangeCount(0);
    setCoveredTaskIds([]);
    setCurrentElement(null);
    setPlannerState(null);
    setSessionConfig(null);
    taskScoresRef.current = {};
  }

  async function resumeSession(session: NonNullable<typeof resumableSession>) {
    const metadata = session.metadata as {
      plannerState?: PlannerState;
      sessionConfig?: SessionConfigType;
    };
    if (!metadata.plannerState || !metadata.sessionConfig) return;

    // Use the voice toggle from the resume card
    setVoiceEnabled(resumeVoiceToggle);
    voiceEnabledRef.current = resumeVoiceToggle;

    setSessionActive(true);
    setLoading(true);
    setError(null);
    setSessionId(session.id);
    setSessionConfig(metadata.sessionConfig);
    setPlannerState(metadata.plannerState);
    setExchangeCount(session.exchange_count || 0);
    setResumableSession(null);
    taskScoresRef.current = {};

    try {
      // Mark session as active (in case it was paused)
      await fetch('/api/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'update', sessionId: session.id, status: 'active' }),
      });

      // Load conversation history from transcripts
      const transcriptRes = await fetch(`/api/session?action=transcripts&sessionId=${session.id}`);
      const transcriptData = await transcriptRes.json();

      const loadedMessages: Message[] = (transcriptData.transcripts || []).map((t: { role: string; text: string; assessment?: Assessment }) => ({
        role: t.role as 'examiner' | 'student',
        text: t.text,
        assessment: t.assessment || undefined,
      }));

      // Check if the last message is from the examiner (question pending, user hasn't answered)
      const lastMessage = loadedMessages[loadedMessages.length - 1];
      const examinerAskedLast = lastMessage?.role === 'examiner';

      if (examinerAskedLast) {
        // Examiner's question is still pending — fetch current task from DB without advancing
        setMessages(loadedMessages);

        const res = await fetchWithRetry('/api/exam', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'resume-current',
            sessionConfig: metadata.sessionConfig,
            plannerState: metadata.plannerState,
          }),
        });

        const data = await res.json();
        if (res.ok && data.taskData) {
          setTaskData(data.taskData);
          if (data.elementCode) setCurrentElement(data.elementCode);
        }
        // If resume-current fails, user can still see transcript and type answers
      } else {
        // Student answered last (or no transcripts) — need to advance planner for next question
        setMessages(loadedMessages);
        const res = await fetchWithRetry('/api/exam', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'next-task',
            sessionId: session.id,
            sessionConfig: metadata.sessionConfig,
            plannerState: metadata.plannerState,
          }),
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to resume session');

        if (data.sessionComplete) {
          setMessages((prev) => [...prev, { role: 'examiner', text: data.examinerMessage }]);
        } else {
          setTaskData(data.taskData);
          if (data.elementCode) setCurrentElement(data.elementCode);
          if (data.plannerState) setPlannerState(data.plannerState);
          const examinerMsg = data.examinerMessage;
          if (resumeVoiceToggle) {
            setMessages((prev) => [...prev, { role: 'examiner', text: '' }]);
            pendingFullTextRef.current = examinerMsg;
            speakText(examinerMsg);
          } else {
            setMessages((prev) => [...prev, { role: 'examiner', text: examinerMsg }]);
          }
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to resume session');
    } finally {
      setLoading(false);
    }
  }

  const ratingLabel = preferredRating === 'commercial' ? 'Commercial Pilot' : preferredRating === 'instrument' ? 'Instrument Rating' : preferredRating === 'atp' ? 'ATP' : 'Private Pilot';

  function startQuickSession() {
    startSession({
      rating: preferredRating,
      aircraftClass: preferredAircraftClass,
      studyMode: 'weak_areas',
      difficulty: 'mixed',
      selectedAreas: [],
      selectedTasks: [],
      voiceEnabled: false,
    });
  }

  if (!sessionActive) {
    return (
      <div className="max-w-2xl mx-auto">
        {/* Banners */}
        {checkoutSuccess && (
          <div className="bg-c-green-lo border border-c-green/20 rounded-lg p-3 mb-4 text-c-green text-sm flex items-center justify-between">
            <span>Welcome to HeyDPE! Your subscription is active. Enjoy unlimited practice sessions.</span>
            <button onClick={() => setCheckoutSuccess(false)} className="text-c-green hover:text-c-green/80 ml-3 shrink-0">&times;</button>
          </div>
        )}
        {quotaWarning && (
          <div className="bg-c-amber-lo border border-c-amber/20 rounded-lg p-3 mb-4 text-c-amber text-sm flex items-center justify-between">
            <span>{quotaWarning} <a href="/pricing" className="underline hover:text-c-amber/80">Upgrade</a> for unlimited access.</span>
            <button onClick={() => setQuotaWarning(null)} className="text-c-amber hover:text-c-amber/80 ml-3 shrink-0">&times;</button>
          </div>
        )}

        {/* ──────── ONBOARDING WIZARD (full-screen, blocks everything) ──────── */}
        {showWizard ? (
          <OnboardingWizard
            defaultRating={preferredRating}
            defaultAircraftClass={preferredAircraftClass}
            loading={loading}
            onComplete={(config) => {
              setPreferredRating(config.rating);
              setPreferredAircraftClass(config.aircraftClass);
              setOnboardingCompleted(true);
              setShowWizard(false);
              startSession({
                rating: config.rating,
                aircraftClass: config.aircraftClass,
                studyMode: 'linear',
                difficulty: 'easy',
                selectedAreas: ['I'],
                selectedTasks: [],
                voiceEnabled: config.voiceEnabled,
              });
            }}
            onSkip={() => {
              setOnboardingCompleted(true);
              setShowWizard(false);
            }}
          />
        ) : (onboardingCompleted === null || (onboardingCompleted === false && practiceStats === null)) ? (
          /* ──────── LOADING: don't show config until we know if onboarding is needed ──────── */
          <div className="space-y-4 animate-pulse">
            <div className="h-8 w-32 bg-c-bezel rounded-lg" />
            <div className="h-48 bg-c-bezel/50 rounded-lg" />
            <div className="h-12 bg-c-bezel/50 rounded-lg" />
          </div>
        ) : (
          /* ──────── RETURNING USER / NORMAL VIEW ──────── */
          <>
            {/* Header with progress indicators */}
            <div className="flex items-center justify-between mb-5">
              <h1 className="font-mono font-bold text-xl text-c-amber glow-a tracking-wider uppercase">PRACTICE</h1>
              {practiceStats && (
                <div className="flex items-center gap-3">
                  {coveragePct > 0 && (
                    <div className="flex items-center gap-2">
                      <div className="w-10 h-10 rounded-full border border-c-cyan/40 flex items-center justify-center gauge" style={{ '--gc': '#00d4ff', '--gp': `${coveragePct}%` } as React.CSSProperties}>
                        <div className="w-7 h-7 rounded-full bg-c-panel flex items-center justify-center">
                          <span className="font-mono font-bold text-c-cyan text-[10px]">{coveragePct}%</span>
                        </div>
                      </div>
                      <span className="text-[10px] text-c-muted font-mono uppercase">ACS</span>
                    </div>
                  )}
                  {streak > 0 && (
                    <span className="flex items-center gap-1 text-[10px] font-mono text-c-amber bg-c-amber-lo px-2 py-1 rounded border border-c-amber/20">
                      &#9670; {streak}d
                    </span>
                  )}
                  {ratingSessions.length > 0 && (
                    <span className="text-[10px] text-c-muted font-mono uppercase">{ratingSessions.length} SESSIONS</span>
                  )}
                </div>
              )}
            </div>

            {/* Quick 5 + suggested focus */}
            {ratingSessions.length > 0 && (
              <div className="flex items-center gap-3 mb-5">
                <button
                  onClick={startQuickSession}
                  disabled={loading}
                  className="px-4 py-2.5 bg-c-bezel hover:bg-c-border border border-c-border hover:border-c-amber/30 text-c-text rounded-lg font-mono text-xs font-medium transition-colors disabled:opacity-50 flex items-center gap-2 uppercase"
                >
                  <span className="text-c-amber">&#9889;</span>
                  QUICK 5 &mdash; WEAK AREAS
                </button>
                {suggestedFocus && (
                  <p className="text-[10px] text-c-muted font-mono">
                    Suggested: <span className="text-c-text">{suggestedFocus}</span>
                  </p>
                )}
              </div>
            )}

            {/* Resume previous session card */}
            {resumableSession && (
              <div className="iframe rounded-lg p-4 mb-5 border-l-2 border-c-cyan">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <div className="w-1.5 h-1.5 rounded-full bg-c-cyan blink"></div>
                      <h3 className="font-mono text-xs font-semibold text-c-cyan glow-c uppercase">CONTINUE PREVIOUS SESSION</h3>
                    </div>
                    <p className="text-[10px] text-c-muted font-mono mt-1">
                      {new Date(resumableSession.started_at).toLocaleDateString('en-US', {
                        month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
                      })}
                      {' '}&middot; {resumableSession.exchange_count || 0} exchanges
                      {' '}&middot; {resumableSession.rating.toUpperCase()}
                      {resumableSession.aircraft_class ? ` \u00B7 ${resumableSession.aircraft_class}` : ''}
                      {' '}&middot; {resumableSession.study_mode === 'linear' ? 'Linear' : resumableSession.study_mode === 'cross_acs' ? 'Cross-ACS' : 'Weak Areas'}
                      {' '}&middot; {resumableSession.difficulty_preference}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <label className="flex items-center gap-1.5 text-[10px] text-c-muted font-mono cursor-pointer select-none uppercase">
                      <input
                        type="checkbox"
                        checked={resumeVoiceToggle}
                        onChange={(e) => setResumeVoiceToggle(e.target.checked)}
                        className="rounded border-c-border bg-c-bezel text-c-cyan focus:ring-c-cyan w-3.5 h-3.5"
                      />
                      VOICE
                    </label>
                    <button
                      onClick={() => resumeSession(resumableSession)}
                      disabled={loading}
                      className="px-4 py-2 bg-c-cyan hover:bg-c-cyan/90 text-c-bg rounded-lg font-mono text-xs font-semibold transition-colors disabled:opacity-50 uppercase"
                    >
                      CONTINUE
                    </button>
                    <button
                      onClick={async () => {
                        await fetch('/api/session', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ action: 'update', sessionId: resumableSession.id, status: 'completed' }),
                        });
                        setResumableSession(null);
                      }}
                      className="px-3 py-2 text-c-muted hover:text-c-text font-mono text-xs transition-colors border border-c-border rounded-lg hover:border-c-border-hi uppercase"
                    >
                      START NEW
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Session config form */}
            <SessionConfig
              onStart={startSession}
              loading={loading}
              preferredRating={preferredRating}
              preferredAircraftClass={preferredAircraftClass}
              prefsLoaded={prefsLoaded}
            />

            {/* Disclaimer — always visible but low visual weight */}
            <p className="text-c-amber/25 text-[10px] font-mono leading-relaxed mt-4 text-center uppercase">
              FOR STUDY PURPOSES ONLY. NOT A SUBSTITUTE FOR CFI INSTRUCTION OR AN ACTUAL DPE CHECKRIDE.
              ALWAYS VERIFY INFORMATION AGAINST CURRENT FAA PUBLICATIONS.
            </p>
          </>
        )}

        {/* Quota exceeded modal (Task 34) */}
        {showQuotaModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-c-bg/80 backdrop-blur-sm">
            <div className="bezel rounded-lg border border-c-border p-6 max-w-md mx-4 shadow-2xl">
              <h2 className="font-mono font-bold text-xl text-c-amber glow-a mb-2 tracking-wider uppercase">SESSION LIMIT REACHED</h2>
              <p className="text-c-muted text-sm mb-6">
                You&apos;ve reached your monthly session limit. Upgrade your plan to continue practicing
                for your checkride.
              </p>
              <div className="flex gap-3">
                <a
                  href="/pricing"
                  className="flex-1 py-2.5 bg-c-amber hover:bg-c-amber/90 text-c-bg rounded-lg font-mono font-semibold text-sm text-center transition-colors uppercase tracking-wider"
                >
                  VIEW PLANS
                </a>
                <button
                  onClick={() => setShowQuotaModal(false)}
                  className="px-4 py-2.5 bg-c-bezel hover:bg-c-border text-c-text rounded-lg font-mono text-sm transition-colors border border-c-border uppercase"
                >
                  DISMISS
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto flex flex-col h-[calc(100vh-8rem)]">
      {/* Session header — persistent but low-weight */}
      <div className="flex items-center justify-between mb-3 px-1">
        <div className="flex items-center gap-3 min-w-0">
          {taskData && (
            <p className="text-xs text-c-muted truncate font-mono">
              {taskData.area} <span className="text-c-dim">/</span> {taskData.task}
              {currentElement && (
                <span className="ml-1.5 font-mono text-c-dim">[{currentElement}]</span>
              )}
            </p>
          )}
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <span className="text-[10px] text-c-dim font-mono tabular-nums uppercase">
            {exchangeCount} Q&amp;A
          </span>
          {voiceEnabled && (
            <span className="flex items-center gap-1 text-[10px] font-mono text-c-green uppercase">
              <span className="w-1.5 h-1.5 rounded-full bg-c-green blink" />
              VOICE
            </span>
          )}
          <button
            onClick={() => {
              if (exchangeCount > 0 && !confirm('End this session? Your progress will be saved.')) return;
              endSession();
            }}
            className="text-[10px] font-mono text-c-muted hover:text-c-red transition-colors underline-offset-2 hover:underline uppercase"
          >
            END SESSION
          </button>
        </div>
      </div>

      {/* Error banner with recovery options */}
      {(error || voice.error) && (
        <div className="bg-c-red-dim/40 border border-c-red/20 rounded-lg p-3 mb-3 text-sm">
          <div className="flex items-start gap-2">
            <svg className="w-4 h-4 text-c-red mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
            </svg>
            <div className="flex-1">
              <p className="text-c-red">{error || voice.error}</p>
              {voice.error && !error && (
                <p className="text-xs text-c-muted mt-1">Voice mode disabled. Continuing in text-only mode.</p>
              )}
              {showErrorRecovery && lastFailedAnswer && (
                <div className="flex gap-2 mt-2">
                  <button
                    onClick={retryLastAnswer}
                    className="px-3 py-1.5 text-xs bg-c-bezel hover:bg-c-border text-c-text rounded-lg transition-colors font-mono uppercase"
                  >
                    RETRY
                  </button>
                  <button
                    onClick={() => {
                      setVoiceEnabled(false);
                      voiceEnabledRef.current = false;
                      setShowErrorRecovery(false);
                      setError(null);
                    }}
                    className="px-3 py-1.5 text-xs bg-c-bezel hover:bg-c-border text-c-text rounded-lg transition-colors font-mono uppercase"
                  >
                    TEXT-ONLY
                  </button>
                  <button
                    onClick={() => { endSession(); setShowErrorRecovery(false); setError(null); }}
                    className="px-3 py-1.5 text-xs bg-c-bezel hover:bg-c-border text-c-text rounded-lg transition-colors font-mono uppercase"
                  >
                    END SESSION
                  </button>
                </div>
              )}
            </div>
            {!showErrorRecovery && (
              <button onClick={() => { setError(null); }} className="text-c-red hover:text-c-red/80 shrink-0">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>
        </div>
      )}

      <div className="flex-1 bezel rounded-lg border border-c-border p-4 overflow-y-auto mb-3 space-y-4 relative" ref={chatContainerRef} onScroll={handleChatScroll}>
        {messages.map((msg, i) => (
          <div
            key={i}
            className={`flex ${msg.role === 'student' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[80%] rounded-lg px-4 py-3 ${
                msg.role === 'examiner'
                  ? 'bg-c-bezel border-l-2 border-c-amber/50'
                  : 'bg-c-cyan-lo/40 border-r-2 border-c-cyan/50'
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <p className={`text-[10px] font-mono uppercase tracking-wide ${
                  msg.role === 'examiner' ? 'text-c-amber' : 'text-c-cyan'
                }`}>
                  {msg.role === 'examiner' ? 'DPE EXAMINER' : 'APPLICANT'}
                </p>
                {/* Report button on examiner messages (Task 26) */}
                {msg.role === 'examiner' && msg.text && (
                  <button
                    onClick={() => {
                      setReportModal({ exchangeIndex: i, examinerText: msg.text });
                      setReportErrorType('factual');
                      setReportComment('');
                    }}
                    className="text-c-dim hover:text-c-amber transition-colors ml-2"
                    title="Report inaccurate answer"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3 3v1.5M3 21v-6m0 0 2.77-.693a9 9 0 0 1 6.208.682l.108.054a9 9 0 0 0 6.086.71l3.114-.732a48.524 48.524 0 0 1-.005-10.499l-3.11.732a9 9 0 0 1-6.085-.711l-.108-.054a9 9 0 0 0-6.208-.682L3 4.5M3 15V4.5" />
                    </svg>
                  </button>
                )}
              </div>
              <p className="text-sm text-c-text leading-relaxed whitespace-pre-wrap">{msg.text}</p>

              {/* Reference images (feature-flagged) */}
              {msg.images && msg.images.length > 0 && (
                <ExamImages images={msg.images} />
              )}

              {/* Assessment badge */}
              {msg.assessment && (
                <div className="mt-2 pt-2 border-t border-c-border">
                  <span className={`font-mono text-[10px] px-2 py-0.5 rounded border uppercase ${
                    msg.assessment.score === 'satisfactory'
                      ? 'bg-c-green-lo/40 text-c-green border-c-green/20'
                      : msg.assessment.score === 'unsatisfactory'
                      ? 'bg-c-red-dim/40 text-c-red border-c-red/20'
                      : 'bg-c-amber-lo text-c-amber border-c-amber/20'
                  }`}>
                    {msg.assessment.score.toUpperCase()}
                  </span>
                  {msg.assessment.feedback && (
                    <p className="text-xs text-c-muted mt-1">{msg.assessment.feedback}</p>
                  )}
                </div>
              )}

              {/* FAA source summary (LLM-synthesized) + deduplicated document references */}
              {(msg.assessment?.source_summary || (msg.sources && msg.sources.length > 0)) && (
                <details className="mt-2 pt-2 border-t border-c-border">
                  <summary className="text-xs text-c-cyan cursor-pointer hover:text-c-cyan/80 font-mono uppercase">
                    FAA REFERENCES
                  </summary>
                  <div className="mt-1.5">
                    {msg.assessment?.source_summary && (
                      <p className="text-xs text-c-text leading-relaxed mb-1.5">{msg.assessment.source_summary}</p>
                    )}
                    {msg.sources && msg.sources.length > 0 && (() => {
                      // Deduplicate sources by abbreviation + heading
                      const seen = new Set<string>();
                      const unique = msg.sources!.filter(src => {
                        const key = `${src.doc_abbreviation}|${src.heading || ''}`;
                        if (seen.has(key)) return false;
                        seen.add(key);
                        return true;
                      });
                      const FAA_LINKS: Record<string, string> = {
                        phak: 'https://www.faa.gov/regulations_policies/handbooks_manuals/aviation/phak',
                        afh: 'https://www.faa.gov/regulations_policies/handbooks_manuals/aviation/airplane_handbook',
                        aim: 'https://www.faa.gov/air_traffic/publications/atpubs/aim_html/',
                        cfr: 'https://www.ecfr.gov/current/title-14',
                        ac: 'https://www.faa.gov/regulations_policies/advisory_circulars',
                        acs: 'https://www.faa.gov/training_testing/testing/acs',
                      };
                      return (
                        <div className="flex flex-wrap gap-1">
                          {unique.map((src, j) => {
                            const link = FAA_LINKS[src.doc_abbreviation.toLowerCase()];
                            const label = src.doc_abbreviation.toUpperCase()
                              + (src.heading ? ` \u2014 ${src.heading}` : '')
                              + (src.page_start ? ` (p.${src.page_start})` : '');
                            return link ? (
                              <a key={j} href={link} target="_blank" rel="noopener noreferrer"
                                className="text-[10px] font-mono bg-c-panel rounded px-1.5 py-0.5 text-c-cyan hover:text-c-cyan/80 hover:bg-c-elevated transition-colors border border-c-border">
                                {label} &#8599;
                              </a>
                            ) : (
                              <span key={j} className="text-[10px] font-mono bg-c-panel rounded px-1.5 py-0.5 text-c-muted border border-c-border">
                                {label}
                              </span>
                            );
                          })}
                        </div>
                      );
                    })()}
                  </div>
                </details>
              )}
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex justify-start">
            <div className="bg-c-bezel rounded-lg px-4 py-3 border-l-2 border-c-amber/50">
              <p className="text-[10px] font-mono mb-1 text-c-amber uppercase">DPE EXAMINER</p>
              <div className="flex space-x-1">
                <div className="w-2 h-2 bg-c-muted rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                <div className="w-2 h-2 bg-c-muted rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                <div className="w-2 h-2 bg-c-muted rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />

        {/* Scroll-to-bottom FAB */}
        {showScrollFab && (
          <button
            onClick={scrollToBottom}
            className="sticky bottom-2 left-1/2 -translate-x-1/2 w-8 h-8 bg-c-bezel hover:bg-c-border border border-c-border rounded-full flex items-center justify-center shadow-lg transition-colors z-10"
            aria-label="Scroll to bottom"
          >
            <svg className="w-4 h-4 text-c-text" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 13.5 12 21m0 0-7.5-7.5M12 21V3" />
            </svg>
          </button>
        )}
      </div>

      {/* Input area — pinned to bottom */}
      <div className="flex gap-2">
        {voiceEnabled && (
          <button
            onClick={() => {
              if (voice.isListening) {
                voice.stopListening();
              } else {
                // Barge-in: if TTS is playing, stop it immediately
                if (voice.isSpeaking) {
                  voice.stopSpeaking();
                  flushReveal();
                }
                voice.startListening();
              }
            }}
            disabled={loading}
            className={`px-4 py-3 rounded-lg font-mono font-medium transition-all uppercase ${
              voice.isListening
                ? 'bg-c-red hover:bg-c-red/90 text-c-bg ring-2 ring-c-red/50 ring-offset-2 ring-offset-c-bg animate-pulse'
                : voice.isSpeaking
                ? 'bg-c-bezel hover:bg-c-border text-c-text border border-dashed border-c-muted'
                : 'bg-c-bezel hover:bg-c-border text-c-text'
            } disabled:opacity-50`}
            title={voice.isListening ? 'Stop recording' : voice.isSpeaking ? 'Interrupt & start speaking' : 'Start recording'}
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              {voice.isListening ? (
                <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 7.5A2.25 2.25 0 0 1 7.5 5.25h9a2.25 2.25 0 0 1 2.25 2.25v9a2.25 2.25 0 0 1-2.25 2.25h-9a2.25 2.25 0 0 1-2.25-2.25v-9Z" />
              ) : (
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 0 0 6-6v-1.5m-6 7.5a6 6 0 0 1-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 0 1-3-3V4.5a3 3 0 0 1 6 0v8.25a3 3 0 0 1-3 3Z" />
              )}
            </svg>
          </button>
        )}
        <div className="flex-1 flex flex-col gap-1.5">
          <textarea
            rows={2}
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              // Barge-in: stop TTS if user starts typing
              if (voice.isSpeaking) {
                voice.stopSpeaking();
                flushReveal();
              }
              // If user types while STT is active, stop overwriting their edits
              if (voice.isListening) {
                userEditingRef.current = true;
              }
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendAnswer();
              }
            }}
            placeholder={voice.isListening ? 'Listening...' : 'Type your answer... (Enter to send)'}
            disabled={loading}
            className="w-full px-4 py-3 bg-c-panel border border-c-border rounded-lg text-c-text font-mono text-xs placeholder-c-dim focus:outline-none focus:ring-1 focus:ring-c-amber focus:border-c-amber disabled:opacity-50 resize-none transition-colors"
          />
          <button
            onClick={() => sendAnswer("I don't know the answer to this question.")}
            disabled={loading}
            className="self-start text-[10px] text-c-muted hover:text-c-text transition-colors disabled:opacity-50 px-1 font-mono uppercase"
          >
            I DON&apos;T KNOW
          </button>
        </div>
        <button
          onClick={() => sendAnswer()}
          disabled={loading || !input.trim()}
          className="px-5 py-3 bg-c-amber hover:bg-c-amber/90 disabled:opacity-50 disabled:hover:bg-c-amber text-c-bg rounded-lg font-mono font-medium transition-colors self-start uppercase"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 12 3.269 3.125A59.769 59.769 0 0 1 21.485 12 59.768 59.768 0 0 1 3.27 20.875L5.999 12Zm0 0h7.5" />
          </svg>
        </button>
      </div>

      {/* Quota exceeded modal during active session (Task 34) */}
      {showQuotaModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-c-bg/80 backdrop-blur-sm">
          <div className="bezel rounded-lg border border-c-border p-6 max-w-md mx-4 shadow-2xl">
            <h2 className="font-mono font-bold text-xl text-c-amber glow-a mb-2 tracking-wider uppercase">SESSION LIMIT REACHED</h2>
            <p className="text-c-muted text-sm mb-6">
              You&apos;ve reached your monthly session limit. Upgrade your plan to continue practicing
              for your checkride.
            </p>
            <div className="flex gap-3">
              <a
                href="/pricing"
                className="flex-1 py-2.5 bg-c-amber hover:bg-c-amber/90 text-c-bg rounded-lg font-mono font-semibold text-sm text-center transition-colors uppercase tracking-wider"
              >
                VIEW PLANS
              </a>
              <button
                onClick={() => setShowQuotaModal(false)}
                className="px-4 py-2.5 bg-c-bezel hover:bg-c-border text-c-text rounded-lg font-mono text-sm transition-colors border border-c-border uppercase"
              >
                DISMISS
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Session paused toast (Task 30) */}
      {pausedSessionToast && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-c-amber-lo border border-c-amber/20 rounded-lg px-4 py-3 shadow-lg flex items-center gap-3 max-w-md">
          <svg className="w-5 h-5 text-c-amber flex-shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" />
          </svg>
          <p className="text-sm text-c-amber">Your exam on another device has been paused. Your progress is saved.</p>
          <button onClick={() => setPausedSessionToast(false)} className="text-c-amber hover:text-c-amber/80 flex-shrink-0">
            &times;
          </button>
        </div>
      )}

      {/* Report inaccurate answer modal (Task 26) */}
      {reportModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-c-bg/80 backdrop-blur-sm">
          <div className="bezel rounded-lg border border-c-border p-6 max-w-md mx-4 shadow-2xl">
            <h3 className="font-mono font-bold text-lg text-c-amber glow-a mb-1 tracking-wider uppercase">REPORT INACCURATE ANSWER</h3>
            <p className="text-[10px] text-c-muted font-mono mb-4 uppercase">EXCHANGE #{Math.ceil((reportModal.exchangeIndex + 1) / 2)}</p>

            <div className="mb-4">
              <label className="block font-mono text-[10px] text-c-muted mb-2 tracking-wider uppercase">ERROR TYPE</label>
              <div className="flex gap-2">
                {(['factual', 'scoring', 'safety'] as const).map((type) => (
                  <button
                    key={type}
                    onClick={() => setReportErrorType(type)}
                    className={`px-3 py-1.5 font-mono text-xs rounded-lg border transition-colors uppercase ${
                      reportErrorType === type
                        ? 'border-c-amber/50 bg-c-amber-lo/50 text-c-amber font-semibold'
                        : 'border-c-border bg-c-bezel text-c-muted hover:border-c-border-hi'
                    }`}
                  >
                    {type === 'factual' ? 'FACTUAL ERROR' : type === 'scoring' ? 'SCORING ERROR' : 'SAFETY CONCERN'}
                  </button>
                ))}
              </div>
            </div>

            <div className="mb-4">
              <label className="block font-mono text-[10px] text-c-muted mb-1.5 tracking-wider uppercase">WHAT WAS INCORRECT?</label>
              <textarea
                value={reportComment}
                onChange={(e) => setReportComment(e.target.value)}
                placeholder="Describe the issue..."
                rows={3}
                className="w-full px-3 py-2.5 bg-c-panel border border-c-border rounded-lg text-c-text font-mono text-xs placeholder-c-dim focus:outline-none focus:ring-1 focus:ring-c-amber focus:border-c-amber resize-none transition-colors"
              />
            </div>

            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setReportModal(null)}
                disabled={reportSubmitting}
                className="px-4 py-2 font-mono text-xs text-c-muted hover:text-c-text transition-colors uppercase"
              >
                CANCEL
              </button>
              <button
                onClick={async () => {
                  setReportSubmitting(true);
                  try {
                    const res = await fetch('/api/report', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        report_type: 'inaccurate_answer',
                        session_id: sessionId,
                        details: {
                          exchange_number: Math.ceil((reportModal.exchangeIndex + 1) / 2),
                          error_type: reportErrorType,
                          comment: reportComment,
                          examiner_text_snippet: reportModal.examinerText.slice(0, 500),
                        },
                      }),
                    });
                    if (res.ok) {
                      setReportModal(null);
                    } else {
                      const data = await res.json().catch(() => ({}));
                      setError(data.error || 'Failed to submit report');
                    }
                  } catch {
                    setError('Failed to submit report');
                  } finally {
                    setReportSubmitting(false);
                  }
                }}
                disabled={reportSubmitting || !reportComment.trim()}
                className="px-4 py-2 font-mono text-xs bg-c-amber hover:bg-c-amber/90 disabled:opacity-50 text-c-bg rounded-lg font-semibold transition-colors uppercase tracking-wider"
              >
                {reportSubmitting ? 'SUBMITTING...' : 'SUBMIT REPORT'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
