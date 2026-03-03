---
date: 2026-02-27
type: system-audit
tags: [heydpe, system-audit, testing, evidence, test-matrix]
status: final
evidence_level: high
---

# Test Matrix and Evidence Pack

## How to Run Tests

### Unit Tests (Vitest)
```bash
npm test          # Run all tests (~1.1s)
npm run test:watch # Watch mode
npx vitest run --reporter=verbose  # Verbose output
```

### Type Checking
```bash
npm run typecheck  # or: npx tsc --noEmit
```

### Linting
```bash
npm run lint       # ESLint (122 errors, 61 warnings on 2026-02-27)
```

### Build
```bash
npm run build      # Next.js production build
```

## Test Suite Inventory

### Library Tests (src/lib/__tests__/) — 495 total tests on main

| Test File | Tests | Duration | Coverage Area |
|-----------|-------|----------|---------------|
| exam-logic.test.ts | 76 | 11ms | Area filtering, task selection, prompt construction, element queue building, exam result computation |
| app-env.test.ts | 35 | 8ms | Environment detection, production safety guards |
| rag-filters.test.ts | 32 | 4ms | RAG filter inference: doc type, abbreviation, PHAK, CFR, AIM detection |
| exam-plan.test.ts | 31 | 9ms | Exam planning: question count, bonus, follow-ups, mention credit, completion |
| browser-detect.test.ts | 31 | 5ms | Browser capability detection: AudioWorklet, SpeechRecognition, Web Audio |
| session-policy.test.ts | 26 | 23ms | Session enforcement, grading policy, concurrent session limits |
| email.test.ts | 25 | 6ms | Transactional emails via Resend: signup, subscription, payment failed |
| analytics-utils.test.ts | 24 | 31ms | groupByDate, fillDateGaps, MRR, churn rate, trial conversion |
| bench-stats.test.ts | 20 | 3ms | Benchmark statistics calculations |
| email-routing.test.ts | 17 | 3ms | Email routing logic: support, moderation, domain parsing |
| sentence-boundary.test.ts | 16 | 4ms | TTS sentence boundary detection for streaming |
| image-retrieval.test.ts | 15 | 7ms | Image search and retrieval from source_images |
| graph-retrieval.test.ts | 14 | 3ms | Concept bundle fetching, formatting for prompt |
| eval-helpers.test.ts | 12 | 3ms | Safe eval for session policy JiTai rules |
| utm.test.ts | 12 | 3ms | UTM parameter parsing |
| ttl-cache.test.ts | 9 | 4ms | TTL cache get/set/expiry behavior |
| analytics.test.ts | 8 | 3ms | GA4 tracking: signup, purchase, trial, SSR safety |
| timing.test.ts | 6 | 4ms | Latency timing spans |
| voice-usage.test.ts | 6 | 14ms | Voice usage logging |
| provider-factory.test.ts | 3 | 1ms | TTS provider selection by tier |

### Script Tests (scripts/__tests__/) — ~77 tests

| Test File | Tests | Coverage Area |
|-----------|-------|---------------|
| infer-edges.test.ts | 22 | Edge inference: LLM, embedding similarity, CFR strategies |
| chunk-utils.test.ts | 17 | PDF text chunking, paragraph flattening |
| extract-topics.test.ts | 15 | Topic concept extraction from FAA docs |
| embed-concepts.test.ts | 13 | Concept embedding text generation |
| extract-regulatory-claims.test.ts | 10 | CFR claim extraction and parsing |

### Phase 5 Tests (PR #3 only, not on main)
| Test File | Tests | Coverage Area |
|-----------|-------|---------------|
| exam-result.test.ts | 27 | ExamResultV2 computation, per-area gating, weak elements, critical areas, quick drill queue |

## Feature Coverage Map

| Feature | Test File(s) | Coverage Level |
|---------|-------------|----------------|
| ACS task filtering | exam-logic.test.ts | High (76 tests) |
| Exam planning (ExamPlanV1) | exam-plan.test.ts | High (31 tests) |
| RAG filter inference | rag-filters.test.ts | High (32 tests) |
| Session policy | session-policy.test.ts | Medium (26 tests) |
| Email transactional | email.test.ts | Medium (25 tests) |
| Browser detection | browser-detect.test.ts | Medium (31 tests) |
| Analytics calculations | analytics-utils.test.ts | Medium (24 tests) |
| Graph retrieval | graph-retrieval.test.ts | Medium (14 tests) |
| Image retrieval | image-retrieval.test.ts | Medium (15 tests) |
| TTS sentence boundary | sentence-boundary.test.ts | Medium (16 tests) |
| Knowledge graph scripts | 5 script test files | Medium (~77 tests) |
| Exam engine (Claude calls) | NONE | **Gap** — no tests for assessAnswer/generateExaminerTurn |
| RAG retrieval (searchChunks) | NONE | **Gap** — no tests for actual search |
| Voice provider integration | provider-factory.test.ts | Low (3 tests, factory only) |
| Stripe billing | NONE | **Gap** — no tests |
| Admin APIs | NONE | **Gap** — no tests |
| Auth flow | NONE | **Gap** — no tests |
| Session enforcement | session-policy.test.ts | Partial (policy only, not HTTP) |
| Grading V2 | exam-result.test.ts (PR #3) | High (27 tests, but not on main) |

## Known Test Gaps

1. **Exam Engine**: `assessAnswer()` and `generateExaminerTurn()` have zero tests. These call Claude API — would need mocking.
2. **RAG Search**: `searchChunks()` and `searchWithFallback()` untested. Would need Supabase mock or test DB.
3. **API Routes**: No HTTP-level tests for any API route. No integration tests.
4. **Stripe/Billing**: Zero test coverage for checkout, webhook, portal, status.
5. **Admin Panel**: Zero tests for any admin API endpoint.
6. **Auth Flow**: No tests for signup, login, callback, middleware protection.
7. **E2E Tests**: e2e/ directory exists with spec files but they are Playwright-based and not run in CI (not included in `npm test`). Lint shows they have issues.
8. **Voice Integration**: Only factory selection tested. No TTS/STT provider tests.
9. **Frontend Components**: No component tests (no React Testing Library usage found).

## Evidence Pack Location

All raw test/build evidence stored at:
`docs/system-audit/evidence/2026-02-27/commands/`

| File | Description | Result |
|------|-------------|--------|
| npm-test.txt | Full Vitest output | 495 passed, 0 failed |
| npm-typecheck.txt | TypeScript check | Clean (exit 0) |
| npm-lint.txt | ESLint output | 122 errors, 61 warnings |
| npm-build.txt | Next.js production build | Success |
| git-status.txt | Working tree state | Clean (untracked only) |
| git-log-20.txt | Recent 20 commits | HEAD at 8dab6d3 |
| git-branches.txt | Branch list with tracking | 5 local branches |

## Reproducibility

To reproduce all evidence from scratch:
```bash
git checkout inventory-verification-sprint-20260227
npm install
npm test 2>&1 > evidence-test.txt
npm run typecheck 2>&1 > evidence-typecheck.txt
npm run lint 2>&1 > evidence-lint.txt
npm run build 2>&1 > evidence-build.txt
npx tsx scripts/audit/db-introspect.ts  # requires .env.local
```
