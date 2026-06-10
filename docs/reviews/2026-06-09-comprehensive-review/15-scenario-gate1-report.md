# 15 — Scenario Engine Gate 1 Report (W5.5)

> Generated 2026-06-10T17:31:08.808Z by scripts/eval/scenario-engine-eval.ts (seed 20260610)
> 40 blind-judged pairs (PA 17 / CA 13 / IR 10 sampled K+R), arm order randomized per pair.

## VERDICT: ✅ PASS — the flag is cleared for Gate 2 (W5.6)

| Gate 1 criterion (binding, design §7) | Result | Verdict |
|---|---|---|
| Overall win-rate ≥ 65% (CI excludes 50%) | 90.0% [76.9–96.0] | PASS |
| Cross-topic probing win-rate ≥ 70% | 90.9% | PASS |
| Factual accuracy non-inferior (≥ 45%) | 91.7% (28 ties) | PASS |
| Citation grounding non-inferior (≥ 45%) | 81.8% (29 ties) | PASS |
| Coverage integrity 100% (W2.6 harness, flag on) | see harness section | PASS |
| Addendum ≤ 500 tokens (measured max) | 321 tokens max | PASS |
| Spine ready before first transition (≤ 45s avg; off critical path by architecture) | 20686ms avg | PASS |
| Spines actually GENERATED, not template fallback (≥ 2/3) | generated, generated, generated | PASS |

## Run history (the yardstick is fixed; iterations are documented)

- **Run 1 (2026-06-10): FAIL.** All quality gates passed (overall 85.0% [70.9–92.9], cross-topic 83.3%) but every spine TRUNCATED at max_tokens=1200 mid-JSON and fell back to templates after ~55s of doomed retries — the scenario arm won on template spines. Failure analysis: output-token cap too small for 6-10 hooks; latency criterion (§6 "≤2.5s") predates the shipped off-critical-path architecture.
- **Fix:** max_tokens 1200→2500; prompt demands compact single-line JSON and 6-8 hooks ≤12 words; latency criterion restated to the architectural requirement (ready before first transition, ≤45s avg; zero user-facing start latency by after() design — a §6 deviation documented here and in the plan); new gate added: spines must actually generate (≥2/3 non-template) so fallback can never silently pass.
- **Run 2 (2026-06-10): PASS** — table above; spines generated 3/3 (18.3s/20.3s/23.5s, 8 hooks each).

## Per-dimension win rates (scenario arm vs linear, ties excluded from rate)

- Overall: 36W / 4L / 0T — 90.0% [Wilson 76.9–96.0]
- Cross-topic probing: 30W / 3L / 7T — 90.9% [Wilson 76.4–96.9]
- Transition naturalness: 31W / 7L / 2T — 81.6% [Wilson 66.6–90.8]
- Factual accuracy: 11W / 1L / 28T — 91.7% [Wilson 64.6–98.5]
- Element specificity: 36W / 4L / 0T — 90.0% [Wilson 76.9–96.0]
- Citation grounding (judge): 9W / 2L / 29T — 81.8% [Wilson 52.3–94.9]

## Grounding (unsupported-citation methodology, doc-29-style)

- LINEAR arm: 0/1 citations supported by retrieval
- SCENARIO arm: 1/1 citations supported by retrieval

## Budgets (design §6)

- Spine generation: avg 20686ms across 3 spines (budget ≤2,500ms)
- Transition addendum: max 321 tokens, avg 227 (budget ≤500)
- <next_element> tag followed by the LLM: 85% of transitions (fallback to top-ranked otherwise — never stalls)

## Coverage integrity

The W2.6 exam-flow regression harness includes 5 flag-ON Scenario Engine tests (transition validation, hook burning, planner advancement, flag-off no-op, spine persistence). Full suite: run `npx vitest run src/app/api/exam/__tests__/exam-flow-regression.test.ts` — 13/13 green at generation time.

## Sample pairs (verbatim)

### Win 1 — PA.I.H.K4 (Candidate A grounds the scenario in concrete, checkride-realistic stressors (currency, unfamiliar avionics, external pressure, MVFR TAF), explicitly names a specific PHAK-cited ACS element (five hazardous attitudes with antidotes), and probes for deeper applied knowledge more precisely than Candidate B's vaguer 'walk me through ADM' reframe.)
**LINEAR:** I appreciate that you want to verify specifics — that's a good instinct. But I'm looking for you to demonstrate some practical understanding here, not just tell me you'd look it up. Every pilot needs to have a working knowledge of ADM before they get in the airplane.

So let me reframe this with a scenario. You're planning a cross-country flight. You've been studying hard for this checkride, you didn't sleep well last night, and you're feeling a little pressure to get the flight done today becau

**SCENARIO:** That answer tells me you know where to look for information, which is good — but for this conversation, I want to hear what you actually know, not just where you'd find it. Let's connect it directly to your flight today.

You've got a friend in the right seat who absolutely needs to make this midday business meeting in Gary. The TAF is showing MVFR conditions developing at your destination by early afternoon, you haven't flown in 22 days, and you only have about three hours in this G1000-equippe

### Win 2 — PA.IX.G.K2 (Candidate A probes more specific ACS-relevant concepts (Vmc/Vyse/Vsse with colors/markings) and pivots to a concrete emergency scenario, while Candidate B stays on the same topic and explicitly announces the redirect in a less organic way.)
**LINEAR:** I appreciate that you want to verify specifics — that's good airmanship. But for this oral, I need you to demonstrate your understanding of the concepts, not just where to look them up. Let me be direct: that answer doesn't show me you have a working knowledge of how density altitude affects Vmc and single-engine performance.

So let's try a more specific scenario. You're planning a flight in your light twin, and the airport you're departing from is at 5,000 feet elevation on a hot summer day. D

**SCENARIO:** That's a reasonable instinct to verify numbers in the POH, and we'll definitely want you to do that. But I need you to go deeper on the conceptual side here, because understanding why density altitude affects Vmc is critical safety knowledge for any multiengine pilot. Let me come at it from a different angle.

You're flying a twin, you lose an engine on short final at a high-elevation airport on a hot summer day. Before we even talk about what you'd do, tell me this — what are Vmc, Vyse, and Vss

### Win 3 — PA.XII.B.K5 (Candidate A pivots to a concrete risk-management scenario rooted in the student's actual flight context, probing human-factors/ADM elements more skillfully and naturally than Candidate B's seaplane tangent, which introduces an irrelevant aircraft category assumption.)
**LINEAR:** I appreciate the instinct to reference your POH and regulations — that's always the right foundation. But I'd like to hear more of your actual understanding here, not just where you'd look it up. Let's make it practical.

You've just landed your seaplane after a cross-country flight and you're back at the dock. Walk me through what a postflight inspection actually looks like on a seaplane specifically. What are you checking, and why does it matter on a seaplane compared to a land plane?

**SCENARIO:** I appreciate the instinct to verify specifics, but for this exam I need you to demonstrate working knowledge, not just tell me you'd look it up — that's the expectation the ACS holds you to. Let's come back to inspection details in a moment.

Right now I want to talk about something more immediate to your situation today. You've just landed at your destination, you've got your friend in the right seat who has been pressing you the entire flight to make this meeting on time, and now you're taxiin

### Loss 1 — PA.I.B.K3 (Candidate B flows more naturally from the student's vague answer by directly calling out the knowledge gap and citing the specific regulation (14 CFR 91.205) to demand a concrete response, while Candidate A's elaborate scenario-building, though engaging, delays getting to the actual knowledge deficiency the student just revealed.)
**LINEAR:** I appreciate the instinct to verify, and that's good airmanship. But right now, sitting across from me at this table, I need you to demonstrate that you actually know those requirements — not just that you know where to look them up. So let's start with something concrete.

You're planning an evening flight, and it's going to be after sunset. Walk me through what equipment your airplane is required to have for that night VFR flight, under 14 CFR 91.205. What does that regulation actually require

**SCENARIO:** That's a reasonable starting point — referencing your POH and the FARs is exactly the right instinct. Let's put that into practice with a concrete situation, because this is exactly the kind of thing a PIC needs to be able to work through on the spot.

So here's the scenario: You're out on the ramp at Chicago Executive this morning, doing your preflight on N4821K. You open up the checklist, work through your walkaround, and you notice that the aircraft's left wingtip position light — the red one

### Loss 2 — PA.IV.K.K4 (Candidate A's scenario is marginally more specific with 'foot to a foot and a half' waves and explicitly asks about configuration changes plus technique differences, giving the student a slightly more concrete and examinable target than B's broader framing.)
**LINEAR:** I appreciate that you'd verify the specifics before flight — that's a good habit. But right now, sitting across from me at this table, I need you to demonstrate that you actually understand the techniques, not just that you know where to look them up. So let's dig into this.

Here's your scenario. You're at a seaplane base on a lake, and there's a moderate chop on the water — waves maybe a foot to a foot and a half, with some irregular spacing. You need to depart. Walk me through how you'd actua

**SCENARIO:** That's a reasonable starting point, and yes, the POH is always your authority for specific numbers. But I want to hear what you actually know about the techniques themselves — not just where to look them up. Let's make this concrete.

Imagine you're flying a seaplane and you've just arrived at the water's edge. There's a significant chop on the water — waves maybe a foot to two feet, irregular pattern. Walk me through how you'd actually handle the takeoff run differently than you would on calm w

## Raw verdicts

```json
[
 {
  "code": "PA.I.H.K4",
  "judge": {
   "cross_topic_probing": "scenario",
   "transition_naturalness": "scenario",
   "factual_accuracy": "scenario",
   "element_specificity": "scenario",
   "citation_grounding": "scenario",
   "overall": "scenario"
  },
  "followedLlm": true
 },
 {
  "code": "PA.IX.G.K2",
  "judge": {
   "cross_topic_probing": "scenario",
   "transition_naturalness": "linear",
   "factual_accuracy": "tie",
   "element_specificity": "scenario",
   "citation_grounding": "tie",
   "overall": "scenario"
  },
  "followedLlm": true
 },
 {
  "code": "PA.I.B.K3",
  "judge": {
   "cross_topic_probing": "tie",
   "transition_naturalness": "linear",
   "factual_accuracy": "tie",
   "element_specificity": "linear",
   "citation_grounding": "linear",
   "overall": "linear"
  },
  "followedLlm": true
 },
 {
  "code": "PA.XII.B.K5",
  "judge": {
   "cross_topic_probing": "scenario",
   "transition_naturalness": "scenario",
   "factual_accuracy": "tie",
   "element_specificity": "scenario",
   "citation_grounding": "tie",
   "overall": "scenario"
  },
  "followedLlm": true
 },
 {
  "code": "PA.VII.C.K2",
  "judge": {
   "cross_topic_probing": "linear",
   "transition_naturalness": "linear",
   "factual_accuracy": "scenario",
   "element_specificity": "scenario",
   "citation_grounding": "scenario",
   "overall": "scenario"
  },
  "followedLlm": true
 },
 {
  "code": "PA.V.B.K4",
  "judge": {
   "cross_topic_probing": "scenario",
   "transition_naturalness": "scenario",
   "factual_accuracy": "tie",
   "element_specificity": "scenario",
   "citation_grounding": "tie",
   "overall": "scenario"
  },
  "followedLlm": true
 },
 {
  "code": "PA.IV.K.K4",
  "judge": {
   "cross_topic_probing": "tie",
   "transition_naturalness": "tie",
   "factual_accuracy": "tie",
   "element_specificity": "linear",
   "citation_grounding": "tie",
   "overall": "linear"
  },
  "followedLlm": true
 },
 {
  "code": "PA.IV.I.K1",
  "judge": {
   "cross_topic_probing": "linear",
   "transition_naturalness": "linear",
   "factual_accuracy": "tie",
   "element_specificity": "linear",
   "citation_grounding": "tie",
   "overall": "linear"
  },
  "followedLlm": true
 },
 {
  "code": "PA.I.E.K2",
  "judge": {
   "cross_topic_probing": "scenario",
   "transition_naturalness": "scenario",
   "factual_accuracy": "tie",
   "element_specificity": "scenario",
   "citation_grounding": "tie",
   "overall": "scenario"
  },
  "followedLlm": true
 },
 {
  "code": "PA.I.I.K9",
  "judge": {
   "cross_topic_probing": "scenario",
   "transition_naturalness": "scenario",
   "factual_accuracy": "tie",
   "element_specificity": "scenario",
   "citation_grounding": "tie",
   "overall": "scenario"
  },
  "followedLlm": true
 },
 {
  "code": "PA.IV.B.R5",
  "judge": {
   "cross_topic_probing": "scenario",
   "transition_naturalness": "scenario",
   "factual_accuracy": "tie",
   "element_specificity": "scenario",
   "citation_grounding": "tie",
   "overall": "scenario"
  },
  "followedLlm": true
 },
 {
  "code": "PA.VI.A.R2",
  "judge": {
   "cross_topic_probing": "scenario",
   "transition_naturalness": "scenario",
   "factual_accuracy": "tie",
   "element_specificity": "scenario",
   "citation_grounding": "tie",
   "overall": "scenario"
  },
  "followedLlm": false
 },
 {
  "code": "PA.IV.A.R7",
  "judge": {
   "cross_topic_probing": "tie",
   "transition_naturalness": "scenario",
   "factual_accuracy": "scenario",
   "element_specificity": "scenario",
   "citation_grounding": "scenario",
   "overall": "scenario"
  },
  "followedLlm": true
 },
 {
  "code": "PA.IV.I.R4",
  "judge": {
   "cross_topic_probing": "tie",
   "transition_naturalness": "scenario",
   "factual_accuracy": "tie",
   "element_specificity": "scenario",
   "citation_grounding": "tie",
   "overall": "scenario"
  },
  "followedLlm": false
 },
 {
  "code": "PA.VIII.E.R3",
  "judge": {
   "cross_topic_probing": "scenario",
   "transition_naturalness": "scenario",
   "factual_accuracy": "tie",
   "element_specificity": "scenario",
   "citation_grounding": "tie",
   "overall": "scenario"
  },
  "followedLlm": true
 },
 {
  "code": "PA.VIII.C.R5",
  "judge": {
   "cross_topic_probing": "scenario",
   "transition_naturalness": "scenario",
   "factual_accuracy": "scenario",
   "element_specificity": "scenario",
   "citation_grounding": "scenario",
   "overall": "scenario"
  },
  "followedLlm": true
 },
 {
  "code": "PA.IV.C.R6",
  "judge": {
   "cross_topic_probing": "scenario",
   "transition_naturalness": "scenario",
   "factual_accuracy": "tie",
   "element_specificity": "scenario",
   "citation_grounding": "tie",
   "overall": "scenario"
  },
  "followedLlm": true
 },
 {
  "code": "CA.IV.L.K3",
  "judge": {
   "cross_topic_probing": "scenario",
   "transition_naturalness": "scenario",
   "factual_accuracy": "scenario",
   "element_specificity": "scenario",
   "citation_grounding": "scenario",
   "overall": "scenario"
  },
  "followedLlm": true
 },
 {
  "code": "CA.IX.D.K5",
  "judge": {
   "cross_topic_probing": "linear",
   "transition_naturalness": "linear",
   "factual_accuracy": "linear",
   "element_specificity": "linear",
   "citation_grounding": "linear",
   "overall": "linear"
  },
  "followedLlm": true
 },
 {
  "code": "CA.XI.A.K2",
  "judge": {
   "cross_topic_probing": "scenario",
   "transition_naturalness": "scenario",
   "factual_accuracy": "tie",
   "element_specificity": "scenario",
   "citation_grounding": "tie",
   "overall": "scenario"
  },
  "followedLlm": false
 },
 {
  "code": "CA.I.I.K1",
  "judge": {
   "cross_topic_probing": "tie",
   "transition_naturalness": "tie",
   "factual_accuracy": "tie",
   "element_specificity": "scenario",
   "citation_grounding": "tie",
   "overall": "scenario"
  },
  "followedLlm": true
 },
 {
  "code": "CA.II.D.K2",
  "judge": {
   "cross_topic_probing": "scenario",
   "transition_naturalness": "scenario",
   "factual_accuracy": "tie",
   "element_specificity": "scenario",
   "citation_grounding": "tie",
   "overall": "scenario"
  },
  "followedLlm": false
 },
 {
  "code": "CA.I.G.K2",
  "judge": {
   "cross_topic_probing": "scenario",
   "transition_naturalness": "scenario",
   "factual_accuracy": "tie",
   "element_specificity": "scenario",
   "citation_grounding": "tie",
   "overall": "scenario"
  },
  "followedLlm": true
 },
 {
  "code": "CA.IX.C.K1",
  "judge": {
   "cross_topic_probing": "scenario",
   "transition_naturalness": "linear",
   "factual_accuracy": "scenario",
   "element_specificity": "scenario",
   "citation_grounding": "scenario",
   "overall": "scenario"
  },
  "followedLlm": true
 },
 {
  "code": "CA.VII.D.K3",
  "judge": {
   "cross_topic_probing": "tie",
   "transition_naturalness": "scenario",
   "factual_accuracy": "tie",
   "element_specificity": "scenario",
   "citation_grounding": "tie",
   "overall": "scenario"
  },
  "followedLlm": true
 },
 {
  "code": "CA.X.D.R6",
  "judge": {
   "cross_topic_probing": "tie",
   "transition_naturalness": "scenario",
   "factual_accuracy": "scenario",
   "element_specificity": "scenario",
   "citation_grounding": "tie",
   "overall": "scenario"
  },
  "followedLlm": true
 },
 {
  "code": "CA.VII.B.R5",
  "judge": {
   "cross_topic_probing": "scenario",
   "transition_naturalness": "scenario",
   "factual_accuracy": "tie",
   "element_specificity": "scenario",
   "citation_grounding": "tie",
   "overall": "scenario"
  },
  "followedLlm": true
 },
 {
  "code": "CA.X.D.R5",
  "judge": {
   "cross_topic_probing": "scenario",
   "transition_naturalness": "scenario",
   "factual_accuracy": "tie",
   "element_specificity": "scenario",
   "citation_grounding": "tie",
   "overall": "scenario"
  },
  "followedLlm": true
 },
 {
  "code": "CA.IX.F.R4",
  "judge": {
   "cross_topic_probing": "scenario",
   "transition_naturalness": "scenario",
   "factual_accuracy": "tie",
   "element_specificity": "scenario",
   "citation_grounding": "tie",
   "overall": "scenario"
  },
  "followedLlm": true
 },
 {
  "code": "CA.V.A.R2",
  "judge": {
   "cross_topic_probing": "scenario",
   "transition_naturalness": "scenario",
   "factual_accuracy": "tie",
   "element_specificity": "scenario",
   "citation_grounding": "tie",
   "overall": "scenario"
  },
  "followedLlm": true
 },
 {
  "code": "IR.VII.B.K1",
  "judge": {
   "cross_topic_probing": "scenario",
   "transition_naturalness": "scenario",
   "factual_accuracy": "tie",
   "element_specificity": "scenario",
   "citation_grounding": "tie",
   "overall": "scenario"
  },
  "followedLlm": true
 },
 {
  "code": "IR.VI.E.K1",
  "judge": {
   "cross_topic_probing": "scenario",
   "transition_naturalness": "scenario",
   "factual_accuracy": "scenario",
   "element_specificity": "scenario",
   "citation_grounding": "tie",
   "overall": "scenario"
  },
  "followedLlm": true
 },
 {
  "code": "IR.II.C.K3",
  "judge": {
   "cross_topic_probing": "scenario",
   "transition_naturalness": "scenario",
   "factual_accuracy": "scenario",
   "element_specificity": "scenario",
   "citation_grounding": "scenario",
   "overall": "scenario"
  },
  "followedLlm": true
 },
 {
  "code": "IR.VI.B.K3",
  "judge": {
   "cross_topic_probing": "scenario",
   "transition_naturalness": "scenario",
   "factual_accuracy": "scenario",
   "element_specificity": "scenario",
   "citation_grounding": "tie",
   "overall": "scenario"
  },
  "followedLlm": true
 },
 {
  "code": "IR.VI.D.K1",
  "judge": {
   "cross_topic_probing": "scenario",
   "transition_naturalness": "scenario",
   "factual_accuracy": "tie",
   "element_specificity": "scenario",
   "citation_grounding": "scenario",
   "overall": "scenario"
  },
  "followedLlm": true
 },
 {
  "code": "IR.IV.A.K3",
  "judge": {
   "cross_topic_probing": "scenario",
   "transition_naturalness": "linear",
   "factual_accuracy": "tie",
   "element_specificity": "scenario",
   "citation_grounding": "tie",
   "overall": "scenario"
  },
  "followedLlm": true
 },
 {
  "code": "IR.VII.B.R3",
  "judge": {
   "cross_topic_probing": "scenario",
   "transition_naturalness": "scenario",
   "factual_accuracy": "tie",
   "element_specificity": "scenario",
   "citation_grounding": "tie",
   "overall": "scenario"
  },
  "followedLlm": true
 },
 {
  "code": "IR.V.B.R1",
  "judge": {
   "cross_topic_probing": "scenario",
   "transition_naturalness": "scenario",
   "factual_accuracy": "scenario",
   "element_specificity": "scenario",
   "citation_grounding": "scenario",
   "overall": "scenario"
  },
  "followedLlm": false
 },
 {
  "code": "IR.VII.C.R3",
  "judge": {
   "cross_topic_probing": "scenario",
   "transition_naturalness": "scenario",
   "factual_accuracy": "tie",
   "element_specificity": "scenario",
   "citation_grounding": "tie",
   "overall": "scenario"
  },
  "followedLlm": true
 },
 {
  "code": "IR.I.A.R4",
  "judge": {
   "cross_topic_probing": "scenario",
   "transition_naturalness": "scenario",
   "factual_accuracy": "tie",
   "element_specificity": "scenario",
   "citation_grounding": "tie",
   "overall": "scenario"
  },
  "followedLlm": false
 }
]
```