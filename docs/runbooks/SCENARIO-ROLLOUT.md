# Scenario Engine Rollout Runbook (W5.6 — Gate 2)

> Prerequisite: Gate 1 PASSED 2026-06-10 (`docs/reviews/2026-06-09-comprehensive-review/15-scenario-gate1-report.md` — overall 90.0%, cross-topic 90.9%). The rollout decision at each step below is the **owner's**, made from the report data.

The whole rollout is a one-flag operation on `system_config.exam.scenario_engine`:

| Value | Behavior |
|---|---|
| `{"mode": "off"}` | Classic behavior for every mode; the "Mock Checkride" card is hidden |
| `{"mode": "ab"}` | **A/B population = "Across ACS" (cross_acs) sessions only** — split 50/50 by sticky user hash (scenario vs adjacency walk); arm persisted in `exam_sessions.metadata.scenarioArm`; `exam_arm_assigned` event. Linear / Weak Areas / Quick Drill sessions are NEVER in the experiment. Card still hidden (no self-selection bias) |
| `{"mode": "on"}` | "Mock Checkride" appears as a first-class study-mode card; the engine runs only for sessions where the student picked it. Across ACS reverts to the pure adjacency walk |

Full mode × flag matrix with diagrams: `docs/design/exam-engine-design.html` §04. Linear order and difficulty behavior are guaranteed by the route-level test matrix in `exam-flow-regression.test.ts` ("mode × flag matrix").

In-flight sessions are never affected by a flag change — the spine and arm are fixed in session metadata at start.

## Step 1 — Enable the A/B

In the Supabase SQL editor (or admin config tooling):

```sql
UPDATE system_config SET value = '{"mode": "ab"}' WHERE key = 'exam.scenario_engine';
```

Verify: start a fresh exam on a test account **in "Across ACS" mode**; `exam_sessions.metadata.scenarioArm` is set and PostHog shows `exam_arm_assigned`. A linear-mode session must NOT get an arm.

## Step 2 — Monitor weekly

```bash
npm run audit:scenario-ab
```

Prints the Gate 2 table (per design §7): sessions/arm, exchanges/session, completion rate, report rate, p95 first-token latency, and the sample gate (n ≥ 200/arm or 14 days, whichever first). PostHog-side metrics (`examiner_assessment_mismatch`, `scenario_transition` followed_llm rate) live on the PostHog dashboard — filter by event property `arm` / session cohort.

Also watch `scenario_spine_generated` (source should be `generated`, not `template`; latency ~20s) and `scenario_transition` (followed_llm should be high; fallback means the model ignored the tag protocol).

## Step 3 — Qualitative review at threshold

When the report says READY:

```bash
npm run audit:scenario-ab -- --transcripts
```

Dumps 20 scenario-arm transcripts to `scenario-ab-transcripts.local.md` (gitignored; examiner/student text only) with an automated tail-number consistency scan. Your DPE-realism checklist per design §7:

- [ ] Transitions natural? (no "moving to Area X" announcements)
- [ ] Scenario consistent? (same aircraft/route/weather throughout — the scan pre-flags foreign tail numbers)
- [ ] No contradicted facts?
- [ ] Questions anchored in the scenario where natural?

## Step 4 — Decide

- **Roll forward:** `UPDATE system_config SET value = '{"mode": "on"}' WHERE key = 'exam.scenario_engine';`
- **Roll back:** `UPDATE system_config SET value = '{"mode": "off"}' WHERE key = 'exam.scenario_engine';`

Either way the change is instant for new sessions and a no-op for in-flight ones. After `on`, keep the weekly report for two more weeks, then retire the A/B columns from the dashboard.

## Failure playbook

| Symptom | Action |
|---|---|
| Spine source mostly `template` | Check `[scenario]` logs on Vercel; spine JSON may be failing validation — the exam still works (template fallback) |
| followed_llm rate < 50% | The model ignores the tag protocol; transitions still work (top-ranked fallback) but review prompt drift |
| Guardrail elevated (reports/mismatch) | Roll back to `off`; pull `--transcripts`; file findings against the design |
| Latency regression > +10% | Check prompt-cache hit rates in usage_logs (cache_read_input_tokens); the scenario block should be cache-served |
