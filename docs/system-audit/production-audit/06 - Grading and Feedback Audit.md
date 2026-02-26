---
date: 2026-02-24
type: system-audit
tags: [aviation-oral-exam, grading, feedback, production-audit]
status: complete
audit-area: Grading Logic, Feedback Quality & Score Persistence
severity: medium-high
---

# 06 — Grading and Feedback Audit

## Purpose

This document audits the grading subsystem: how student answers are assessed, how scores are computed and persisted, how feedback is generated and grounded (or not), and how the system supports (or fails to support) longitudinal progress tracking and targeted review. It covers the full lifecycle from a student's spoken answer through assessment, scoring, persistence, and eventual use in weak-areas study mode.

---

## 1. assessAnswer Output Format

**File**: `src/lib/exam-engine.ts:605-767`

### Assessment Architecture

Each student answer triggers **two parallel Claude API calls**:

1. **`assessAnswer()`** — Evaluates the student's response against ACS standards
2. **`generateExaminerTurn()`** — Produces the examiner's next question/response

These run concurrently (Promise.all or equivalent) to minimize latency. The assessment result feeds into session tracking and grading; the examiner turn is sent to the client.

### Assessment JSON Schema

The `assessAnswer` function returns a structured JSON object:

```typescript
{
  score: 'satisfactory' | 'unsatisfactory' | 'partial',
  feedback: string,              // Free-form commentary on the answer
  misconceptions: string[],      // Identified knowledge gaps or errors
  follow_up_needed: boolean,     // Whether the answer warrants deeper probing
  primary_element: string,       // ACS element code this answer addresses
  mentioned_elements: string[],  // Other ACS elements touched by the answer
  source_summary: string | null  // Optional FAA source reference
}
```

> [!note] Structured Assessment Is Well-Designed
> The schema captures the key dimensions a real DPE would evaluate: correctness (score), specific feedback, identified misconceptions, whether follow-up is needed, and which ACS elements were addressed. The `mentioned_elements` field enables cross-element coverage tracking from a single answer.

> [!risk] source_summary Is Optional and Unstructured
> The assessment prompt defines `source_summary` as: "If no FAA source material was provided, set to null." This means:
>
> 1. When RAG retrieval returns low-relevance chunks, Claude may choose not to reference them
> 2. When Claude assesses based on parametric knowledge, there is no requirement to disclose this
> 3. The `source_summary` field is free-form text, not a structured citation (no chunk ID, page number, or document reference)
> 4. There is no validation that `source_summary` content actually matches the retrieved RAG chunks

### Assessment Prompt Context

The assessor receives:
- The ACS element definition (knowledge, risk, or skill requirement)
- The student's answer
- RAG-retrieved chunks (same ones sent to the examiner)
- Image URLs (if applicable, for visual questions)
- Conversation history (for context)

> [!risk] Assessment Not Constrained to Sources
> The assessment prompt says to use FAA source material but does not mandate it. Claude can (and likely does) supplement with parametric knowledge when assessing answers on topics where retrieved chunks are sparse or low-relevance. A student could receive feedback like "That's partially correct — the PHAK also discusses..." where the PHAK content referenced is from Claude's training data, not the retrieved chunks.

### Assessment Storage

**File**: `api/exam/route.ts`

Assessment JSON is stored on the `session_transcripts` table in the `assessment` JSONB column. Citations (when present in `source_summary`) are stored in the `transcript_citations` table.

---

## 2. Element Attempts Tracking

**File**: `src/app/api/exam/route.ts:70-124`

### How Attempts Are Recorded

After each assessment, the API route writes to the `element_attempts` table:

```typescript
// Primary element — the element being directly tested
{
  user_id: userId,
  element_code: assessment.primary_element,
  session_id: sessionId,
  score: assessment.score,           // satisfactory | partial | unsatisfactory
  tag_type: 'attempt',               // Primary assessment
  assessed_at: new Date()
}

// Mentioned elements — elements the student touched in passing
for (const mentioned of assessment.mentioned_elements) {
  {
    user_id: userId,
    element_code: mentioned,
    session_id: sessionId,
    score: null,                     // No score for mentions
    tag_type: 'mention',             // Secondary reference
    assessed_at: new Date()
  }
}
```

### Tagging System

| Tag Type | Score | Meaning |
|----------|-------|---------|
| `attempt` | satisfactory / partial / unsatisfactory | Direct assessment of the element |
| `mention` | null | Student referenced the element in their answer but it was not being directly tested |

> [!note] Mention Tracking Enables Rich Analytics
> The `mention` tag type captures when a student demonstrates knowledge of Element B while being tested on Element A. This is valuable for understanding a student's knowledge interconnections and could eventually inform the coverage map (e.g., "The student demonstrated knowledge of PA.III.A.K2 while discussing PA.I.B.K1, so we can deprioritize directly testing PA.III.A.K2").

> [!risk] mention Tag Has No Score
> Mentioned elements are recorded without a score. This means the system knows the student referenced the topic but not whether they did so correctly. A student who incorrectly cites a regulation while answering a different question will have that regulation's element marked as `mention` with no indication of the error. The `mention` record provides no negative signal.

> [!risk] primary_element Determined by Claude
> The `primary_element` field is set by Claude during assessment, not by the planner. If Claude misidentifies which element the answer addresses (e.g., assigns `PA.I.A.K1` when the planner intended `PA.I.A.K2`), the attempt is recorded against the wrong element. There is no validation that `assessment.primary_element` matches the planner's `currentElement`.

---

## 3. computeExamResult Grading Rules

**File**: `src/lib/exam-logic.ts:475-560`

### Point Values

| Score | Points |
|-------|--------|
| `satisfactory` | 1.0 |
| `partial` | 0.7 |
| `unsatisfactory` | 0.0 |

### Pass/Fail Threshold

**Pass**: Overall score >= 70% (0.70)

```
overallScore = pointsEarned / pointsPossible
pass = overallScore >= 0.70
```

Where:
- `pointsEarned` = sum of point values for all assessed elements
- `pointsPossible` = count of assessed elements (NOT total elements in the rating)

> [!risk] Grading Against Asked, Not Total
> The denominator is "elements actually asked," not "total elements in the ACS." This means a student who is asked 10 questions and answers 7 satisfactorily scores 70% and passes, even if the rating has 143 elements. The score reflects performance density, not coverage breadth. A student who ends early after a strong start will have a high score despite low coverage.

### Completion Triggers and Grading Behavior

| Trigger | Grading Basis | Implications |
|---------|--------------|--------------|
| `all_tasks_covered` | All elements in the queue were attempted | Most comprehensive assessment; but checks if asked < total elements in queue and marks `incomplete` if so |
| `user_ended` | Only elements attempted before ending | Student can strategically end after strong performance |
| No elements scored | N/A | Returns `incomplete` status |

### Score Computation Detail

```typescript
function computeExamResult(attempts: ElementAttempt[], trigger: string) {
  // Filter to 'attempt' tag_type only (exclude 'mention')
  const scored = attempts.filter(a => a.tag_type === 'attempt' && a.score);

  if (scored.length === 0) return { status: 'incomplete' };

  const pointsEarned = scored.reduce((sum, a) => {
    if (a.score === 'satisfactory') return sum + 1.0;
    if (a.score === 'partial') return sum + 0.7;
    return sum; // unsatisfactory = 0
  }, 0);

  const pointsPossible = scored.length;
  const overallScore = pointsEarned / pointsPossible;

  // Per-area breakdown
  const scoreByArea = computeScoreByArea(scored);

  return {
    status: overallScore >= 0.70 ? 'pass' : 'fail',
    overallScore,
    pointsEarned,
    pointsPossible,
    scoreByArea,
    trigger
  };
}
```

> [!note] score_by_area Is Computed But Not Enforced
> The function computes per-area scores (e.g., Area I: 85%, Area III: 55%, Area VII: 70%). However, pass/fail is determined solely by the aggregate `overallScore`. A student who scores 100% on easy areas and 0% on critical areas (like regulations or weather) can still pass if the aggregate exceeds 70%.

> [!risk] No Per-Area Minimum
> In a real FAA checkride, a DPE must find satisfactory performance in EACH area of operation, not just overall. A student who demonstrates no knowledge of weather theory (Area VII) would not pass regardless of their performance in other areas. The system's aggregate-only scoring does not enforce this.

### Partial Score Calibration

> [!risk] 0.7 Points for Partial Is Arbitrary
> The 0.7 value for `partial` scores is not calibrated against any FAA standard. In real checkride assessment, answers are either satisfactory or not — there is no "partial credit." The 0.7 value means a student can pass with 100% partial answers (0.7 * N / N = 0.70 = exactly at threshold). Whether this is desirable or too lenient depends on how strictly `partial` is assessed by Claude.

---

## 4. Feedback Grounding Analysis

### Current Feedback Flow

1. Claude receives RAG chunks + graph context + student answer
2. Claude produces `feedback` (free-form string) as part of assessment JSON
3. Feedback is stored in `session_transcripts.assessment`
4. Feedback is available for display on the progress page

### Grounding Gaps

> [!risk] Feedback Is Not Grounded in Sources
> The `feedback` field in the assessment is free-form model commentary with no requirement to cite or reference the provided FAA source material. Claude generates feedback based on a combination of:
>
> 1. Retrieved RAG chunks (when relevant)
> 2. Graph context (when available for the element)
> 3. Claude's parametric knowledge of aviation
> 4. The assessment prompt's general instructions
>
> There is no mechanism to verify that feedback statements are supported by the retrieved sources. A feedback message like "Remember, the maximum altitude for Class D airspace is 2,500 feet AGL" may be correct but sourced from Claude's training data, not the retrieved AIM section.

> [!risk] No Feedback Review or Correction Mechanism
> Incorrect feedback is indistinguishable from correct feedback in the stored data. If Claude provides wrong information in feedback (e.g., citing an incorrect regulation number), it persists in the transcript and could mislead the student in future review. There is no flagging mechanism, no user-reported-error flow, and no periodic audit of feedback accuracy.

### What Would Grounded Feedback Look Like

Grounded feedback would:
1. Reference specific chunk numbers from the retrieved context: "Per [2] (AIM 3-2-1), Class D airspace..."
2. Distinguish between facts from sources vs. general aviation knowledge
3. Flag when no source supports a claim: "Note: I could not verify this in the provided sources"
4. Link to the specific FAA publication page for student follow-up

---

## 5. Score Persistence and Weak Areas

### Persistence Chain

```
Student answer
  → assessAnswer() → assessment JSON
    → element_attempts table (attempt + mention records)
      → get_element_scores RPC (aggregation)
        → buildElementQueue() in weak_areas mode (weighting)
```

### get_element_scores RPC

This RPC aggregates `element_attempts` for a user across all sessions:

- Returns the most recent score for each element code
- Used by `buildElementQueue` to assign weights in weak_areas mode

### Weak Areas Weighting (Recap)

| Last Score | Weight | Effect |
|-----------|--------|--------|
| unsatisfactory | 5 | Appears ~5x more often than satisfactory elements |
| partial | 4 | Appears ~4x more often |
| untouched | 3 | Default for elements never attempted |
| satisfactory | 1 | Still included but rare |

> [!note] Recency-Based Scoring
> Using the MOST RECENT score (not average or worst) means a student who initially scored unsatisfactory but later answered satisfactorily will see that element deprioritized. This creates a genuine spaced-repetition effect: master an element and it fades; struggle and it returns frequently.

> [!risk] Single-Attempt Resolution
> Each element's weight is based on a single most-recent score. A student who answered satisfactorily once (possibly by luck or a leading question) will see that element deprioritized even if they have no deep understanding. Averaging multiple attempts or requiring N consecutive satisfactory scores would be more robust.

### Cross-Session Continuity

Element attempts persist across sessions, so weak_areas mode benefits from historical data. A student who takes 5 sessions will have a well-populated element_attempts table that drives genuinely personalized review in session 6.

> [!note] This Is a Strength
> The persistence of element-level scoring across sessions is one of the system's best features. It creates a genuine learning loop that improves with use.

---

## 6. "Generate Future Exam from Weak Areas" — What Exists vs. What's Missing

### What Exists

1. **Data layer**: `element_attempts` table with per-element, per-session scoring
2. **Aggregation**: `get_element_scores` RPC that returns most-recent scores per element
3. **Study mode**: `weak_areas` mode that uses scores to weight element selection
4. **Per-area breakdown**: `score_by_area` computed in `computeExamResult`

### What's Missing

> [!todo] No "Generate Exam" Feature
> There is no API endpoint or UI feature that takes a student's weak areas and generates a targeted practice exam. The pieces exist:
>
> - `get_element_scores` can identify which elements scored unsatisfactory or partial
> - `buildElementQueue` can filter to specific elements or areas
> - The session config accepts `selectedTasks` and `selectedAreas`
>
> But there is no "Review Weak Areas" button that:
> 1. Calls `get_element_scores` to find elements below threshold
> 2. Groups them by ACS area
> 3. Generates a session config targeting those areas/elements
> 4. Starts a new session with that config
>
> The student must manually select weak_areas mode, which uses weighted random across ALL elements, not a focused exam on just the weak ones.

> [!todo] No Weak Areas Dashboard
> The progress page (`/progress`) shows session history and aggregate stats but does not display:
> - Per-element score history
> - Elements never attempted
> - Elements with declining performance
> - Recommended areas for focused study
>
> The data exists in `element_attempts` but there is no UI to surface it.

> [!todo] No Export or Study Guide Generation
> A valuable feature would be generating a personalized study guide from weak areas:
> - "You scored unsatisfactory on 5 elements in Area VII (Weather). Here are the relevant PHAK chapters and AIM sections."
> - Could use the RAG pipeline to retrieve relevant chunks for each weak element
> - Could generate a PDF or shareable study plan

---

## 7. Pass/Fail Criteria Analysis

### Current Criteria

```
PASS: overallScore >= 0.70
FAIL: overallScore < 0.70
INCOMPLETE: no elements scored OR trigger indicates incomplete coverage
```

### Comparison to FAA Standards

| Dimension | FAA Oral Exam | HeyDPE | Gap |
|-----------|--------------|--------|-----|
| **Per-area requirement** | Must demonstrate satisfactory knowledge in each area | Aggregate score only | No per-area pass/fail |
| **Scoring granularity** | Satisfactory or Unsatisfactory (binary) | Three levels (S/P/U) with partial = 0.7 | Partial credit does not exist in real checkrides |
| **Coverage requirement** | All areas of operation must be tested | No minimum coverage before pass | Can pass with partial coverage |
| **Examiner discretion** | DPE can retest specific areas | No retest mechanism | Elements tested once only |
| **Discontinuance** | DPE can discontinue for weather, aircraft, or safety | No discontinuance concept | N/A for simulator |
| **Letter of Discontinuance** | Preserves passed areas for future attempt | No carry-forward of passed areas between sessions | Each session is independent |

### Recommended Criteria Improvements

> [!todo] Per-Area Minimum Score
> Add a per-area pass requirement. The `score_by_area` data already exists in `computeExamResult`. Add a check:
>
> ```
> for each area in score_by_area:
>   if area.score < 0.70:
>     result.failedAreas.push(area)
>     result.status = 'fail'
> ```
>
> This would catch students who ace some areas and bomb others.

> [!todo] Minimum Coverage Before Pass
> Require that at least one element from each selected area has been attempted before a "pass" grade is awarded. For `user_ended` sessions with incomplete coverage, return status `incomplete` rather than computing a score:
>
> ```
> if (trigger === 'user_ended') {
>   const coveredAreas = new Set(scored.map(a => getAreaFromCode(a.element_code)));
>   const selectedAreas = session.config.selectedAreas;
>   if (coveredAreas.size < selectedAreas.length) {
>     return { status: 'incomplete', reason: 'not_all_areas_covered' };
>   }
> }
> ```

> [!todo] Consider Binary Scoring Option
> Offer a "strict mode" that maps scores to FAA binary:
> - `satisfactory` = pass (1.0)
> - `partial` = fail (0.0) — partial credit does not exist in real checkrides
> - `unsatisfactory` = fail (0.0)
>
> This would be opt-in and more realistic for students doing final checkride preparation.

---

## 8. Assessment Reliability

### Two-Call Architecture Risks

> [!risk] Assessment and Examiner May Diverge
> Since `assessAnswer` and `generateExaminerTurn` are separate Claude calls, they may reach different conclusions about the student's answer. The assessor might score "unsatisfactory" while the examiner responds with "Good, let's move on." This creates a confusing experience where the scored result contradicts the conversational tone.

> [!note] Parallel Execution Is a Good Latency Trade-Off
> Running both calls in parallel saves 1-2 seconds per exchange. The divergence risk is real but infrequent, and the latency benefit is meaningful for a voice-first application where responsiveness matters.

### Assessment Consistency

> [!risk] No Assessment Calibration
> There is no ground truth dataset for calibrating Claude's assessment accuracy. Without a set of known-correct answers and their expected scores, there is no way to measure:
> - Whether Claude's `satisfactory` threshold matches FAA standards
> - Whether partial scores are assigned consistently across elements
> - Whether certain element types (K vs. R) are scored more leniently
> - Whether different examiner personas affect assessment scores (they shouldn't, since assessment and persona are separate prompts)

> [!todo] Assessment Calibration Dataset
> Create a calibration dataset of 50-100 student answers with expert-labeled scores. Run `assessAnswer` against this dataset periodically to measure:
> - Agreement rate with expert labels
> - Score distribution (is Claude too lenient? too strict?)
> - Consistency across elements and areas
> - Drift over time as Claude model versions change

---

## 9. Citation Tracking

### transcript_citations Table

Citations extracted from assessment are stored in `transcript_citations`:

| Column | Type | Content |
|--------|------|---------|
| transcript_id | UUID | FK to session_transcripts |
| chunk_id | UUID | FK to the retrieved chunk |
| citation_text | text | The specific text cited |
| relevance | float | Relevance score |

> [!note] Citation Infrastructure Exists
> The table and write path exist. However, since `source_summary` in assessments is optional and free-form, citation records may be sparse or inconsistently populated. The quality of citation data depends entirely on how reliably Claude populates `source_summary` and whether the parsing logic correctly extracts chunk references.

> [!risk] No Citation Completeness Monitoring
> There is no tracking of what percentage of assessments include citations, whether citation rates vary by element or area, or whether cited chunks actually contain the referenced information. Without monitoring, citation quality could silently degrade.

---

## 10. Summary of Findings

| # | Finding | Severity | Status |
|---|---------|----------|--------|
| 1 | Feedback is ungrounded free-form commentary | High | No enforcement mechanism |
| 2 | No per-area pass/fail criteria | High | `score_by_area` computed but unenforced |
| 3 | Grading denominator is "asked" not "total" | Medium | Allows gaming via early exit |
| 4 | `follow_up_needed` not acted upon by planner | High | Signal computed but discarded |
| 5 | `primary_element` set by Claude, not validated | Medium | Could misattribute attempts |
| 6 | Partial credit (0.7) is arbitrary | Medium | No FAA equivalent |
| 7 | No assessment calibration dataset | Medium | Cannot measure accuracy |
| 8 | No "generate exam from weak areas" feature | Medium | Data exists, UI/API missing |
| 9 | No weak areas dashboard | Low | Progress page shows aggregates only |
| 10 | Assessment and examiner may diverge | Low | Separate Claude calls |
| 11 | `source_summary` optional and unstructured | Medium | Citations unreliable |
| 12 | Mentions recorded without score | Low | No negative signal from incorrect mentions |

---

*Audit conducted 2026-02-24. Based on production state as of commit `80dbc7e`.*
