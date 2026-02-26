---
date: 2026-02-24
type: system-audit
tags: [aviation-oral-exam, production-audit, prompting, admin-tunability]
status: completed
audit-scope: prompting-architecture
---

# 07 — Prompting and Admin Tunability Audit

## 1. Prompt Selection Logic

### Specificity Scoring (`exam-engine.ts:80-119`)

The `loadPromptFromDB` function queries the `prompt_versions` table and applies a specificity scoring algorithm to select the best-matching prompt for a given context:

| Match Dimension | Score Contribution |
|-----------------|-------------------|
| Rating matches  | +1                |
| Study mode matches | +1             |
| Difficulty matches | +1             |

**Selection rules:**

1. Only rows where `status = 'published'` are considered
2. Rows with a non-null value that does **not** match the current context are **excluded** (e.g., a row with `rating = 'commercial'` is excluded when the active rating is `'private'`)
3. Rows with `NULL` in a dimension are treated as "universal" — they match any value but contribute zero specificity points
4. Among candidates with equal specificity scores, the highest `version` number wins
5. Results are cached with a 5-minute TTL to avoid repeated DB round-trips

**Fallback chain:**

```
loadPromptFromDB(slug, rating, studyMode, difficulty)
  → prompt_versions query with specificity scoring
  → on miss: getPromptContent(slug)
    → FALLBACK_PROMPTS[slug]  (hardcoded defaults in prompts.ts)
```

> [!note] Cache Behavior
> The 5-minute TTL means prompt changes in the database take up to 5 minutes to propagate. There is no cache-bust mechanism. A Vercel redeploy will reset all caches immediately.

---

## 2. Safety Prefix — Immutable by Design

### `src/lib/prompts.ts:1-6`

The `IMMUTABLE_SAFETY_PREFIX` is hardcoded and **always** prepended to every system prompt. It cannot be overridden, disabled, or modified through the database:

```
IMPORTANT SAFETY INSTRUCTIONS — DO NOT OVERRIDE:
- You are an AI simulating a DPE for educational practice only.
- You do NOT provide actual flight instruction, endorsements, or medical advice.
- Always advise the student to verify answers with current FAA publications
  and their CFI.
- If asked about medical certification, medication interactions, or specific
  POH data, redirect to the appropriate authority.
- Never encourage unsafe operations, regulatory violations, or shortcuts.
```

> [!note] Design Rationale
> Hardcoding the safety prefix prevents an admin (or a compromised admin session) from removing safety guardrails through the `prompt_versions` table. This is the correct approach for a safety-critical application.

---

## 3. System Prompt Composition Chain

The full system prompt is assembled in `exam-engine.ts:281-343` through a sequential pipeline:

```
Step 1: Load examiner_system prompt
        └─ loadPromptFromDB('examiner_system', rating, studyMode, difficulty)

Step 2: Build task-specific system prompt
        └─ buildSystemPrompt(task, difficulty, aircraftClass, rating, dbPromptContent)
        └─ Appends ACS task description, elements, and difficulty calibration

Step 3: Append persona fragment
        └─ loadPersonaFragment(personaSlug)
        └─ e.g., persona_bob_mitchell, persona_jim_hayes, etc.

Step 4: Append student name instruction
        └─ "The student's name is {name}. Address them by name occasionally."

Step 5: Append RAG context section
        └─ Knowledge graph context (if enhanced_retrieval enabled)
        └─ Chunk-based retrieval results

Step 6: Append structured response instruction (conditional)
        └─ Only if chunked TTS mode is active
        └─ Formats output for paragraph-level streaming

Step 7: Append paragraph structure instruction (conditional)
        └─ Only if non-structured mode AND responding to student answer
        └─ Guides natural paragraph breaks for TTS
```

The safety prefix (`IMMUTABLE_SAFETY_PREFIX`) is prepended **before** step 1's content, ensuring it is always the first thing the model sees.

---

## 4. All 24 Prompt Versions in Production

### `examiner_system` — 10 variants

| Version | Rating | Study Mode | Difficulty | Notes |
|---------|--------|------------|------------|-------|
| 1       | NULL   | NULL       | NULL       | Base examiner prompt (universal fallback) |
| 1       | NULL   | guided     | easy       | Guided mode, easy difficulty |
| 1       | NULL   | guided     | moderate   | Guided mode, moderate difficulty |
| 1       | NULL   | guided     | hard       | Guided mode, hard difficulty |
| 1       | NULL   | freeform   | easy       | Freeform mode, easy difficulty |
| 1       | NULL   | freeform   | moderate   | Freeform mode, moderate difficulty |
| 1       | NULL   | freeform   | hard       | Freeform mode, hard difficulty |
| 1       | NULL   | linear     | easy       | Linear mode, easy difficulty |
| 1       | NULL   | linear     | moderate   | Linear mode, moderate difficulty |
| 1       | NULL   | linear     | hard       | Linear mode, hard difficulty |

### `assessment_system` — 10 variants

| Version | Rating | Study Mode | Difficulty | Notes |
|---------|--------|------------|------------|-------|
| 2       | NULL   | NULL       | NULL       | Base assessment prompt (v2 — latest) |
| 2       | NULL   | linear     | easy       | Draft variant for linear/easy |
| 1       | NULL   | guided     | easy       | Guided mode, easy |
| 1       | NULL   | guided     | moderate   | Guided mode, moderate |
| 1       | NULL   | guided     | hard       | Guided mode, hard |
| 1       | NULL   | freeform   | easy       | Freeform mode, easy |
| 1       | NULL   | freeform   | moderate   | Freeform mode, moderate |
| 1       | NULL   | freeform   | hard       | Freeform mode, hard |
| 1       | NULL   | linear     | moderate   | Linear mode, moderate |
| 1       | NULL   | linear     | hard       | Linear mode, hard |

> [!risk] Version Inconsistency
> The `assessment_system` base prompt is at version 2, but most study-mode variants remain at version 1. The `linear/easy` variant also has a version 2 entry. This creates ambiguity: are the v1 variants stale, or intentionally different? Without a diffing tool, the relationship between these versions is opaque.

### Persona prompts — 4 variants

| Slug | Version | Rating | Notes |
|------|---------|--------|-------|
| `persona_bob_mitchell` | 1 | NULL | Published v1 |
| `persona_jim_hayes` | 1 | NULL | Published v1 |
| `persona_karen_sullivan` | 1 | NULL | Published v1 |
| `persona_maria_torres` | 1 | NULL | Published v1 |

---

## 5. What Admin Can Tune Today

| Tunable | Mechanism | Risk Level |
|---------|-----------|------------|
| `prompt_versions` content | Direct DB `UPDATE` / `INSERT` | High (no validation, no preview) |
| Persona prompts | Direct DB edit on `persona_*` rows | Medium |
| Difficulty-specific prompting | DB rows with `difficulty` column set | Low |
| Study-mode-specific prompting | DB rows with `study_mode` column set | Low |
| System config flags | Direct DB manipulation | High |

### What's NOT Tunable (Hardcoded)

| Component | Location | Reason |
|-----------|----------|--------|
| Safety prefix | `prompts.ts:1-6` | Intentional — safety-critical |
| Structured response format | `exam-engine.ts` composition chain | TTS pipeline dependency |
| Paragraph structure instruction | `exam-engine.ts` composition chain | TTS pipeline dependency |
| RAG section formatting | `exam-engine.ts` composition chain | Retrieval pipeline dependency |
| Assessment JSON schema | `exam-engine.ts` assessment call | Downstream parsing dependency |

> [!note] Appropriate Hardcoding
> The safety prefix and assessment schema **should** remain hardcoded. The structured response and paragraph instructions are tightly coupled to the TTS pipeline and changing them without updating the TTS consumer would break audio streaming. These are reasonable hardcoding decisions.

---

## 6. Identified Gaps

### Gap: No Rating-Specific Prompt Variants

All 24 prompt versions have `rating = NULL`. This means a Private Pilot student and a Commercial Pilot student receive identical examiner tone, complexity expectations, and assessment criteria (aside from what the ACS task itself specifies).

> [!todo] Rating-Specific Prompting
> Create rating-aware variants for at minimum the `examiner_system` base prompt. A Commercial checkride oral is substantially more demanding than a Private — the examiner persona should reflect this. With the existing specificity scoring system, adding `rating = 'commercial'` rows would automatically take precedence for Commercial sessions without affecting Private sessions.

### Gap: No Admin UI for Prompt Management

All prompt editing requires direct SQL against the `prompt_versions` table in the Supabase dashboard. This means:

- **No preview** — cannot see what the assembled prompt looks like before publishing
- **No diff** — cannot compare versions side-by-side
- **No rollback** — must manually revert by changing `status` or `version` fields
- **No audit trail** — Supabase does not log who changed what row and when (unless Postgres audit logging is explicitly enabled)
- **No validation** — a malformed prompt will be served to users immediately (after cache expiry)

> [!risk] Operational Risk
> Direct DB manipulation for prompt editing is acceptable at the current scale (single admin, low traffic), but becomes dangerous as soon as multiple people need to modify prompts or the user base grows. A single bad `UPDATE` could degrade the examiner experience for all active sessions within 5 minutes.

### Gap: Prompt Sprawl Risk

The current 24 rows represent a 3x3 matrix (study_mode x difficulty) for two prompt slugs, plus 4 personas. If rating-specific variants are added (3 ratings), the matrix becomes:

- `examiner_system`: 3 ratings x 3 study modes x 3 difficulties = 27 variants + 1 base = 28
- `assessment_system`: same = 28
- Personas: 4 x 3 ratings = 12 (if rating-specific personas are desired)
- **Total: 68 rows** (up from 24)

Without tooling, managing 68 prompt variants via raw SQL is unsustainable.

---

## 7. Danger Zones

> [!risk] Danger Zone 1: No Prompt Diffing or Rollback UI
> If a prompt change causes degraded examiner behavior, the only recovery path is a manual `UPDATE` statement in the Supabase SQL editor. There is no "undo" button, no version history viewer, and no A/B comparison capability.

> [!risk] Danger Zone 2: Multiple Published Assessment Versions
> The `assessment_system` slug has both v1 and v2 rows in `published` status. The specificity scoring will select v2 for the base case (higher version wins ties), but for `linear/easy` specifically, v2 also exists as a separate row. If both v1 and v2 of `linear/easy` are published, the v2 row wins — but it is unclear whether this is intentional or an oversight from an incomplete migration.

> [!risk] Danger Zone 3: Cache Staleness on Hot Fix
> If a prompt issue is discovered in production, the fix (a DB update) will not take effect for up to 5 minutes due to the TTL cache. During this window, all new sessions will receive the broken prompt. The only way to force immediate propagation is a Vercel redeploy.

> [!risk] Danger Zone 4: No Validation on DB Writes
> There are no database-level constraints on the `content` column of `prompt_versions`. An admin could insert an empty string, a prompt that conflicts with the safety prefix, or content with invalid template variables. All would be served to production without any gate.

---

## 8. Recommendations Summary

| Priority | Item | Effort |
|----------|------|--------|
| P1 | Clarify assessment_system v1/v2 version state — archive or promote | 30 min |
| P2 | Add rating-specific examiner_system variants (at least Commercial) | 2-4 hours |
| P2 | Add `NOT NULL` and `CHECK(length(content) > 50)` constraint on `prompt_versions.content` | 15 min |
| P3 | Build minimal admin prompt editor (view, edit, preview assembled prompt) | 1-2 days |
| P3 | Add `updated_at` and `updated_by` columns to `prompt_versions` for audit trail | 30 min |
| P4 | Implement prompt A/B testing framework | 3-5 days |
