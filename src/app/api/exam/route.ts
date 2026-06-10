import { NextRequest, NextResponse } from 'next/server';
import { after } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import {
  pickStartingTask,
  pickNextTask,
  generateExaminerTurn,
  generateExaminerTurnStreaming,
  assessAnswer,
  fetchRagContext,
  loadPromptFromDB,
  type ExamMessage,
  type AssessmentData,
  type LlmUsage,
} from '@/lib/exam-engine';
import { computeExamResult } from '@/lib/exam-logic';
import { buildTransitionHint } from '@/lib/transition-explanation';
import { computeExamResultV2, v2ToV1Grade } from '@/lib/exam-result';
import {
  initPlanner,
  advancePlanner,
  useBonusQuestion,
  creditMentionedElements,
  shouldAdvanceElement,
  type ExamPlanV1,
  type DepthDifficultyContract,
} from '@/lib/exam-planner';
import {
  buildDepthDifficultyContract,
  formatContractForExaminer,
  formatContractForAssessment,
  contractSummary,
} from '@/lib/difficulty-contract';
import { getSystemConfig } from '@/lib/system-config';
import { checkKillSwitch } from '@/lib/kill-switch';
import { requireSafeDbTarget } from '@/lib/app-env';
import { getUserTier } from '@/lib/voice/tier-lookup';
import { enforceOneActiveExam, getSessionTokenHash } from '@/lib/session-enforcement';
import { createTimingContext, writeTimings } from '@/lib/timing';
import {
  resolvePersonaKey,
  getPersonaContract,
  formatPersonaForExaminer,
  personaSummary,
} from '@/lib/persona-contract';
import {
  resolveExaminerProfile,
  formatProfilePersonaSection,
  examinerProfileSummary,
} from '@/lib/examiner-profile';
import type { SessionConfig, PlannerState } from '@/types/database';
import type { AssetSelectionContext, SelectedAsset } from '@/lib/asset-selector';

// Service-role client for usage logging + config lookups (bypasses RLS)
const serviceSupabase = createServiceClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/**
 * Log LLM usage to usage_logs (non-blocking).
 * Called after each Anthropic API call for cost tracking and monitoring.
 */
function logLlmUsage(
  userId: string,
  usage: LlmUsage | undefined,
  tier: string,
  sessionId?: string,
  metadata?: Record<string, unknown>
): void {
  if (!usage) return;
  serviceSupabase
    .from('usage_logs')
    .insert({
      user_id: userId,
      session_id: sessionId ?? null,
      event_type: 'llm_request',
      provider: 'anthropic',
      tier,
      quantity: usage.input_tokens + usage.output_tokens,
      latency_ms: usage.latency_ms,
      status: 'ok',
      metadata: {
        input_tokens: usage.input_tokens,
        output_tokens: usage.output_tokens,
        ...metadata,
      },
    })
    .then(({ error }) => {
      if (error) console.error('LLM usage log error:', error.message);
    });
}

/**
 * Write element_attempts rows based on assessment element codes.
 * Follows the invariant: student transcript -> assessment -> element_attempts
 */
async function writeElementAttempts(
  supabase: Awaited<ReturnType<typeof createClient>>,
  sessionId: string,
  transcriptId: string,
  assessment: AssessmentData
) {
  // W2.2: 'ungraded' assessments (infrastructure failures) never reach
  // element_attempts — they carry no signal about the student.
  if (assessment.score === 'ungraded') return;

  // Primary attempt is written in its OWN statement so a constraint
  // violation on a mention can never destroy the scored attempt (bug 6).
  if (assessment.primary_element) {
    const { error } = await supabase.from('element_attempts').insert({
      session_id: sessionId,
      transcript_id: transcriptId,
      element_code: assessment.primary_element,
      tag_type: 'attempt',
      score: assessment.score,
      is_primary: true,
      confidence: null,
    });
    if (error) {
      console.error('Error writing primary element_attempt:', error.message);
    }
  }

  // Mentioned elements as unscored mentions (already validated/deduped by
  // assessAnswer, but the separation keeps failures independent regardless)
  const mentionRows = assessment.mentioned_elements
    .filter((code) => code !== assessment.primary_element)
    .map((code) => ({
      session_id: sessionId,
      transcript_id: transcriptId,
      element_code: code,
      tag_type: 'mention' as const,
      score: null,
      is_primary: false,
      confidence: null,
    }));

  if (mentionRows.length > 0) {
    const { error } = await supabase.from('element_attempts').insert(mentionRows);
    if (error) {
      console.error('Error writing element mentions:', error.message);
    }
  }
}

/**
 * GET /api/exam?action=list-tasks — return all ACS tasks for the task picker.
 */
// Allow up to 60s for streaming responses (examiner generation + assessment)
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action');

    if (action === 'list-tasks') {
      const rating = searchParams.get('rating') || 'private';
      const { data, error } = await supabase
        .from('acs_tasks')
        .select('id, area, task, applicable_classes')
        .eq('rating', rating)
        .order('id');

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      return NextResponse.json({ tasks: data || [] });
    }

    // Weak-area summary with grounded citations
    if (action === 'summary') {
      const sessionId = searchParams.get('sessionId');
      if (!sessionId) {
        return NextResponse.json({ error: 'sessionId required' }, { status: 400 });
      }

      // Verify user owns this session
      const { data: session } = await supabase
        .from('exam_sessions')
        .select('id')
        .eq('id', sessionId)
        .eq('user_id', user.id)
        .single();

      if (!session) {
        return NextResponse.json({ error: 'Session not found' }, { status: 404 });
      }

      const { buildWeakAreaReport } = await import('@/lib/weak-area-report');
      const report = await buildWeakAreaReport(sessionId);

      if (!report) {
        return NextResponse.json(
          { error: 'No ExamResultV2 available for this session. Was the exam completed?' },
          { status: 404 }
        );
      }

      // Fire-and-forget: persist quality_metrics + PostHog events
      if (report.quality_metrics) {
        after(async () => {
          try {
            const svc = createServiceClient(
              process.env.NEXT_PUBLIC_SUPABASE_URL!,
              process.env.SUPABASE_SERVICE_ROLE_KEY!,
            );
            const { data: current } = await svc
              .from('exam_sessions')
              .select('metadata')
              .eq('id', sessionId)
              .single();
            const meta = (current?.metadata as Record<string, unknown>) || {};
            await svc
              .from('exam_sessions')
              .update({ metadata: { ...meta, grounding_quality_metrics: report.quality_metrics } })
              .eq('id', sessionId);
          } catch (err) {
            console.error('Failed to persist grounding quality_metrics:', err);
          }

          // PostHog server-side events
          try {
            const { captureServerEvent } = await import('@/lib/posthog-server');
            const qm = report.quality_metrics!;
            captureServerEvent(user.id, 'weak_area_report_generated', {
              session_id: sessionId,
              candidate_count: qm.candidate_count,
              returned_count: qm.returned_count,
              filtered_out_count: qm.filtered_out_count,
              avg_relevance_score: qm.avg_relevance_score,
              low_confidence_count: qm.low_confidence_count,
              insufficient_sources_count: qm.insufficient_sources_count,
              top_doc_types: qm.top_doc_types,
              weak_element_count: report.stats.total_weak,
              grounded_count: report.stats.grounded_count,
            });

            if (qm.low_confidence_count > 0 || qm.insufficient_sources_count > 0) {
              captureServerEvent(user.id, 'weak_area_report_low_confidence', {
                session_id: sessionId,
                low_confidence_count: qm.low_confidence_count,
                insufficient_sources_count: qm.insufficient_sources_count,
                weak_element_count: report.stats.total_weak,
              });
            }
          } catch (err) {
            console.error('PostHog event capture failed:', err);
          }
        });
      }

      return NextResponse.json({ report });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error) {
    console.error('Exam GET API error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  // Flush PostHog buffer before the serverless function exits
  after(async () => {
    const { flushPostHog } = await import('@/lib/posthog-server');
    await flushPostHog();
  });

  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Kill switch check: fetch config + tier, block if Anthropic or tier is disabled
    const [config, tier] = await Promise.all([
      getSystemConfig(serviceSupabase),
      getUserTier(serviceSupabase, user.id),
    ]);

    const killResult = checkKillSwitch(config, 'anthropic', tier);
    if (killResult.blocked) {
      return NextResponse.json(
        { error: 'service_unavailable', reason: killResult.reason },
        { status: 503 }
      );
    }

    requireSafeDbTarget(config, 'exam-api');

    // Latency instrumentation: record spans for key operations
    const timing = createTimingContext();
    timing.start('prechecks');

    const body = await request.json();
    const { action, history, taskData, studentAnswer, coveredTaskIds, sessionId, stream, sessionConfig, plannerState: clientPlannerState, chunkedResponse, examPlan: clientExamPlan } = body as {
      action: 'start' | 'respond' | 'next-task' | 'resume-current';
      history?: ExamMessage[];
      taskData?: Awaited<ReturnType<typeof pickStartingTask>>;
      studentAnswer?: string;
      coveredTaskIds?: string[];
      sessionId?: string;
      stream?: boolean;
      sessionConfig?: SessionConfig;
      plannerState?: PlannerState;
      chunkedResponse?: boolean;
      examPlan?: ExamPlanV1;
    };

    // CRITICAL: Verify session ownership (W1.3 IDOR fix)
    // Prevent authenticated users from writing to other users' exam sessions.
    // Use RLS-scoped client to verify ownership before any service-role writes.
    // W2.1: the same query loads metadata — exam_sessions.metadata is the
    // single source of truth for plannerState / examPlan / sessionConfig /
    // taskData. Client-supplied copies are accepted for backward compat but
    // IGNORED whenever server state exists.
    let serverMeta: Record<string, unknown> = {};
    if (sessionId) {
      const { data: sessionOwnershipCheck } = await supabase
        .from('exam_sessions')
        .select('id, metadata')
        .eq('id', sessionId)
        .eq('user_id', user.id)
        .single();

      if (!sessionOwnershipCheck) {
        return NextResponse.json({ error: 'Session not found' }, { status: 404 });
      }
      serverMeta = (sessionOwnershipCheck.metadata as Record<string, unknown>) || {};
    }
    const srvPlannerState = (serverMeta.plannerState as PlannerState | undefined) ?? clientPlannerState;
    const srvExamPlan = (serverMeta.examPlan as ExamPlanV1 | undefined) ?? clientExamPlan;
    const srvSessionConfig = (serverMeta.sessionConfig as SessionConfig | undefined) ?? sessionConfig;
    const srvTaskData = (serverMeta.taskData as typeof taskData) ?? taskData;

    // Parallel pre-checks: profile fetch + session enforcement are independent.
    // Persona resolution depends on the profile result but is fast (cached config).
    const profilePromise = serviceSupabase
      .from('user_profiles')
      .select('display_name, preferred_voice, examiner_profile')
      .eq('user_id', user.id)
      .single();

    const enforcementPromise = (async () => {
      if (!sessionId) return { rejected: false, pausedSessionId: undefined as string | undefined };
      try {
        const { data: { session: authSession } } = await supabase.auth.getSession();
        if (authSession?.access_token) {
          const tokenHash = getSessionTokenHash(authSession);
          return enforceOneActiveExam(serviceSupabase, user.id, sessionId, tokenHash, action);
        }
      } catch (err) {
        console.error('Session enforcement error:', err);
      }
      return { rejected: false, pausedSessionId: undefined as string | undefined };
    })();

    const [{ data: examUserProfile }, enforcementResult] = await Promise.all([
      profilePromise,
      enforcementPromise,
    ]);

    if (enforcementResult.rejected) {
      return NextResponse.json(
        { error: 'session_superseded', message: 'This exam session has been superseded by another device. Please end this session.' },
        { status: 409 }
      );
    }
    const enforcementPausedSessionId = enforcementResult.pausedSessionId;

    // Examiner Profile resolution (Phase 12 — ExaminerProfileV1)
    // Priority: sessionConfig.examinerProfileKey > DB examiner_profile > DB preferred_voice > legacy persona > default
    const { profile: resolvedProfile, source: profileSource } = resolveExaminerProfile({
      savedProfile: sessionConfig?.examinerProfileKey || examUserProfile?.examiner_profile || undefined,
      savedVoice: examUserProfile?.preferred_voice || undefined,
      savedPersona: sessionConfig?.persona || undefined,
    });
    const resolvedPersonaKey = resolvedProfile.personaKey;
    const personaContract = getPersonaContract(resolvedPersonaKey);
    const personaSection = formatProfilePersonaSection(resolvedProfile);
    const studentName = examUserProfile?.display_name || undefined;

    timing.end('prechecks');

    if (action === 'start') {
      // Track last active usage
      const { error: profileErr } = await serviceSupabase
        .from('user_profiles')
        .update({ last_login_at: new Date().toISOString() })
        .eq('user_id', user.id);
      if (profileErr) console.error('last_login_at update error:', profileErr.message);

      // If session config provided, use the planner for element-level scheduling
      if (sessionConfig) {
        const plannerResult = await initPlanner(sessionConfig, user.id);
        if (!plannerResult) {
          return NextResponse.json(
            { error: 'No elements found for your session configuration.' },
            { status: 500 }
          );
        }

        const rating = sessionConfig.rating || 'private';

        // Prompt audit: capture which prompt version powers this session
        const { versionId: examinerVersionId } = await loadPromptFromDB(
          serviceSupabase, 'examiner_system', rating, sessionConfig.studyMode, sessionConfig.difficulty
        );
        const examinerProfileKey = resolvedProfile.profileKey;

        // Format depth & difficulty contract for examiner prompt (Phase 10)
        const examinerContractSection = plannerResult.depthDifficultyContract
          ? formatContractForExaminer(plannerResult.depthDifficultyContract)
          : undefined;

        const turn = await generateExaminerTurn(
          plannerResult.task, [], plannerResult.difficulty, sessionConfig.aircraftClass, undefined, rating, sessionConfig.studyMode, personaSection, studentName, undefined, examinerContractSection
        );

        // Log LLM usage (non-blocking)
        logLlmUsage(user.id, turn.usage, tier, sessionId, { action: 'start', call: 'generateExaminerTurn' });

        // Persist examiner opening turn to transcript
        if (sessionId) {
          const { error: openErr } = await supabase.from('session_transcripts').insert({
            session_id: sessionId,
            exchange_number: 0,
            role: 'examiner',
            text: turn.examinerMessage,
          });
          if (openErr) console.error('Opening examiner transcript write error:', openErr.message);
        }

        // Persist planner state + session config + taskData + examPlan + fingerprintMeta + contract + persona + promptTrace to metadata for resume
        // Merge over existing metadata (e.g. voice_enabled set at session creation) — W2.1.
        if (sessionId) {
          const { error: metaErr } = await serviceSupabase
            .from('exam_sessions')
            .update({ metadata: {
              ...serverMeta,
              advanceDue: false,
              plannerState: plannerResult.plannerState,
              sessionConfig,
              taskData: plannerResult.task,
              examPlan: plannerResult.examPlan,
              ...(plannerResult.fingerprintMeta ? { fingerprintMeta: plannerResult.fingerprintMeta } : {}),
              ...(plannerResult.depthDifficultyContract ? { depthDifficultyContract: plannerResult.depthDifficultyContract } : {}),
              persona: { key: resolvedPersonaKey, label: personaContract.label, version: personaContract.version },
              promptTrace: {
                examiner_prompt_version_id: examinerVersionId,
                source: examinerVersionId ? 'db' : 'fallback',
                rating: sessionConfig.rating,
                study_mode: sessionConfig.studyMode,
                difficulty: sessionConfig.difficulty,
                profile_key: examinerProfileKey,
                timestamp: new Date().toISOString(),
              },
            } })
            .eq('id', sessionId);
          if (metaErr) console.error('Planner state persist error:', metaErr.message);
        }

        // Fire PostHog event for flow quality monitoring (Phase 9, non-blocking)
        if (plannerResult.fingerprintMeta && sessionConfig.studyMode === 'cross_acs') {
          after(async () => {
            const { captureServerEvent } = await import('@/lib/posthog-server');
            captureServerEvent(user.id, 'flow_fingerprints_loaded', {
              session_id: sessionId,
              source: plannerResult.fingerprintMeta!.source,
              fingerprint_count: plannerResult.fingerprintMeta!.fingerprintCount,
              element_count: plannerResult.fingerprintMeta!.elementCount,
              coverage_pct: plannerResult.fingerprintMeta!.coveragePercent,
              unique_slugs: plannerResult.fingerprintMeta!.uniqueSlugs,
              rating: sessionConfig.rating,
            });
          });
        }

        // Fire PostHog event for depth contract monitoring (Phase 10, non-blocking)
        if (plannerResult.depthDifficultyContract) {
          after(async () => {
            const { captureServerEvent } = await import('@/lib/posthog-server');
            captureServerEvent(user.id, 'depth_contract_applied', {
              session_id: sessionId,
              ...contractSummary(plannerResult.depthDifficultyContract!),
              element_code: plannerResult.elementCode,
              study_mode: sessionConfig.studyMode,
              action: 'start',
            });
          });
        }

        // Fire PostHog event for examiner profile monitoring (Phase 12, non-blocking)
        after(async () => {
          const { captureServerEvent } = await import('@/lib/posthog-server');
          captureServerEvent(user.id, 'examiner_profile_resolved', {
            session_id: sessionId,
            ...examinerProfileSummary(resolvedProfile, profileSource, studentName),
            rating: sessionConfig.rating,
            difficulty: sessionConfig.difficulty,
            study_mode: sessionConfig.studyMode,
            action: 'start',
          });
        });

        // Launch funnel: exam session started (Phase 18)
        after(async () => {
          const { captureServerEvent } = await import('@/lib/posthog-server');
          captureServerEvent(user.id, 'exam_session_started', {
            session_id: sessionId,
            rating: sessionConfig.rating,
            study_mode: sessionConfig.studyMode,
            difficulty: sessionConfig.difficulty,
            tier,
          });
        });

        return NextResponse.json({
          taskId: plannerResult.task.id,
          taskData: plannerResult.task,
          examinerMessage: turn.examinerMessage,
          elementCode: plannerResult.elementCode,
          plannerState: plannerResult.plannerState,
          examPlan: plannerResult.examPlan,
          ...(enforcementPausedSessionId ? { pausedSessionId: enforcementPausedSessionId } : {}),
        });
      }

      // Fallback: random task selection (legacy mode, no class filtering)
      const rating = (body.sessionConfig as SessionConfig | undefined)?.rating || 'private';
      const task = await pickStartingTask([], undefined, rating);
      if (!task) {
        return NextResponse.json(
          { error: 'No ACS tasks found. Check database seed.' },
          { status: 500 }
        );
      }

      // Support streaming for start — no chunkedResponse here intentionally:
      // the opening examiner question has no student feedback to split into 3 chunks.
      if (stream) {
        const { stream: readableStream, fullTextPromise: startTextPromise } = await generateExaminerTurnStreaming(task, [], undefined, undefined, undefined, undefined, undefined, undefined, undefined, personaSection, studentName);

        after(async () => {
          try {
            const fullText = await startTextPromise;
            if (sessionId && fullText) {
              const { error } = await serviceSupabase.from('session_transcripts').insert({
                session_id: sessionId,
                exchange_number: 0,
                role: 'examiner',
                text: fullText,
              });
              if (error) console.error('Start examiner transcript write error:', error.message);
            }
          } catch (err) {
            console.error('Start transcript write error:', err);
          }
        });

        return new Response(readableStream, {
          headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
            'X-Task-Id': task.id,
            'X-Task-Data': Buffer.from(JSON.stringify(task)).toString('base64'),
          },
        });
      }

      const turn = await generateExaminerTurn(task, [], undefined, undefined, undefined, undefined, undefined, personaSection, studentName);

      // Log LLM usage (non-blocking)
      logLlmUsage(user.id, turn.usage, tier, sessionId, { action: 'start', call: 'generateExaminerTurn' });

      // Persist examiner opening turn to transcript
      if (sessionId) {
        const { error: openErr } = await supabase.from('session_transcripts').insert({
          session_id: sessionId,
          exchange_number: 0,
          role: 'examiner',
          text: turn.examinerMessage,
        });
        if (openErr) console.error('Opening examiner transcript write error:', openErr.message);
      }

      return NextResponse.json({
        taskId: task.id,
        taskData: task,
        examinerMessage: turn.examinerMessage,
        ...(enforcementPausedSessionId ? { pausedSessionId: enforcementPausedSessionId } : {}),
      });
    }

    if (action === 'respond') {
      // W2.1: server-owned state — the task being answered is the server's
      // current task; the current element is the most recently asked one
      // (plannerState.recent last), NOT queue[cursor] which is the NEXT element.
      const respondTask = srvTaskData;
      if (!respondTask || !history || !studentAnswer) {
        return NextResponse.json(
          { error: 'Missing taskData, history, or studentAnswer' },
          { status: 400 }
        );
      }
      const currentElementCode = srvPlannerState?.recent?.length
        ? srvPlannerState.recent[srvPlannerState.recent.length - 1]
        : undefined;

      // Server-side advancement decision (W2.1): advance to the next element
      // when the answer is satisfactory, or when the element has used up its
      // follow-up budget. The decision rides on the assessment object so the
      // SSE stream delivers it to the client, which then calls next-task.
      const decideAdvance = (score: AssessmentData['score']): boolean =>
        shouldAdvanceElement(score, srvExamPlan, srvPlannerState);

      timing.start('exchange.total');

      // Calculate exchange number from history length
      const exchangeNumber = Math.floor(history.length / 2) + 1;

      // Step 1: Persist student transcript + fetch RAG in parallel
      timing.start('rag.total');
      const [studentTranscriptResult, rag] = await Promise.all([
        sessionId
          ? supabase
              .from('session_transcripts')
              .insert({
                session_id: sessionId,
                exchange_number: exchangeNumber,
                role: 'student',
                text: studentAnswer,
              })
              .select('id')
              .single()
          : Promise.resolve({ data: null }),
        fetchRagContext(respondTask, history, studentAnswer, 5, {
          systemConfig: config,
          timing,
          elementCode: currentElementCode,
        }),
      ]);
      const studentTranscriptId = studentTranscriptResult.data?.id ?? null;
      if (!studentTranscriptId && sessionId) {
        const insertErr = 'error' in studentTranscriptResult ? (studentTranscriptResult as { error?: { message?: string } }).error?.message : 'unknown';
        console.error('Student transcript insert failed:', insertErr, '— assessment, element_attempts, and citations will NOT be persisted for this exchange');
      }

      timing.end('rag.total');

      // Step 2: Build updated history for examiner
      const updatedHistory: ExamMessage[] = [
        ...history,
        { role: 'student', text: studentAnswer },
      ];

      // Step 3: Run assessment + examiner generation IN PARALLEL (key optimization)
      // The examiner's next question depends on history, NOT on the assessment result.
      const respondConfig = srvSessionConfig;
      const respondRating = respondConfig?.rating || 'private';
      // Pass difficulty as-is (including 'mixed') for prompt selection
      const respondDifficulty = respondConfig?.difficulty || undefined;

      // Build depth & difficulty contract sections for examiner + assessment (Phase 10)
      let respondExaminerContract: string | undefined;
      let respondGradingContract: string | undefined;
      if (respondConfig) {
        const elementType = currentElementCode?.match(/\.(K|R|S)\d+$/)?.[1] === 'R' ? 'risk' as const
          : currentElementCode?.match(/\.(K|R|S)\d+$/)?.[1] === 'S' ? 'skill' as const
          : 'knowledge' as const;
        const respondContract = buildDepthDifficultyContract(
          respondRating, respondDifficulty || 'medium', elementType
        );
        respondExaminerContract = formatContractForExaminer(respondContract);
        respondGradingContract = formatContractForAssessment(respondContract);
      }

      if (stream) {
        // Streaming path: start assessment in background, stream examiner immediately.
        // The assessment is decorated with the server's advancement decision so the
        // engine's `{assessment}` SSE event carries it to the client (W2.1).
        timing.start('llm.assessment.total');
        timing.start('llm.examiner.total');
        timing.start('llm.examiner.ttft');
        const assessmentPromise: Promise<AssessmentData & { advance?: boolean }> =
          assessAnswer(respondTask, history, studentAnswer, rag, rag.ragImages, respondRating, respondConfig?.studyMode, respondDifficulty, respondGradingContract)
            .then(a => {
              timing.end('llm.assessment.total');
              return { ...a, advance: decideAdvance(a.score) };
            });

        // Build semantic asset selection context (Phase 13)
        // Extract area roman numeral from task ID (e.g., "PA.I.A" → "I", "IR.XI.B" → "XI")
        const areaRoman = respondTask.id?.split('.')?.[1] || '';
        const assetContext: AssetSelectionContext = {
          acsArea: areaRoman,
          acsTaskCode: respondTask.id || '',
          elementCode: currentElementCode,
          rating: respondRating,
          questionText: updatedHistory[updatedHistory.length - 1]?.text || '',
          difficulty: respondDifficulty,
        };

        let selectedAssetData: SelectedAsset | null = null;
        const onAssetSelected = (asset: SelectedAsset) => { selectedAssetData = asset; };

        const { stream: readableStream, fullTextPromise } = await generateExaminerTurnStreaming(
          respondTask, updatedHistory, respondDifficulty, respondConfig?.aircraftClass, rag, assessmentPromise, undefined, respondRating, respondConfig?.studyMode, personaSection, studentName, chunkedResponse, timing, respondExaminerContract, assetContext, onAssetSelected
        );

        // Use after() to ensure ALL DB writes complete even after stream closes.
        // This keeps the serverless function alive until all writes finish.
        after(async () => {
          // W2.2 (bug 8): the examiner transcript persists INDEPENDENTLY of
          // the assessment — an Anthropic failure on assessAnswer must never
          // lose the examiner turn the client already displayed.
          try {
            const examinerFullText = await fullTextPromise;
            if (sessionId && examinerFullText) {
              const { error } = await serviceSupabase.from('session_transcripts').insert({
                session_id: sessionId,
                exchange_number: exchangeNumber,
                role: 'examiner',
                text: examinerFullText,
              });
              if (error) console.error('Examiner transcript write error:', error.message);
            }
          } catch (err) {
            console.error('Examiner transcript persist error:', err);
          }

          try {
            const assessment = await assessmentPromise;

            // Log assessment LLM usage
            logLlmUsage(user.id, assessment.usage, tier, sessionId, { action: 'respond', call: 'assessAnswer' });

            if (studentTranscriptId && assessment) {
              // 2. Assessment update on student transcript
              const { error: assessErr } = await serviceSupabase
                .from('session_transcripts')
                .update({ assessment })
                .eq('id', studentTranscriptId);
              if (assessErr) console.error('Assessment update error:', assessErr.message);

              // 3. Element attempts
              if (sessionId) {
                await writeElementAttempts(supabase, sessionId, studentTranscriptId, assessment);
              }

              // 4. Citations
              if (assessment.rag_chunks && assessment.rag_chunks.length > 0) {
                const citations = assessment.rag_chunks.map((chunk, idx) => ({
                  transcript_id: studentTranscriptId,
                  chunk_id: chunk.id,
                  rank: idx + 1,
                  score: chunk.score,
                  snippet: chunk.content.slice(0, 300),
                }));
                const { error: citErr } = await serviceSupabase
                  .from('transcript_citations')
                  .insert(citations);
                if (citErr) console.error('Citation write error:', citErr.message);
              }
            }

            // 5. Server-side plan + advancement bookkeeping (W2.1) — streaming path.
            // Read-merge-write so concurrent metadata writers are never clobbered.
            if (srvExamPlan && srvPlannerState && currentElementCode && assessment && sessionId) {
              let streamPlan = srvExamPlan;
              // W2.3 (bug 13): mention credit ONLY on satisfactory answers —
              // topics brushed in a wrong answer are not covered.
              if (assessment.score === 'satisfactory' && assessment.mentioned_elements.length > 0) {
                streamPlan = creditMentionedElements(streamPlan, assessment.mentioned_elements);
              }
              if (assessment.score === 'unsatisfactory') {
                const bonusPlan = useBonusQuestion(streamPlan);
                if (bonusPlan) streamPlan = bonusPlan;
              }
              const advance = (assessment as AssessmentData & { advance?: boolean }).advance === true;
              // Staying on the element consumes a follow-up attempt, so the
              // next non-satisfactory answer advances (canFollowUp sees it).
              const updatedPlanner: PlannerState = (advance || assessment.score === 'ungraded') ? srvPlannerState : {
                ...srvPlannerState,
                attempts: {
                  ...srvPlannerState.attempts,
                  [currentElementCode]: (srvPlannerState.attempts?.[currentElementCode] || 1) + 1,
                },
                version: (srvPlannerState.version || 0) + 1,
              };
              const { data: freshRow } = await serviceSupabase
                .from('exam_sessions')
                .select('metadata')
                .eq('id', sessionId)
                .single();
              const freshMeta = (freshRow?.metadata as Record<string, unknown>) || {};
              const { error: metaErr } = await serviceSupabase
                .from('exam_sessions')
                .update({
                  metadata: {
                    ...freshMeta,
                    plannerState: updatedPlanner,
                    examPlan: streamPlan,
                    advanceDue: advance,
                  },
                })
                .eq('id', sessionId);
              if (metaErr) console.error('ExamPlan stream persist error:', metaErr.message);
            }
          } catch (err) {
            console.error('Background DB write error:', err);
          }

          // Fire PostHog event for multimodal asset selection (Phase 13, non-blocking)
          if (selectedAssetData) {
            try {
              const { captureServerEvent } = await import('@/lib/posthog-server');
              captureServerEvent(user.id, 'multimodal_asset_selected', {
                session_id: sessionId,
                element_code: currentElementCode,
                rating: respondRating,
                difficulty: respondDifficulty,
                total_candidates: selectedAssetData.totalCandidates,
                images_shown: selectedAssetData.images.length,
                text_cards_shown: selectedAssetData.textCards.length,
                top_image_score: selectedAssetData.images[0]?.totalScore ?? null,
                threshold: selectedAssetData.thresholdApplied,
              });
            } catch (posthogErr) {
              console.error('PostHog multimodal event error:', posthogErr);
            }
          }

          // Write latency instrumentation (non-blocking, best-effort)
          if (sessionId) {
            await writeTimings(serviceSupabase, sessionId, exchangeNumber, timing);
          }
        });

        return new Response(readableStream, {
          headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
            'X-Task-Id': respondTask.id,
          },
        });
      }

      // Non-streaming path: run both in parallel, wait for both
      timing.start('llm.assessment.total');
      timing.start('llm.examiner.total');
      const [assessment, turn] = await Promise.all([
        assessAnswer(respondTask, history, studentAnswer, rag, rag.ragImages, respondRating, respondConfig?.studyMode, respondDifficulty, respondGradingContract)
          .then(a => { timing.end('llm.assessment.total'); return a; }),
        generateExaminerTurn(respondTask, updatedHistory, respondDifficulty, respondConfig?.aircraftClass as import('@/types/database').AircraftClass | undefined, rag, respondRating, respondConfig?.studyMode, personaSection, studentName, undefined, respondExaminerContract)
          .then(t => { timing.end('llm.examiner.total'); return t; }),
      ]);
      timing.end('exchange.total');

      // Log LLM usage for both calls (non-blocking)
      logLlmUsage(user.id, assessment.usage, tier, sessionId, { action: 'respond', call: 'assessAnswer' });
      logLlmUsage(user.id, turn.usage, tier, sessionId, { action: 'respond', call: 'generateExaminerTurn' });

      // Step 4: Persist all DB writes (awaited to prevent silent data loss)
      if (studentTranscriptId && assessment) {
        // 1. Assessment update on student transcript
        const { error: assessErr } = await serviceSupabase
          .from('session_transcripts')
          .update({ assessment })
          .eq('id', studentTranscriptId);
        if (assessErr) console.error('Assessment update error:', assessErr.message);

        // 2. Element attempts
        if (sessionId) {
          await writeElementAttempts(supabase, sessionId, studentTranscriptId, assessment);
        }

        // 3. Citations
        if (assessment.rag_chunks && assessment.rag_chunks.length > 0) {
          const citations = assessment.rag_chunks.map((chunk, idx) => ({
            transcript_id: studentTranscriptId,
            chunk_id: chunk.id,
            rank: idx + 1,
            score: chunk.score,
            snippet: chunk.content.slice(0, 300),
          }));
          const { error: citErr } = await serviceSupabase
            .from('transcript_citations')
            .insert(citations);
          if (citErr) console.error('Citation write error:', citErr.message);
        }

        // 4. Examiner transcript
        if (sessionId) {
          const { error: examErr } = await supabase.from('session_transcripts').insert({
            session_id: sessionId,
            exchange_number: exchangeNumber,
            role: 'examiner',
            text: turn.examinerMessage,
          });
          if (examErr) console.error('Examiner transcript write error:', examErr.message);
        }
      } else if (sessionId) {
        // No assessment to write, but still persist examiner transcript
        const { error: examErr } = await supabase.from('session_transcripts').insert({
          session_id: sessionId,
          exchange_number: exchangeNumber,
          role: 'examiner',
          text: turn.examinerMessage,
        });
        if (examErr) console.error('Examiner transcript write error:', examErr.message);
      }

      // Write latency instrumentation (non-blocking, best-effort)
      if (sessionId) {
        writeTimings(serviceSupabase, sessionId, exchangeNumber, timing);
      }

      // Server-side plan + advancement bookkeeping (W2.1) — non-streaming path
      const respondAdvance = decideAdvance(assessment.score);
      let updatedExamPlan = srvExamPlan;
      if (updatedExamPlan && srvPlannerState && currentElementCode && assessment) {
        // Credit mentioned elements
        // W2.3 (bug 13): mention credit ONLY on satisfactory answers
        if (assessment.score === 'satisfactory' && assessment.mentioned_elements.length > 0) {
          updatedExamPlan = creditMentionedElements(updatedExamPlan, assessment.mentioned_elements);
        }
        // Bonus question on unsatisfactory
        if (assessment.score === 'unsatisfactory') {
          const bonusPlan = useBonusQuestion(updatedExamPlan);
          if (bonusPlan) updatedExamPlan = bonusPlan;
        }
        // Persist updated plan + advancement state (read-merge-write)
        if (sessionId) {
          const updatedPlanner: PlannerState = (respondAdvance || assessment.score === 'ungraded') ? srvPlannerState : {
            ...srvPlannerState,
            attempts: {
              ...srvPlannerState.attempts,
              [currentElementCode]: (srvPlannerState.attempts?.[currentElementCode] || 1) + 1,
            },
            version: (srvPlannerState.version || 0) + 1,
          };
          const { data: freshRow } = await serviceSupabase
            .from('exam_sessions')
            .select('metadata')
            .eq('id', sessionId)
            .single();
          const freshMeta = (freshRow?.metadata as Record<string, unknown>) || {};
          const { error: metaErr } = await serviceSupabase
            .from('exam_sessions')
            .update({
              metadata: {
                ...freshMeta,
                plannerState: updatedPlanner,
                examPlan: updatedExamPlan,
                advanceDue: respondAdvance,
              },
            })
            .eq('id', sessionId);
          if (metaErr) console.error('ExamPlan persist error:', metaErr.message);
        }
      }

      return NextResponse.json({
        taskId: respondTask.id,
        taskData: respondTask,
        examinerMessage: turn.examinerMessage,
        assessment: { ...assessment, advance: respondAdvance },
        advance: respondAdvance,
        ...(updatedExamPlan ? { examPlan: updatedExamPlan } : {}),
      });
    }

    if (action === 'resume-current') {
      // Return current element's task data without advancing the planner or calling LLM.
      // Used by session resume when the examiner's last question is still pending.
      // W2.1: state comes from exam_sessions.metadata (client copies ignored when present).
      if (!srvPlannerState || !srvSessionConfig) {
        return NextResponse.json({ error: 'Missing plannerState or sessionConfig' }, { status: 400 });
      }

      // The pending question belongs to the most recently asked element
      // (recent last). queue[cursor] is the NEXT element — using it resumed
      // onto the wrong element (review-02 bug 5).
      const currentElementCode = srvPlannerState.recent?.length
        ? srvPlannerState.recent[srvPlannerState.recent.length - 1]
        : srvPlannerState.queue[srvPlannerState.cursor];
      if (!currentElementCode) {
        return NextResponse.json({ examinerMessage: 'Session complete', sessionComplete: true });
      }

      // Derive task_id from element code (e.g., "PA.I.A.K1" → "PA.I.A")
      const parts = currentElementCode.split('.');
      const taskId = parts.slice(0, -1).join('.');

      const { data: task } = await supabase
        .from('acs_tasks')
        .select('*')
        .eq('id', taskId)
        .single();

      if (!task) {
        return NextResponse.json({ error: 'Task not found' }, { status: 404 });
      }

      return NextResponse.json({
        taskId: task.id,
        taskData: task,
        elementCode: currentElementCode,
      });
    }

    if (action === 'next-task') {
      // Load conversation history from DB for session continuity.
      // This allows the DPE to reference earlier discussion across task transitions
      // ("earlier you mentioned X, and now...") — just like a real checkride.
      let sessionHistory: ExamMessage[] = [];
      if (sessionId) {
        const { data: transcripts } = await supabase
          .from('session_transcripts')
          .select('role, text')
          .eq('session_id', sessionId)
          .order('exchange_number', { ascending: true })
          .order('timestamp', { ascending: true });

        if (transcripts) {
          sessionHistory = transcripts.map(t => ({
            role: t.role as 'examiner' | 'student',
            text: t.text as string,
          }));
        }
      }

      // Advance via planner using SERVER-owned state (W2.1) — exam_sessions.metadata
      // is authoritative; client copies are only a legacy fallback.
      const ntConfig = srvSessionConfig;
      if (srvPlannerState && ntConfig) {
        const plannerResult = await advancePlanner(srvPlannerState, ntConfig, undefined, srvExamPlan);
        if (!plannerResult) {
          // All elements exhausted — auto-complete with grading
          if (sessionId) {
            try {
              // Load attempts + server-side planner state (don't trust client for totalElements)
              const [{ data: attempts }, { data: examRow }] = await Promise.all([
                serviceSupabase
                  .from('element_attempts')
                  .select('element_code, score')
                  .eq('session_id', sessionId)
                  .eq('tag_type', 'attempt')
                  .not('score', 'is', null)
                  .order('created_at', { ascending: true }),
                serviceSupabase
                  .from('exam_sessions')
                  .select('metadata')
                  .eq('id', sessionId)
                  .single(),
              ]);

              const serverPlannerState = (examRow?.metadata as Record<string, unknown>)?.plannerState as { queue: string[] } | undefined;
              const totalElements = serverPlannerState?.queue?.length || srvPlannerState.queue.length;

              if (totalElements > 0) {
                const attemptData = (attempts || []).map(a => ({
                  element_code: a.element_code,
                  score: a.score as 'satisfactory' | 'unsatisfactory' | 'partial',
                  area: a.element_code.split('.')[1],
                }));
                const result = computeExamResult(attemptData, totalElements, 'all_tasks_covered');

                // V2 grading: plan-based denominator + per-area gating
                const serverExamPlan = (examRow?.metadata as Record<string, unknown>)?.examPlan as ExamPlanV1 | undefined;
                const serverSessionConfig = (examRow?.metadata as Record<string, unknown>)?.sessionConfig as SessionConfig | undefined;
                const effectivePlan = serverExamPlan || srvExamPlan;
                let examResultV2: Record<string, unknown> | undefined;
                if (effectivePlan) {
                  const v2 = computeExamResultV2(
                    attemptData,
                    effectivePlan,
                    'all_tasks_covered',
                    serverSessionConfig?.rating || ntConfig?.rating || 'private',
                  );
                  // W2.3 (bug 9): V2 is canonical — a naturally-completed exam
                  // grades pass/fail from the plan, never 'incomplete' just
                  // because asked < raw queue length.
                  result.grade = v2ToV1Grade(v2.overall_status);
                  examResultV2 = v2 as unknown as Record<string, unknown>;
                }

                // Merge V2 into existing metadata (preserve plannerState, sessionConfig, etc.)
                const existingMetadata = (examRow?.metadata as Record<string, unknown>) || {};
                const updatedMetadata = { ...existingMetadata, ...(examResultV2 ? { examResultV2 } : {}) };

                const { error: completeErr } = await serviceSupabase
                  .from('exam_sessions')
                  .update({ status: 'completed', ended_at: new Date().toISOString(), result, metadata: updatedMetadata })
                  .eq('id', sessionId);
                if (completeErr) console.error('Auto-complete session update error:', completeErr.message);
              } else {
                console.warn(`Auto-complete grading skipped for session ${sessionId}: totalElements=0`);
              }
            } catch (err) {
              console.error('Auto-complete grading error:', err);
            }
          }

          return NextResponse.json({
            examinerMessage: 'We have covered all the elements in your study plan. Great job today!',
            sessionComplete: true,
          });
        }

        const nextTaskRating = ntConfig.rating || 'private';

        // Compute transition hint for cross_acs mode (Phase 9)
        const previousElementCode = srvPlannerState.recent?.length
          ? srvPlannerState.recent[srvPlannerState.recent.length - 1]
          : undefined;
        const transitionHint = buildTransitionHint(
          previousElementCode, plannerResult.elementCode,
          ntConfig.studyMode, nextTaskRating
        );

        // Format depth & difficulty contract for next-task examiner prompt (Phase 10)
        const nextTaskExaminerContract = plannerResult.depthDifficultyContract
          ? formatContractForExaminer(plannerResult.depthDifficultyContract)
          : undefined;

        const turn = await generateExaminerTurn(
          plannerResult.task, sessionHistory, plannerResult.difficulty, ntConfig.aircraftClass, undefined, nextTaskRating, ntConfig.studyMode, personaSection, studentName, transitionHint, nextTaskExaminerContract
        );

        // Log LLM usage (non-blocking)
        logLlmUsage(user.id, turn.usage, tier, sessionId, { action: 'next-task', call: 'generateExaminerTurn' });

        // Fire PostHog event for cross-area transitions (Phase 9, non-blocking)
        if (transitionHint && ntConfig.studyMode === 'cross_acs') {
          after(async () => {
            const { captureServerEvent } = await import('@/lib/posthog-server');
            captureServerEvent(user.id, 'flow_transition_generated', {
              session_id: sessionId,
              from_element: previousElementCode,
              to_element: plannerResult.elementCode,
              rating: nextTaskRating,
            });
          });
        }

        // Fire PostHog event for depth contract (Phase 10, non-blocking)
        if (plannerResult.depthDifficultyContract) {
          after(async () => {
            const { captureServerEvent } = await import('@/lib/posthog-server');
            captureServerEvent(user.id, 'depth_contract_applied', {
              session_id: sessionId,
              ...contractSummary(plannerResult.depthDifficultyContract!),
              element_code: plannerResult.elementCode,
              study_mode: ntConfig.studyMode,
              action: 'next-task',
            });
          });
        }

        if (sessionId) {
          const { count } = await supabase
            .from('session_transcripts')
            .select('*', { count: 'exact', head: true })
            .eq('session_id', sessionId);
          const exchangeNumber = (count || 0) + 1;

          await supabase.from('session_transcripts').insert({
            session_id: sessionId,
            exchange_number: exchangeNumber,
            role: 'examiner',
            text: turn.examinerMessage,
          });
        }

        // Persist updated planner state + taskData + examPlan + contract to metadata for resume.
        // Read-merge-write (W2.1): preserves persona, promptTrace, fingerprintMeta, etc.
        if (sessionId) {
          const { data: freshRow } = await serviceSupabase
            .from('exam_sessions')
            .select('metadata')
            .eq('id', sessionId)
            .single();
          const freshMeta = (freshRow?.metadata as Record<string, unknown>) || {};
          const { error: metaErr } = await serviceSupabase
            .from('exam_sessions')
            .update({ metadata: {
              ...freshMeta,
              plannerState: plannerResult.plannerState,
              sessionConfig: ntConfig,
              taskData: plannerResult.task,
              examPlan: plannerResult.examPlan,
              advanceDue: false,
              ...(plannerResult.depthDifficultyContract ? { depthDifficultyContract: plannerResult.depthDifficultyContract } : {}),
            } })
            .eq('id', sessionId);
          if (metaErr) console.error('Planner state persist error:', metaErr.message);
        }

        return NextResponse.json({
          taskId: plannerResult.task.id,
          taskData: plannerResult.task,
          examinerMessage: turn.examinerMessage,
          elementCode: plannerResult.elementCode,
          plannerState: plannerResult.plannerState,
          examPlan: plannerResult.examPlan,
        });
      }

      // Fallback: random task selection (legacy mode, no class filtering)
      const currentTaskId = taskData?.id || '';
      const legacyRating = sessionConfig?.rating || 'private';
      const task = await pickNextTask(currentTaskId, coveredTaskIds || [], undefined, legacyRating);
      if (!task) {
        return NextResponse.json({
          examinerMessage: 'We have covered all the areas. Great job today!',
          sessionComplete: true,
        });
      }

      const turn = await generateExaminerTurn(task, sessionHistory, undefined, undefined, undefined, undefined, undefined, personaSection, studentName);

      // Log LLM usage (non-blocking)
      logLlmUsage(user.id, turn.usage, tier, sessionId, { action: 'next-task', call: 'generateExaminerTurn' });

      // Persist examiner transition to transcript
      if (sessionId) {
        const { count } = await supabase
          .from('session_transcripts')
          .select('*', { count: 'exact', head: true })
          .eq('session_id', sessionId);
        const exchangeNumber = (count || 0) + 1;

        await supabase.from('session_transcripts').insert({
          session_id: sessionId,
          exchange_number: exchangeNumber,
          role: 'examiner',
          text: turn.examinerMessage,
        });
      }

      return NextResponse.json({
        taskId: task.id,
        taskData: task,
        examinerMessage: turn.examinerMessage,
      });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error) {
    console.error('Exam API error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
