---
date: 2026-02-24
type: system-audit
tags: [aviation-oral-exam, exam-flow, difficulty, production-audit]
status: complete
audit-area: Exam Flow, Difficulty Control & Examiner Behavior
severity: medium
---

# 05 — Exam Flow and Difficulty Audit

## Purpose

This document audits the exam flow orchestration: how the system selects which ACS elements to test, in what order, how difficulty is determined, and how the examiner persona behaves. It identifies gaps between the current implementation and the behavior of a real FAA Designated Pilot Examiner conducting an oral examination.

---

## 1. PlannerState and Queue Building

**File**: `src/lib/exam-logic.ts:337-395`

### PlannerState Structure

The planner maintains state across the exam session:

```typescript
interface PlannerState {
  queue: string[];          // Ordered list of element codes
  cursor: number;           // Current position in queue
  recent: string[];         // Last 5 element codes tested (anti-repeat)
  studyMode: StudyMode;     // linear | cross_acs | weak_areas
  rating: string;           // PA | CA | IR
  difficulty: string;       // easy | medium | hard | mixed
  currentElement?: string;  // Element code currently being tested
}
```

### Queue Building (buildElementQueue)

**File**: `src/lib/exam-logic.ts:337-395`

The element queue is constructed at session start through a multi-step filtering pipeline:

1. **Area/Task filter**: If `selectedTasks` is provided, include only elements belonging to those tasks. Otherwise, if `selectedAreas` is provided, include only elements in those areas. If neither is set, include all elements for the rating.

2. **Difficulty filter**: If difficulty is not `mixed`, filter elements to those matching the requested difficulty level. If this filter removes ALL elements, the filter is silently skipped and all elements are retained.

3. **Skill element exclusion**: Elements with S-type codes (e.g., `PA.IV.A.S1`) are always removed. These represent flight skills that cannot be tested in an oral exam.

4. **Ordering**: Applied based on study mode (see Section 2).

> [!note] Silent Difficulty Fallback
> When difficulty filtering would produce an empty queue, the system silently falls back to including all difficulty levels (`exam-logic.ts:140-146`). This is a reasonable defensive measure, but the user receives no indication that their difficulty preference was ignored. A student selecting "hard" may receive easy questions without knowing why.

> [!risk] No Minimum Queue Size Check
> If area/task filtering combined with difficulty filtering produces a very small queue (e.g., 2-3 elements), the session will cycle through them rapidly and either complete quickly or loop with the anti-repeat mechanism struggling against the small pool. There is no minimum queue size validation or warning.

---

## 2. Study Modes

**File**: `src/lib/exam-logic.ts:337-395`

### Linear Mode

Elements are ordered by their code in natural sort order:

```
PA.I.A.K1 → PA.I.A.K2 → PA.I.A.K3 → PA.I.A.R1 → PA.I.B.K1 → ...
```

This follows the ACS document structure: Area I, Task A, then all Knowledge elements, then Risk Management elements, then Area I Task B, and so on.

> [!note] Predictable but Useful
> Linear mode is the most predictable study experience. Students working through the ACS systematically will find this natural. However, it does not simulate a real oral exam, where the examiner jumps between areas based on the student's responses.

### Cross-ACS Mode

Elements are shuffled using Fisher-Yates algorithm at queue build time.

> [!risk] Random Shuffle vs. Logical Connections
> The current cross-ACS mode produces a truly random ordering. A student might be asked about `PA.I.A.K1` (Pilot Qualifications) followed by `PA.VIII.B.K3` (Emergency Equipment) followed by `PA.III.A.K2` (Performance Charts). A real DPE creates **logically connected transitions** — discussing weather leads to weather-related regulations, which leads to weather minimums for the planned flight, which leads to alternate airport requirements. The random shuffle eliminates these natural teaching connections.
>
> **Desired behavior**: When transitioning between elements, the system should prefer elements that are semantically or topically connected to the current element. The knowledge graph (`concept_relations` table with 6 relation types) exists and could power this, but is not used for transition planning.

### Weak Areas Mode

Elements are assigned weights based on prior performance:
- `unsatisfactory` = 5 (highest priority)
- `partial` = 4
- `untouched` = 3
- `satisfactory` = 1 (lowest priority, but still included)

Selection uses weighted random sampling.

> [!note] Data Source
> Weak areas weights are derived from `get_element_scores` RPC, which reads the `element_attempts` table. This creates a genuine adaptive review loop: elements the student struggled with appear more frequently in subsequent sessions.

> [!risk] Cold Start Problem
> A brand-new user with no `element_attempts` data will have all elements weighted at 3 (`untouched`), making weak_areas mode functionally identical to cross_acs mode (uniform random). The UI does not communicate this, and a new student selecting "Focus on Weak Areas" may expect targeted review they cannot yet receive.

---

## 3. Element Selection and Advancement

**File**: `src/lib/exam-logic.ts:400-441`

### pickNextElement

The advancement algorithm:

1. Start at `cursor` position in `queue`
2. Check if the element at `cursor` is in the `recent` list (last 5 elements)
3. If in `recent`, increment `cursor` and try the next element
4. If not in `recent`, select it as the current element
5. Add it to `recent` (maintaining max 5)
6. Increment `cursor`
7. If `cursor` exceeds queue length, wrap to 0

### Anti-Repeat Mechanism

The `recent` list of 5 prevents the same element from appearing twice within a 5-element window. This is important for small queues where the cursor wraps frequently.

> [!risk] Infinite Loop with Tiny Queues
> If the queue has 5 or fewer elements and all are in the `recent` list, the algorithm will loop through every position finding them all "recent." The code handles this by eventually selecting an element anyway (falling through the recent check), but the behavior is not explicitly documented or tested for edge cases like queue size = 1.

### Session Completion

Two completion triggers:
1. **Queue exhausted**: All elements have been visited. The system calls `computeExamResult` with trigger `all_tasks_covered`.
2. **User ends session**: Student clicks "End Exam." Trigger is `user_ended`.

> [!note] Queue Exhaustion vs. All Covered
> "Queue exhausted" means the cursor has visited every position. Since elements can be skipped (via the recent mechanism) or revisited (via cursor wrapping), "queue exhausted" is not precisely "every element tested once." The system tracks coverage via the `acs_tasks_covered` array on the session, which records task-level (not element-level) coverage.

---

## 4. No Predetermined Question Budget

> [!risk] Missing Question Budget — Key Gap
> A real FAA oral exam has a natural scope: the DPE covers all required ACS areas with enough depth to make a determination, typically taking 1-2 hours. The current system has **no predetermined question budget**. Sessions run until:
>
> - The queue is exhausted (which could be 143 elements for Private Pilot), or
> - The student manually ends the session
>
> There is no mechanism to say "ask approximately 60 questions across all areas, spending proportionally more time on areas where the student struggles."

### Insertion Points for Question Budget

A question budget could be implemented at these locations:

1. **Queue construction** (`exam-logic.ts:337-395`): Instead of including all filtered elements, sample a budget-sized subset with proportional area representation. E.g., for a 60-question exam across 9 areas, allocate ~7 elements per area with adjustment for area size.

2. **Planner advancement** (`exam-logic.ts:400-441`): Add a counter to `PlannerState` and check against budget before selecting the next element. When budget is reached, trigger completion.

3. **API route** (`api/exam/route.ts`): The `respond` action could check `exchange_count` against a configured budget and return a completion signal instead of advancing the planner.

4. **Session config**: Add `questionBudget` to the session configuration alongside `studyMode` and `difficulty`. Allow the user to set this in the practice configuration UI.

> [!todo] Recommended Approach
> Option 2 (planner-level counter) is the cleanest insertion point. It keeps the budget logic in the pure-logic layer (`exam-logic.ts`), makes it testable, and does not require API route changes. The counter would be a new field on `PlannerState` and checked in `pickNextElement`.

---

## 5. Difficulty Modes

**Files**: `src/lib/exam-logic.ts:140-146`, `src/lib/exam-planner.ts:133-134`

### Session-Level Difficulty

Difficulty is a session-level configuration, not a per-element adaptive property:

| Setting | Behavior |
|---------|----------|
| `easy` | All elements use easy difficulty prompts |
| `medium` | All elements use medium difficulty prompts |
| `hard` | All elements use hard difficulty prompts |
| `mixed` | Each element uses its `difficulty_default` from the database |

**File**: `src/lib/exam-planner.ts:133-134`

When difficulty is not `mixed`, the planner overrides every element's difficulty with the session setting. When `mixed`, it reads `difficulty_default` from the element record.

> [!risk] No Adaptive Difficulty
> The system does not adjust difficulty based on student performance within a session. A student answering every question correctly at "medium" will never be promoted to "hard" questions. A student struggling will never be dropped to "easy." This is a static experience that does not mirror how a real DPE adjusts their questioning depth.

> [!note] Difficulty Affects Prompt, Not Element Selection
> Difficulty does not change which elements are selected (except via the initial filter in `buildElementQueue`). It changes the system prompt instructions to Claude, asking for easier or harder questions on the same element. The mapping between difficulty levels and prompt language is stored in the `prompt_versions` table.

### Difficulty Filtering Edge Case

**File**: `src/lib/exam-logic.ts:140-146`

```
If difficulty != 'mixed':
  filtered = elements.filter(e => e.difficulty_level === difficulty)
  if filtered.length === 0:
    filtered = elements  // silent fallback
```

> [!risk] Inconsistent User Experience
> If a rating has no elements tagged as "hard" in the database (because `difficulty_default` was never set or defaults to "medium"), a user selecting "hard" gets the full unfiltered queue at whatever default difficulty the prompt provides. The user's explicit preference is silently discarded.

---

## 6. Examiner-Led Flow — Not Enforced

### How a Real DPE Operates

A real Designated Pilot Examiner:
1. **Leads the conversation** — decides the topic, depth, and transitions
2. **Follows up on weak answers** — probes deeper when a student gives a partial or incorrect answer
3. **Creates logical transitions** — "You mentioned you'd check weather. What specific weather products would you use?" naturally transitions from flight planning to weather services
4. **Adjusts scope dynamically** — spends more time on areas of weakness, less on areas of demonstrated competence
5. **Has a mental model of coverage** — knows which areas have been satisfactorily covered and which still need testing

### Current System Behavior

> [!risk] Examiner Does Not Lead
> The current system inverts the DPE model. The **planner** decides which element to test next. The **examiner** (Claude) generates a question for that element. The examiner reacts to the student's answer within the scope of the current element, but has no agency to:
>
> - Decide to probe deeper (the planner advances to the next element after each exchange)
> - Choose a logically connected follow-up topic
> - Skip an area because the student demonstrated mastery through a related answer
> - Circle back to an earlier topic based on something the student said
>
> The examiner is a question-generating function, not a test conductor.

### Follow-Up Questions

The `assessAnswer` output includes a `follow_up_needed` boolean field. When `true`, it indicates the assessor believes the student's answer requires follow-up probing. However:

> [!risk] follow_up_needed Not Acted Upon
> The `follow_up_needed` signal from assessment is available but the planner does not use it to decide whether to stay on the current element or advance. The planner always advances to the next element in the queue regardless of assessment outcome. This means a student who gives a dangerously wrong answer about airspace regulations will be moved to an unrelated topic rather than being probed further — the opposite of what a real DPE would do.

---

## 7. Linear vs. Cross-ACS: Current State vs. Desired State

### Current State

| Mode | Ordering | Transitions | Realism |
|------|----------|-------------|---------|
| Linear | ACS document order | Sequential through codes | None (textbook study) |
| Cross-ACS | Fisher-Yates random | Random jumps | Low (no logical connections) |
| Weak Areas | Weighted random | Random jumps | Low (adaptive but random) |

### Desired State

A realistic oral exam mode would:

1. **Start with a scenario**: "You're planning a cross-country flight from KJAX to KATL in a Cessna 172. Walk me through your planning process." This naturally covers weather (Area VII), performance (Area III), regulations (Area I), and airspace (Area VI).

2. **Follow the student's thread**: If the student mentions checking NOTAMs, follow up on NOTAM types and sources before moving to the next topic.

3. **Use knowledge graph edges**: The `concept_relations` table with its 6 relation types (`prerequisite_of`, `related_to`, `component_of`, `tested_with`, `regulatory_basis_for`, `common_misconception_with`) could power logically connected transitions.

4. **Maintain a coverage map**: Track which ACS areas have been satisfactorily covered and steer toward uncovered areas.

> [!todo] Scenario-Based Mode
> A future "scenario" study mode would require:
> - A scenario generator that selects a flight profile covering multiple ACS areas
> - A transition planner that uses knowledge graph edges to find connected elements
> - Examiner autonomy to follow up within an element before advancing
> - Coverage tracking at the area level with minimum depth requirements

---

## 8. Examiner Personalities

### Four Personas

The system supports 4 examiner personas stored in the `prompt_versions` table. Each persona has a distinct system prompt that shapes Claude's communication style:

| Persona | Description | Behavioral Traits |
|---------|-------------|-------------------|
| Standard DPE | Default professional examiner | Formal, methodical, by-the-book |
| Friendly DPE | Approachable examiner | Encouraging, patient, conversational |
| Strict DPE | Demanding examiner | Concise, expects precision, challenges assumptions |
| Socratic DPE | Teaching-oriented examiner | Answers questions with questions, guides discovery |

> [!note] Persona Affects Style, Not Substance
> All personas test the same ACS elements and use the same assessment criteria. The persona changes the examiner's tone, follow-up style, and encouragement level, but does not affect scoring or element selection. This is a good design decision — personality should not change the standard being applied.

> [!risk] Persona Prompts Not Audited for Grounding
> The persona system prompts were not reviewed as part of the RAG grounding audit (Document 04). If any persona prompt includes instructions that override or dilute the grounding instructions (e.g., "feel free to share your own aviation experience"), it could increase hallucination risk for that persona.

---

## 9. Missing Features Summary

| # | Feature | Current State | Impact | Priority |
|---|---------|--------------|--------|----------|
| 1 | **Question budget** | No limit; runs until queue exhausted or user ends | Sessions have no natural scope | High |
| 2 | **Follow-up probing** | `follow_up_needed` computed but not acted upon | Weak answers not challenged | High |
| 3 | **Logically connected transitions** | Random shuffle in cross_acs mode | Unrealistic exam flow | Medium |
| 4 | **Adaptive difficulty** | Static per-session setting | No response to student performance | Medium |
| 5 | **Scenario-based mode** | Not implemented | Cannot simulate real oral exam structure | Medium |
| 6 | **Examiner flow control** | Planner controls flow, examiner generates questions | Examiner cannot lead the test | High |
| 7 | **Coverage-aware steering** | Queue-based; no area-level tracking during session | Cannot ensure balanced coverage | Medium |
| 8 | **Extra probe limit** | No probing at all (see #2) | No depth control on weak areas | Low |
| 9 | **Difficulty fallback notification** | Silent fallback when filter empties queue | User unaware preference was ignored | Low |
| 10 | **Cold start guidance for weak areas** | Behaves like random for new users | Misleading mode description | Low |

---

## 10. Exam Completion States

The exam can end in the following states:

| Trigger | Condition | Grading Basis |
|---------|-----------|---------------|
| `all_tasks_covered` | Cursor has visited all queue positions | All elements attempted |
| `user_ended` | Student clicks "End Exam" | Only elements actually attempted |
| `session_timeout` | Not implemented | N/A |
| `budget_reached` | Not implemented | N/A |

> [!note] User-Ended Grading Is Fair
> When a student ends early, they are graded only on elements they were actually asked about. This prevents penalizing a student who runs out of time. However, it also means a student can "game" the system by ending the exam after a streak of correct answers, before reaching their weak areas.

> [!todo] Consider Minimum Coverage Requirement
> A real oral exam requires satisfactory demonstration across ALL areas of operation. The system should consider requiring minimum coverage (e.g., at least one element per selected area) before allowing a "pass" grade on user-ended sessions. Data for this check exists in the `score_by_area` computation within `computeExamResult`.

---

*Audit conducted 2026-02-24. Based on production state as of commit `80dbc7e`.*
