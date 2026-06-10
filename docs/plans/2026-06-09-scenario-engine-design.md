# Scenario Engine — Non-Linear Exam Generation Design

> Date: 2026-06-09 · Status: Approved design (owner decision D4: drop graph, build this)
> Supersedes the knowledge-graph runtime path for non-linear exam generation.
> Companion docs: `docs/reviews/2026-06-09-comprehensive-review/13-non-linear-exam-alternatives.md` (rationale),
> `03-knowledge-graph-rag.md` (why the graph is being dropped), master plan Phase 5 (execution tasks).

## 1. Goal and principles

Generate oral exams that move between ACS topics the way a real DPE does — through a living scenario and natural conversational pivots — instead of walking the ACS linearly. Constraints:

1. **Mimic reality.** FAA-S-ACS guidance instructs examiners to use scenario-based testing: assign a flight, let weather → performance → airspace → systems → ADM questions emerge from the scenario's own logic. The engine replicates that mechanism, not an abstraction of it.
2. **Server-authoritative.** Builds on the W2.1 refactor: all plan/scenario/transition state lives in `exam_sessions.metadata`; the LLM chooses *order and segue* within a server-controlled envelope, never coverage or grading.
3. **Deterministic guarantees survive.** Plan coverage, element budgets, grading inputs, and weak-area targeting remain exactly as deterministic as today — non-linearity changes the *sequence*, never the *set*.
4. **Provable.** The engine ships only after passing an offline judged evaluation and a production A/B with predefined acceptance gates (§7). "Sophisticated" is claimed by evidence, not architecture.
5. **Cheap.** Budget: one extra LLM call per session + ≤500 extra prompt tokens per exchange (mostly cache-served) + one tiny table. No recursive queries, no graph maintenance.

## 2. Architecture — three layers

```
OFFLINE (batch, per rating)      SESSION START (once)              PER EXCHANGE (respond path)
┌────────────────────────┐      ┌───────────────────────┐         ┌─────────────────────────────┐
│ element_adjacency      │      │ Scenario Spine        │         │ Transition Policy           │
│ k-NN over element      │ ───▶ │ 1 Claude call →       │  ───▶   │ server shortlist (ranked)   │
│ embeddings + chunk     │      │ structured scenario   │         │ → examiner LLM picks + segue│
│ co-occurrence blend    │      │ JSON, persisted,      │         │ → server validates choice   │
│ (2,174 × 12 rows)      │      │ pinned in cached      │         │ → planner advances          │
└────────────────────────┘      │ system prompt         │         └─────────────────────────────┘
                                └───────────────────────┘
```

## 3. Layer 1 — Element relatedness (`element_adjacency`)

Replaces both the dropped graph traversal and the keyword-Jaccard structural fingerprints.

**Build (offline script, re-runnable):** for each of the 2,174 `acs_elements`, compute a blended relatedness score to every other element of the same rating:

- **0.60 × embedding similarity** — cosine over `text-embedding-3-small` embeddings of `"{element code} {element text} — task: {task title}, area: {area title}"`. Captures semantic kinship (carb icing ↔ dewpoint spread) the way the graph's keyword edges never did.
- **0.25 × source co-occurrence** — Jaccard over the sets of `source_chunks` retrieved for each element (top-10 hybrid-search results per element, computed in the same batch). Elements taught in the same FAA handbook sections are pedagogically adjacent. Reuses existing chunk infrastructure; no graph tables.
- **0.15 × structural prior** — same task: 1.0; same area: 0.5; cross-area: 0. Keeps a mild bias toward coherent task clusters so the exam doesn't feel random.

Keep top **k = 12** neighbors per element with score ≥ 0.35. Schema:

```sql
CREATE TABLE element_adjacency (
  element_code text REFERENCES acs_elements(code),
  related_code text REFERENCES acs_elements(code),
  score numeric NOT NULL,
  signals jsonb NOT NULL,          -- {embedding: x, cooccurrence: y, structural: z}
  built_at timestamptz NOT NULL,
  PRIMARY KEY (element_code, related_code)
);
-- RLS: read authenticated, write service-only
```

**Quality control (mandatory build output):** a human-readable report sampling 30 random elements with their neighbor lists, plus the 50 highest cross-*area* pairs (the interesting ones). Owner (a CFI) eyeballs it once; obvious nonsense pairs become a stoplist file consumed by rebuilds. This is the entire "edge curation" burden — compare with the graph's 74K uncurated edges.

**Cost:** ~2,174 embeddings (~$0.05) + one batch of hybrid searches; minutes of compute; re-run only when ACS revisions land.

## 4. Layer 2 — Scenario spine (session start)

One additional Claude call when the exam starts, after the plan is built:

**Input:** rating, the plan's element set (codes + short texts), session config (difficulty, focus areas, study mode), examiner persona.
**Output (validated structured JSON):**

```jsonc
{
  "scenario": {
    "aircraft": "Piper Archer, N8421D, steam gauges + GTN 650",
    "mission": "Day VFR cross-country KCRG → KOCF with a non-pilot friend",
    "conditions": "July afternoon, scattered buildups west, density altitude notable",
    "pilot": "You, a private pilot applicant on your checkride day",
    "constraints": ["friend is prone to airsickness", "return needed by 6pm"]
  },
  "hooks": [
    { "element_code": "PA.I.B.K2", "hook": "currency requirements to carry the passenger" },
    { "element_code": "PA.VI.A.K1", "hook": "the buildups west of the route" }
  ],
  "events": [
    { "trigger": "after_area:PA.VII", "event": "alternator light flickers near Gainesville" }
  ]
}
```

**Validation (server, hard):** every `hooks[].element_code` must exist in the plan (drop strays); JSON schema enforced with one retry then a generic template fallback (a library of 3 pre-written scenarios per rating, so the engine degrades to "good" rather than failing). Persisted to `exam_sessions.metadata.scenario`; rendered into the system prompt as a pinned `EXAM SCENARIO` block — inside the prompt-cache prefix (W5.2), so its per-exchange token cost is cache-priced.

**Why a spine and not free improvisation:** the scenario is generated *from the plan*, so every planned element has a plausible doorway; the examiner never has to force a segue from short-field landings to medical certificates — the scenario already contains the thread.

## 5. Layer 3 — Transition policy (per exchange)

Runs inside the W2.1 server-side advancement decision (advance on satisfactory or 2 attempts):

1. **Server builds a ranked shortlist** of 5 candidate next elements from the plan's *pending* set:
   `candidate_score = 0.45 × adjacency(current, candidate) + 0.25 × coverage_urgency + 0.20 × weak_area_weight + 0.10 × hook_bonus`
   where `coverage_urgency` raises areas falling behind the plan's distribution, `weak_area_weight` reuses the existing weak-areas signal, and `hook_bonus` (+1) marks candidates with a scenario hook not yet used. Adjacency rows for the session's plan are loaded once at start and cached in metadata — zero extra DB round trips per exchange.
2. **Examiner prompt addendum** (~300–400 tokens): the shortlist as `code — one-line text — hook (if any)`, plus: *"Transition now. Choose the candidate that connects most naturally to the student's last answer or to the scenario, bridge to it explicitly in one sentence (reference what they said or the scenario — never announce 'moving to Area X'), then ask the first question. Emit `<next_element>CODE</next_element>` before your reply."*
3. **Server validates** the emitted code ∈ shortlist → advances the planner to it. Missing/invalid tag → server advances to the top-ranked candidate and proceeds (the examiner text still flows; only ordering control falls back). Either way the choice is logged (`scenario_transition` telemetry: chosen vs top-ranked, segue text) — this feeds the eval.
4. **Events:** when a `trigger` matches (area completed, exchange count), the next transition prompt includes the event ("work the alternator light into your next question"). v1 ships with spine-generated events only; a curated per-area event library is a v2 enhancement.

**Grading is untouched:** the chosen element becomes the planner's current element exactly as a linear advance would; assessment, element_attempts, coverage, and completion logic are identical.

## 6. Cost and latency budget (acceptance thresholds)

| Item | Budget |
|---|---|
| Session-start spine call | ≤ $0.03, ≤ 2.5s (runs in parallel with first-question generation — first question uses the spine only if ready, else linear opener) |
| Per-exchange prompt overhead | ≤ 500 tokens, ≥ 70% of scenario block served from prompt cache |
| Added DB round trips per exchange | 0 (adjacency cached in session metadata) |
| Net voice/LLM COGS impact | ≤ +5% of per-exchange LLM cost (vs the dropped graph's 1–3K tokens × 2 calls — a net *saving*) |

## 7. Proof plan — "will prove to work"

The engine ships through two gates with predefined numbers. Failing a gate means iterate or abandon — the flag stays off.

**Gate 1 — Offline judged evaluation** (plan task W5.5):
40 stratified elements × simulated 3-exchange conversation tails; two arms: **linear baseline** (current production behavior) vs **scenario engine**. Blind LLM judge ranks per dimension: cross-topic probing quality, transition naturalness, factual accuracy, element specificity, citation grounding. Acceptance:
- Overall win-rate ≥ **65%** for the scenario arm (binomial CI excluding 50%);
- Cross-topic probing win-rate ≥ **70%** (the metric the engine exists for);
- Accuracy and grounding **no worse** than baseline (win-rate ≥ 45% each — non-inferiority);
- Coverage integrity **100%**: simulated full exams complete their plans (reuses the W2.6 harness);
- Token overhead within §6 budget (measured, not estimated).

**Gate 2 — Production A/B** (plan task W5.6): flag `exam.scenario_engine`, 50/50 assignment for new sessions, ≥2 weeks or ≥200 sessions/arm (whichever first at current traffic; owner may extend):
- Primary: exchanges per session and session completion rate **not lower** than control (engagement proxy);
- Guardrails: report-rate and examiner_assessment_mismatch telemetry not elevated; p95 first-token latency within +10%;
- Qualitative: owner reviews 20 scenario-arm transcripts against a DPE-realism checklist (transitions natural? scenario consistent? no contradicted facts?);
- Conversion (trial→paid) tracked as informational (underpowered at current traffic — do not gate on it).

**Continuous regression:** the W2.6 exam-flow harness gains scenario assertions: spine JSON validates; every transition's chosen element ∈ shortlist; scenario facts (aircraft, route) never mutate mid-session (string-consistency check over examiner turns).

## 8. Failure modes and mitigations

| Failure | Mitigation |
|---|---|
| Scenario drift / self-contradiction over long sessions | Spine pinned in cached prompt; consistency check in harness; transition prompt restates the active scenario element in one line |
| Forced/awkward segues | Judge dimension in Gate 1; server fallback means a bad LLM choice degrades to top-ranked candidate, not a stall |
| Spine generation failure | One retry → template-scenario fallback library (never blocks exam start) |
| Hallucinated scenario facts conflicting with regulations | Unchanged RAG grounding: chunks are still retrieved per element and injected; assessment unchanged. Grounding non-inferiority is a Gate 1 criterion |
| Adjacency garbage pairs | One-time CFI eyeball of the QC report + stoplist; signals jsonb keeps every score explainable |
| Cost creep | §6 budgets measured in Gate 1 and asserted in the W7.1 launch gate's flag-sanity check |

## 9. What happens to the graph

Runtime injection, evidence-chain fingerprints, and the `get_concept_bundle` exam-path usage are removed (plan task W5.1). The `concepts`/`concept_relations` data and the admin graph explorer remain as a read-only archive (banner: experimental, not in the exam path) — deleting 24K rows buys nothing and forecloses future research. `hybrid_search`/`get_related_concepts` dead RPCs are dropped. CLAUDE.md updated to describe the Scenario Engine as the non-linear mechanism.
