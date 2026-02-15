'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import SessionConfig, { type SessionConfigData } from './components/SessionConfig';
import type { PlannerState, SessionConfig as SessionConfigType } from '@/types/database';
import type { VoiceTier } from '@/lib/voice/types';
import { useVoiceProvider } from '@/hooks/useVoiceProvider';

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

interface Message {
  role: 'examiner' | 'student';
  text: string;
  assessment?: Assessment;
  sources?: Source[];
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
  const [tier, setTier] = useState<VoiceTier>('ground_school');
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

  // Fetch user's tier on mount
  useEffect(() => {
    fetch('/api/user/tier')
      .then((res) => res.ok ? res.json() : null)
      .then((data) => { if (data?.tier) setTier(data.tier); })
      .catch(() => {}); // Fallback to ground_school
  }, []);

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

      const res = await fetch('/api/exam', {
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
      const res = await fetch('/api/exam', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'respond',
          taskData,
          history: messages,
          studentAnswer,
          sessionId,
          stream: true,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
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

  if (!sessionActive) {
    return (
      <div className="max-w-2xl mx-auto">
        <h1 className="text-2xl font-bold text-white mb-2">Practice Session</h1>
        <p className="text-gray-400 mb-6">
          Start an oral exam practice session. The AI examiner will ask you questions
          based on the FAA Private Pilot ACS.
        </p>

        <div className="bg-amber-900/20 border border-amber-800/50 rounded-lg p-3 mb-6 text-amber-200 text-xs leading-relaxed">
          For study purposes only. This is not a substitute for instruction from a certificated
          flight instructor (CFI) or an actual DPE checkride. Always verify information against
          current FAA publications.
        </div>

        <SessionConfig onStart={startSession} loading={loading} />
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
              Voice On {tier !== 'ground_school' && `(${tier === 'checkride_prep' ? 'Tier 2' : 'Tier 3'})`}
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
              <p className="text-xs font-medium mb-1 opacity-60">
                {msg.role === 'examiner' ? 'DPE Examiner' : 'You'}
              </p>
              <p className="text-sm leading-relaxed whitespace-pre-wrap">{msg.text}</p>

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
    </div>
  );
}
