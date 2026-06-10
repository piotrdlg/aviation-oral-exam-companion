# Review 13 — Alternatives to the Knowledge Graph for Non-Linear Exam Generation

> Date: 2026-06-09 · Answers owner question: "What is the alternative for graph to generate non-linear quality exams?"
> Context: the graph exists to make the examiner connect related topics the way a real DPE does, instead of walking the ACS linearly. Review 03 found the graph disconnected (slug bug), its edge semantics weak (3 of 6 relation types empty; bulk keyword/embedding edges), and its only quality measurement negative.

## The key insight

Non-linearity needs two capabilities: **(1) knowing which topics relate** and **(2) transitioning between them naturally mid-conversation**. The graph was built for (1). But there are three cheaper sources of (1) already available, and (2) was always going to be the LLM's job anyway. Also worth naming: **real DPEs don't use a knowledge graph either** — per the ACS, they use *scenario-based testing*: assign a cross-country flight and let weather → performance → airspace → systems → aeronautical decision-making emerge from the scenario's own logic.

## The alternatives, ranked

### A. Scenario-spine exams (closest to a real checkride)
At exam start, one extra Claude call generates a session scenario from the planned elements: "You're flying a Cherokee from Craig (KCRG) to Ocala (KOCF) on a July afternoon; a friend wants to come along; there's a line of buildups west…" The planner orders elements to fit the scenario's natural arc; every examiner question anchors in the evolving scenario ("Given those buildups, what weather products would you check? … And if you divert, how does that change your fuel reserves?").
- **Why it's strong:** This is literally how FAA-S-ACS examiners are instructed to test. Cross-topic flow is *inherent* — the scenario IS the connective tissue. It also naturally produces the "applies_in_scenario" relations the graph was supposed to encode but never got (review 03 finding 9).
- **Cost:** one LLM call per session (~$0.01–0.03) + a few hundred extra system-prompt tokens (cheap under prompt caching from W5.2). No infrastructure, no maintenance.
- **Risk:** scenario drift over a long session; mitigated by keeping the scenario summary pinned in the cached system prompt.

### B. LLM-chosen transitions (the model is already a knowledge graph)
Instead of the planner dictating the next element blindly, the server hands the examiner call a shortlist of 5–10 *pending* elements (codes + one-line descriptions) and instructs: "choose the one that connects most naturally to what the student just said, and bridge to it explicitly." Claude already knows carb icing relates to dewpoint spread — that world knowledge is what the 24K-node graph was trying to approximate with keyword edges.
- **Cost:** ~200–400 extra prompt tokens per exchange. Zero infrastructure.
- **Control:** the server still constrains the candidate set from the plan, so coverage guarantees and grading stay deterministic — the LLM only picks the *order*.
- **Risk:** occasional forced segues; measurable in the eval.

### C. Offline embedding-adjacency table (deterministic, no runtime cost)
One-time batch job: for each of the 2,174 `acs_elements`, compute its k=10 nearest neighbors by embedding similarity (element text, or the centroid of its linked RAG chunks) → an `element_adjacency` table. The planner's `pickNextElement` walks adjacency instead of the current area-keyword Jaccard. This is a "graph," but: precomputed, 2,174×10 rows instead of 24K nodes + 74K edges, no RPC recursion, no taxonomy maintenance, fully inspectable.
- **Cost:** one embedding batch run (~$1), one small table, zero runtime latency.
- **Note:** chunk co-occurrence (elements citing the same FAA document sections, already encoded in `concept_chunk_evidence`/chunk links) can blend in as a second signal for free.

### D. Status quo fallback — structural fingerprints
The area-keyword Jaccard similarity that production has *actually* been using all along (because of the slug bug, review 03 finding 1). Shallow, but it's the honest baseline: every exam shipped to date used this, so "the graph's question quality" has never actually been what users experienced.

## Recommendation

**Arm C of the W5.4 eval = A + B combined** (scenario-spine at session start + LLM-chosen transitions per exchange), with **C (embedding adjacency)** as the planner's ordering signal. This combination plausibly delivers *better* DPE realism than the graph — because it mirrors how examiners actually create non-linearity — at roughly 1% of the graph's complexity and near-zero marginal cost.

The decision stays empirical: W5.4 now compares three arms (plain chunk-RAG / graph-enhanced / scenario+LLM-transitions) on the same judge dimensions, with cross-topic probing quality as the headline metric. If the cheap alternative ties or beats the graph, D4 resolves to "adopt arm C, demote the graph" — the graph data stays for the admin explorer and future re-evaluation, but stops taxing every exchange.

One more economic point: the graph currently costs ~1–3K injected tokens × 2 Claude calls per exchange (review 03 finding 8). Arm C's marginal cost is one session-start call plus a few hundred tokens per exchange — at the LLM-COGS levels in review 12 (~$15.85/user/mo), this difference is material to gross margin.
