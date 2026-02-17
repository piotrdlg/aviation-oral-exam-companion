'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import SessionConfig, { type SessionConfigData } from './components/SessionConfig';
import type { PlannerState, SessionConfig as SessionConfigType, Rating } from '@/types/database';
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
  // Track per-task assessment scores (ref avoids stale closures in fire-and-forget fetches)
  const taskScoresRef = useRef<Record<string, { score: 'satisfactory' | 'unsatisfactory' | 'partial'; attempts: number }>>({});
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const voiceEnabledRef = useRef(false);
  // Text waiting to be revealed when TTS audio actually starts playing
  const pendingFullTextRef = useRef<string | null>(null);
  // When true, user is manually editing the textarea — don't overwrite with STT transcript
  const userEditingRef = useRef(false);

  // Unified voice provider hook (handles STT + TTS for all tiers)
  const voice = useVoiceProvider({ tier, sessionId: sessionId || undefined });

  // Fetch user's tier on mount + check quota usage for proactive warning
  useEffect(() => {
    fetch('/api/user/tier')
      .then((res) => res.ok ? res.json() : null)
      .then((data) => {
        if (data?.tier) setTier(data.tier);
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
      .catch(() => {}); // Fallback to checkride_prep
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

  async function sendAnswer() {
    if (!input.trim() || !taskData || loading) return;

    // Stop mic when sending — user is done talking
    if (voice.isListening) {
      voice.stopListening();
    }

    const studentAnswer = input.trim();
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
            }),
          }).catch(() => {});
        }

        if (voiceEnabledRef.current) {
          speakText(examinerMsg);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to get response');
    } finally {
      setLoading(false);
    }
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
      setMessages(loadedMessages);

      // Advance planner to get next element + examiner question
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
        setMessages((prev) => [...prev, { role: 'examiner', text: data.examinerMessage }]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to resume session');
    } finally {
      setLoading(false);
    }
  }

  if (!sessionActive) {
    return (
      <div className="max-w-2xl mx-auto">
        <h1 className="text-2xl font-bold text-white mb-2">Practice Session</h1>
        <p className="text-gray-400 mb-6">
          Start an oral exam practice session. The AI examiner will ask you questions
          based on the FAA Private Pilot ACS.
        </p>

        {/* Post-checkout success banner (Task 36) */}
        {checkoutSuccess && (
          <div className="bg-green-900/30 border border-green-800/50 rounded-lg p-3 mb-6 text-green-300 text-sm flex items-center justify-between">
            <span>Welcome to HeyDPE! Your subscription is active. Enjoy unlimited practice sessions.</span>
            <button onClick={() => setCheckoutSuccess(false)} className="text-green-400 hover:text-green-300 ml-3 shrink-0">
              &times;
            </button>
          </div>
        )}

        {/* Proactive quota warning banner (Task 34) */}
        {quotaWarning && (
          <div className="bg-amber-900/20 border border-amber-800/50 rounded-lg p-3 mb-6 text-amber-200 text-sm flex items-center justify-between">
            <span>{quotaWarning} <a href="/pricing" className="underline hover:text-amber-100">Upgrade</a> for unlimited access.</span>
            <button onClick={() => setQuotaWarning(null)} className="text-amber-400 hover:text-amber-300 ml-3 shrink-0">
              &times;
            </button>
          </div>
        )}

        <div className="bg-amber-900/20 border border-amber-800/50 rounded-lg p-3 mb-6 text-amber-200 text-xs leading-relaxed">
          For study purposes only. This is not a substitute for instruction from a certificated
          flight instructor (CFI) or an actual DPE checkride. Always verify information against
          current FAA publications.
        </div>

        {/* Resume previous session card */}
        {resumableSession && (
          <div className="bg-blue-900/20 border border-blue-800/50 rounded-xl p-4 mb-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-medium text-blue-300">Continue Previous Session</h3>
                <p className="text-xs text-gray-400 mt-1">
                  {new Date(resumableSession.started_at).toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    hour: 'numeric',
                    minute: '2-digit',
                  })}
                  {' '}&middot; {resumableSession.exchange_count || 0} exchanges
                  {' '}&middot; {resumableSession.rating.toUpperCase()}
                  {resumableSession.aircraft_class ? ` · ${resumableSession.aircraft_class}` : ''}
                  {' '}&middot; {resumableSession.study_mode === 'linear' ? 'Linear' : resumableSession.study_mode === 'cross_acs' ? 'Cross-ACS' : 'Weak Areas'}
                  {' '}&middot; {resumableSession.difficulty_preference}
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => resumeSession(resumableSession)}
                  disabled={loading}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
                >
                  Continue
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
                  className="px-3 py-2 text-gray-400 hover:text-gray-300 text-sm transition-colors"
                >
                  Start New
                </button>
              </div>
            </div>
          </div>
        )}

        <SessionConfig onStart={startSession} loading={loading} />

        {/* Quota exceeded modal (Task 34) */}
        {showQuotaModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
            <div className="bg-gray-900 border border-gray-700 rounded-xl p-6 max-w-md mx-4 shadow-2xl">
              <h2 className="text-xl font-bold text-white mb-2">Session Limit Reached</h2>
              <p className="text-gray-400 text-sm mb-6">
                You&apos;ve reached your monthly session limit. Upgrade your plan to continue practicing
                for your checkride.
              </p>
              <div className="flex gap-3">
                <a
                  href="/pricing"
                  className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium text-sm text-center transition-colors"
                >
                  View Plans
                </a>
                <button
                  onClick={() => setShowQuotaModal(false)}
                  className="px-4 py-2.5 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg text-sm transition-colors"
                >
                  Dismiss
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
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-xl font-bold text-white">Oral Exam in Progress</h1>
          {taskData && (
            <p className="text-sm text-gray-500 mt-1">
              {taskData.area} &gt; {taskData.task}
              {currentElement && (
                <span className="ml-2 font-mono text-xs text-gray-600">[{currentElement}]</span>
              )}
            </p>
          )}
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-gray-500">
            {exchangeCount} exchange{exchangeCount !== 1 ? 's' : ''}
          </span>
          {voiceEnabled && (
            <span className="text-xs text-green-400">
              Voice On
            </span>
          )}
          <button
            onClick={() => {
              if (exchangeCount > 0 && !confirm('End this session? Your progress will be saved.')) return;
              endSession();
            }}
            className="text-sm text-gray-400 hover:text-red-400 transition-colors"
          >
            End Session
          </button>
        </div>
      </div>

      {(error || voice.error) && (
        <div className="bg-red-900/30 border border-red-800 rounded-lg p-3 mb-4 text-red-300 text-sm flex items-center justify-between">
          <span>{error || voice.error}</span>
          <button onClick={() => setError(null)} className="text-red-400 hover:text-red-300 ml-3">
            &times;
          </button>
        </div>
      )}

      <div className="flex-1 bg-gray-900 rounded-xl border border-gray-800 p-4 overflow-y-auto mb-4 space-y-4">
        {messages.map((msg, i) => (
          <div
            key={i}
            className={`flex ${msg.role === 'student' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[70%] rounded-xl px-4 py-3 ${
                msg.role === 'examiner'
                  ? 'bg-gray-800 text-gray-100'
                  : 'bg-blue-600 text-white'
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <p className="text-xs font-medium opacity-60">
                  {msg.role === 'examiner' ? 'DPE Examiner' : 'You'}
                </p>
                {/* Report button on examiner messages (Task 26) */}
                {msg.role === 'examiner' && msg.text && (
                  <button
                    onClick={() => {
                      setReportModal({ exchangeIndex: i, examinerText: msg.text });
                      setReportErrorType('factual');
                      setReportComment('');
                    }}
                    className="text-gray-600 hover:text-amber-400 transition-colors ml-2"
                    title="Report inaccurate answer"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3 3v1.5M3 21v-6m0 0 2.77-.693a9 9 0 0 1 6.208.682l.108.054a9 9 0 0 0 6.086.71l3.114-.732a48.524 48.524 0 0 1-.005-10.499l-3.11.732a9 9 0 0 1-6.085-.711l-.108-.054a9 9 0 0 0-6.208-.682L3 4.5M3 15V4.5" />
                    </svg>
                  </button>
                )}
              </div>
              <p className="text-sm leading-relaxed whitespace-pre-wrap">{msg.text}</p>

              {/* Reference images (feature-flagged) */}
              {msg.images && msg.images.length > 0 && (
                <ExamImages images={msg.images} />
              )}

              {/* Assessment badge */}
              {msg.assessment && (
                <div className="mt-2 pt-2 border-t border-white/10">
                  <span className={`text-xs px-2 py-0.5 rounded-full ${
                    msg.assessment.score === 'satisfactory'
                      ? 'bg-green-900/40 text-green-400'
                      : msg.assessment.score === 'unsatisfactory'
                      ? 'bg-red-900/40 text-red-400'
                      : 'bg-yellow-900/40 text-yellow-400'
                  }`}>
                    {msg.assessment.score}
                  </span>
                  {msg.assessment.feedback && (
                    <p className="text-xs opacity-70 mt-1">{msg.assessment.feedback}</p>
                  )}
                </div>
              )}

              {/* FAA source summary (LLM-synthesized) + deduplicated document references */}
              {(msg.assessment?.source_summary || (msg.sources && msg.sources.length > 0)) && (
                <details className="mt-2 pt-2 border-t border-white/10">
                  <summary className="text-xs text-blue-300 cursor-pointer hover:text-blue-200">
                    FAA References
                  </summary>
                  <div className="mt-1.5">
                    {msg.assessment?.source_summary && (
                      <p className="text-xs text-gray-300 leading-relaxed mb-1.5">{msg.assessment.source_summary}</p>
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
                              + (src.heading ? ` — ${src.heading}` : '')
                              + (src.page_start ? ` (p.${src.page_start})` : '');
                            return link ? (
                              <a key={j} href={link} target="_blank" rel="noopener noreferrer"
                                className="text-xs bg-black/20 rounded px-1.5 py-0.5 text-blue-300 hover:text-blue-200 hover:bg-black/30 transition-colors">
                                {label} ↗
                              </a>
                            ) : (
                              <span key={j} className="text-xs bg-black/20 rounded px-1.5 py-0.5 text-blue-200/70">
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
            <div className="bg-gray-800 rounded-xl px-4 py-3">
              <p className="text-xs font-medium mb-1 text-gray-500">DPE Examiner</p>
              <div className="flex space-x-1">
                <div className="w-2 h-2 bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                <div className="w-2 h-2 bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                <div className="w-2 h-2 bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      <div className="flex gap-2">
        {voiceEnabled && (
          <button
            onClick={voice.isListening ? () => voice.stopListening() : () => voice.startListening()}
            disabled={loading || voice.isSpeaking}
            className={`px-4 py-3 rounded-xl font-medium transition-colors ${
              voice.isListening
                ? 'bg-red-600 hover:bg-red-700 text-white animate-pulse'
                : 'bg-gray-700 hover:bg-gray-600 text-gray-200'
            } disabled:opacity-50`}
            title={voice.isListening ? 'Stop recording' : 'Start recording'}
          >
            {voice.isListening ? '⏹' : '🎤'}
          </button>
        )}
        <textarea
          rows={3}
          value={input}
          onChange={(e) => {
            setInput(e.target.value);
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
          placeholder={voice.isListening ? 'Listening...' : 'Type your answer... (Enter to send, Shift+Enter for new line)'}
          disabled={loading}
          className="flex-1 px-4 py-3 bg-gray-800 border border-gray-700 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 resize-none"
        />
        <button
          onClick={sendAnswer}
          disabled={loading || !input.trim()}
          className="px-6 py-3 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:hover:bg-blue-600 text-white rounded-xl font-medium transition-colors"
        >
          Send
        </button>
      </div>

      {/* Quota exceeded modal during active session (Task 34) */}
      {showQuotaModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-gray-900 border border-gray-700 rounded-xl p-6 max-w-md mx-4 shadow-2xl">
            <h2 className="text-xl font-bold text-white mb-2">Session Limit Reached</h2>
            <p className="text-gray-400 text-sm mb-6">
              You&apos;ve reached your monthly session limit. Upgrade your plan to continue practicing
              for your checkride.
            </p>
            <div className="flex gap-3">
              <a
                href="/pricing"
                className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium text-sm text-center transition-colors"
              >
                View Plans
              </a>
              <button
                onClick={() => setShowQuotaModal(false)}
                className="px-4 py-2.5 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg text-sm transition-colors"
              >
                Dismiss
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Session paused toast (Task 30) */}
      {pausedSessionToast && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-amber-900/90 border border-amber-700 rounded-lg px-4 py-3 shadow-lg flex items-center gap-3 max-w-md">
          <svg className="w-5 h-5 text-amber-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" />
          </svg>
          <p className="text-sm text-amber-200">Your exam on another device has been paused. Your progress is saved.</p>
          <button onClick={() => setPausedSessionToast(false)} className="text-amber-400 hover:text-amber-300 flex-shrink-0">
            &times;
          </button>
        </div>
      )}

      {/* Report inaccurate answer modal (Task 26) */}
      {reportModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-gray-900 border border-gray-700 rounded-xl p-6 max-w-md mx-4 shadow-2xl">
            <h3 className="text-lg font-bold text-white mb-1">Report Inaccurate Answer</h3>
            <p className="text-xs text-gray-500 mb-4">Exchange #{Math.ceil((reportModal.exchangeIndex + 1) / 2)}</p>

            <div className="mb-4">
              <label className="block text-sm text-gray-300 mb-2">Error type</label>
              <div className="flex gap-2">
                {(['factual', 'scoring', 'safety'] as const).map((type) => (
                  <button
                    key={type}
                    onClick={() => setReportErrorType(type)}
                    className={`px-3 py-1.5 text-xs rounded-lg border transition-colors ${
                      reportErrorType === type
                        ? 'border-blue-500 bg-blue-950/40 text-blue-400'
                        : 'border-gray-700 bg-gray-800 text-gray-400 hover:border-gray-600'
                    }`}
                  >
                    {type === 'factual' ? 'Factual Error' : type === 'scoring' ? 'Scoring Error' : 'Safety Concern'}
                  </button>
                ))}
              </div>
            </div>

            <div className="mb-4">
              <label className="block text-sm text-gray-300 mb-1.5">What was incorrect?</label>
              <textarea
                value={reportComment}
                onChange={(e) => setReportComment(e.target.value)}
                placeholder="Describe the issue..."
                rows={3}
                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              />
            </div>

            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setReportModal(null)}
                disabled={reportSubmitting}
                className="px-4 py-2 text-sm text-gray-400 hover:text-white transition-colors"
              >
                Cancel
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
                className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg font-medium transition-colors"
              >
                {reportSubmitting ? 'Submitting...' : 'Submit Report'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
