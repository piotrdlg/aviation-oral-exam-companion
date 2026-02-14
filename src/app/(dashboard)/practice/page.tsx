'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import SessionConfig, { type SessionConfigData } from './components/SessionConfig';
import type { PlannerState, SessionConfig as SessionConfigType } from '@/types/database';

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
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [exchangeCount, setExchangeCount] = useState(0);
  const [coveredTaskIds, setCoveredTaskIds] = useState<string[]>([]);
  const [currentElement, setCurrentElement] = useState<string | null>(null);
  const [plannerState, setPlannerState] = useState<PlannerState | null>(null);
  const [sessionConfig, setSessionConfig] = useState<SessionConfigType | null>(null);
  // Track per-task assessment scores (ref avoids stale closures in fire-and-forget fetches)
  const taskScoresRef = useRef<Record<string, { score: 'satisfactory' | 'unsatisfactory' | 'partial'; attempts: number }>>({});
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const voiceEnabledRef = useRef(false);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Keep ref in sync so speakText never has stale closure
  useEffect(() => {
    voiceEnabledRef.current = voiceEnabled;
  }, [voiceEnabled]);

  // Play examiner's message via TTS
  const speakText = useCallback(async (text: string) => {
    if (!voiceEnabledRef.current) return;
    setIsSpeaking(true);
    try {
      const res = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });
      if (!res.ok) throw new Error('TTS failed');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      audioRef.current = audio;
      audio.onended = () => {
        setIsSpeaking(false);
        URL.revokeObjectURL(url);
      };
      audio.onerror = () => {
        setIsSpeaking(false);
        URL.revokeObjectURL(url);
      };
      await audio.play();
    } catch (err) {
      console.error('TTS playback error:', err);
      setIsSpeaking(false);
    }
  }, []);

  // Start speech recognition
  function startListening() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setError('Speech recognition not supported in this browser. Use Chrome.');
      return;
    }

    // Stop any playing audio first
    if (audioRef.current) {
      audioRef.current.pause();
      setIsSpeaking(false);
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = 'en-US';

    recognition.onstart = () => setIsListening(true);

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let interimTranscript = '';
      let finalTranscript = '';
      for (let i = 0; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) {
          finalTranscript += result[0].transcript;
        } else {
          interimTranscript += result[0].transcript;
        }
      }
      // Show interim results while speaking, final result when done
      setInput(finalTranscript || interimTranscript);
    };

    recognition.onend = () => {
      setIsListening(false);
    };

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      setIsListening(false);
      if (event.error !== 'no-speech') {
        console.error('Speech recognition error:', event.error);
      }
    };

    recognitionRef.current = recognition;
    recognition.start();
  }

  function stopListening() {
    recognitionRef.current?.stop();
    setIsListening(false);
  }

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
      studyMode: configData.studyMode,
      difficulty: configData.difficulty,
      selectedAreas: configData.selectedAreas,
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
      setMessages([{ role: 'examiner', text: examinerMsg }]);

      // Speak the opening question if voice is enabled
      if (configData.voiceEnabled) {
        speakText(examinerMsg);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start session');
    } finally {
      setLoading(false);
    }
  }

  async function sendAnswer() {
    if (!input.trim() || !taskData || loading) return;

    const studentAnswer = input.trim();
    setInput('');
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
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to get response');

      const examinerMsg = data.examinerMessage;
      const newExchangeCount = exchangeCount + 1;
      setExchangeCount(newExchangeCount);

      // Attach assessment and sources to the student's message for display
      if (data.assessment) {
        setMessages((prev) => {
          const updated = [...prev];
          // Find the last student message and attach assessment + sources
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

      // Track assessment score per task
      if (data.assessment?.score && data.taskId) {
        const prev = taskScoresRef.current[data.taskId];
        taskScoresRef.current[data.taskId] = {
          score: data.assessment.score,
          attempts: (prev?.attempts || 0) + 1,
        };
      }

      // Accumulate covered task IDs
      if (data.taskId) {
        setCoveredTaskIds((prev) =>
          prev.includes(data.taskId) ? prev : [...prev, data.taskId]
        );
      }

      // Update session in database
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

      if (voiceEnabled) {
        speakText(examinerMsg);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to get response');
    } finally {
      setLoading(false);
    }
  }

  async function endSession() {
    if (audioRef.current) {
      audioRef.current.pause();
    }
    recognitionRef.current?.stop();

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
    setIsListening(false);
    setIsSpeaking(false);
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
            <span className="text-xs text-green-400">Voice On</span>
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

      {error && (
        <div className="bg-red-900/30 border border-red-800 rounded-lg p-3 mb-4 text-red-300 text-sm flex items-center justify-between">
          <span>{error}</span>
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
              className={`max-w-[85%] rounded-xl px-4 py-3 ${
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

              {/* Source citations */}
              {msg.sources && msg.sources.length > 0 && (
                <details className="mt-2 pt-2 border-t border-white/10">
                  <summary className="text-xs text-blue-300 cursor-pointer hover:text-blue-200">
                    Show FAA Sources ({msg.sources.length})
                  </summary>
                  <div className="mt-1.5 space-y-1">
                    {msg.sources.map((src, j) => (
                      <div key={j} className="text-xs bg-black/20 rounded p-2">
                        <p className="font-medium text-blue-200">
                          {src.doc_abbreviation.toUpperCase()}
                          {src.heading ? ` — ${src.heading}` : ''}
                          {src.page_start ? ` (p.${src.page_start})` : ''}
                        </p>
                        <p className="opacity-60 mt-0.5 line-clamp-2">{src.content.slice(0, 200)}...</p>
                      </div>
                    ))}
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
            onClick={isListening ? stopListening : startListening}
            disabled={loading || isSpeaking}
            className={`px-4 py-3 rounded-xl font-medium transition-colors ${
              isListening
                ? 'bg-red-600 hover:bg-red-700 text-white animate-pulse'
                : 'bg-gray-700 hover:bg-gray-600 text-gray-200'
            } disabled:opacity-50`}
            title={isListening ? 'Stop recording' : 'Start recording'}
          >
            {isListening ? '⏹' : '🎤'}
          </button>
        )}
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && sendAnswer()}
          placeholder={isListening ? 'Listening...' : 'Type your answer...'}
          disabled={loading}
          className="flex-1 px-4 py-3 bg-gray-800 border border-gray-700 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
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
