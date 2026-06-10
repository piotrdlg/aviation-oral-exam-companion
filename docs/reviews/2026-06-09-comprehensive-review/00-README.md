# Comprehensive Code & Database Review — 2026-06-09

Seven parallel subsystem reviews performed by AI agents on 2026-06-09, feeding the
master remediation plan at `docs/plans/2026-06-09-launch-readiness-master-plan.md`.

| File | Subsystem | Headline finding |
|------|-----------|------------------|
| `01-docs-synthesis.md` | Documentation corpus (~174 docs) | Final launch gate (doc 64) was never built; actual verdict was "LAUNCH WITH CAUTION"; 12 documented contradictions between docs |
| `02-exam-engine-grading.md` | Exam engine, grading, progress | **Planner never advances in a live exam** (critical); 20 confirmed bugs incl. silent grading failures, lost progress on resume |
| `03-knowledge-graph-rag.md` | Knowledge graph & RAG | cross_acs mode never uses the graph (slug mismatch bug); only quality measurement (grounding audit) was negative; flagship RPCs are dead code |
| `04-voice-stack.md` | TTS/STT + market check | Premium Cartesia tier doesn't exist in code; TTS quota counts requests not chars; recommendation: keep cascaded architecture, upgrade components |
| `05-stripe-commercialization.md` | Payments & monetization | Quota enforcement largely decorative; free tier gets the paid voice differentiator; webhook out-of-order guard is a no-op |
| `06-security-db-infra.md` | Security, DB, ops | 3 critical: SECURITY DEFINER RPC cross-user leak, anon instructor PII exposure, exam-route IDOR writes; no CI/CD |
| `07-mobile-readiness.md` | iOS/Android readiness | Backend ~85% reusable; blocker is cookie-only auth; recommendation: React Native + Expo + RevenueCat |
| `12-voice-economics-d2.md` | D2 financial analysis (added later 2026-06-09) | Stay on Aura-2: $5.72 vs $10.07–13.34 blended voice COGS/user/mo; ElevenLabs whales cost 1.8–2.4× revenue. **Owner confirmed: Aura-2.** |
| `13-non-linear-exam-alternatives.md` | Graph alternatives, owner Q4 (added later 2026-06-09) | Scenario-spine + LLM-chosen transitions + embedding adjacency ≈ DPE realism at ~1% of graph complexity. **Owner decided: drop the graph; this became the Scenario Engine — full design in `docs/plans/2026-06-09-scenario-engine-design.md`, built and proven via plan tasks W5.3–W5.6.** |

(Files 08–11 are produced by plan tasks W0.2, W6.2, W7.1, W7.2; file 14 by W5.3 adjacency QC; file 15 by W5.5 Gate 1.)

All findings carry file:line or doc citations. Production state caveats: feature-flag
values and row counts could not be verified live from the repo; verify against
`system_config` and the Supabase dashboard before acting on flag-dependent items.
