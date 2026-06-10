# Claude Context File — HeyDPE

> Read this file first when working on any task in this repository.

---

## Overview

**HeyDPE** is a voice-first AI web application that simulates FAA Designated Pilot Examiner (DPE) oral examinations for checkride preparation. Supports Private Pilot (FAA-S-ACS-6C), Commercial Pilot (FAA-S-ACS-7B), and Instrument Rating (FAA-S-ACS-8C). The AI examiner follows the FAA Airman Certification Standards (ACS) to ask questions, assess answers, and naturally transition between topics.

**Brand**: HeyDPE (formerly HeyDPE)
**Owner**: Piotr (pd@imagineflying.com) — Imagine Flying LLC, Jacksonville, FL
**Live URL**: https://aviation-oral-exam-companion.vercel.app
**Repository**: https://github.com/piotrdlg/aviation-oral-exam-companion

---

## Tech Stack

| Layer | Technology | Notes |
|-------|-----------|-------|
| Framework | Next.js 16.1.6 | App Router, TypeScript, Turbopack |
| Styling | Tailwind CSS v4 | Dark theme (gray-950 base) |
| Database | Supabase (PostgreSQL) | pgvector, RLS, RPC functions |
| Auth | Supabase Auth | Email OTP, Google, Apple, Microsoft OAuth |
| AI Examiner | Claude Sonnet (`claude-sonnet-4-6`) | DPE persona + answer assessment |
| TTS | Multi-provider (Cartesia/Deepgram/OpenAI) | Tier-based voice selection via provider factory |
| STT | Deepgram Nova-3 | WebSocket, MediaRecorder (Opus/WebM) |
| Payments | Stripe | Checkout, billing portal, webhooks |
| Email | Resend + React Email | Transactional, digest, nudges |
| Analytics | PostHog | Client + server-side events |
| Testing | Vitest + Playwright | Unit (743+) + E2E (6 browser projects) |
| Deployment | Vercel | Auto-deploy from `main`, cron jobs |

---

## Project Structure

```
src/
├── app/
│   ├── (auth)/                     # Route group: login, signup (no nav)
│   │   ├── login/page.tsx          # Email OTP + OAuth
│   │   └── signup/page.tsx         # Email OTP + OAuth + verification
│   ├── (dashboard)/                # Route group: protected pages with nav bar
│   │   ├── layout.tsx, loading.tsx
│   │   ├── home/page.tsx           # Dashboard home with stats & tips
│   │   ├── practice/page.tsx       # Main exam interface (chat + voice)
│   │   │   └── components/         # SessionConfig, OnboardingWizard
│   │   ├── progress/page.tsx       # Session history + ACS coverage
│   │   │   └── components/         # AcsCoverageTreemap, WeakAreas, StudyRecommendations
│   │   └── settings/page.tsx       # Account, voice, theme, avatar
│   ├── (admin)/                    # Route group: admin-only with guard checks
│   │   ├── admin/page.tsx          # Dashboard (KPIs, cost, anomalies)
│   │   ├── admin/analytics/        # DAU/WAU/MAU, session metrics
│   │   ├── admin/config/           # Kill switches, feature flags
│   │   ├── admin/graph/            # Knowledge graph explorer (3D)
│   │   ├── admin/instructors/      # Instructor management
│   │   ├── admin/moderation/       # Content moderation queue
│   │   ├── admin/partnership/      # Referral/partner metrics
│   │   ├── admin/prompts/          # Prompt versioning & rollback
│   │   ├── admin/support/          # Support ticket queue
│   │   ├── admin/tts/              # TTS provider monitoring
│   │   ├── admin/voicelab/         # Voice testing lab
│   │   └── admin/users/            # User management + [id] detail
│   ├── api/                        # 60+ API routes
│   │   ├── exam/                   # Exam engine (start, respond, next-task)
│   │   ├── session/                # Session CRUD
│   │   ├── tts/, stt/              # Voice services (TTS + STT token/usage/test)
│   │   ├── user/                   # Tier, sessions, milestones, avatar, email-preferences
│   │   ├── user/instructor/        # Instructor connections, search, invites
│   │   ├── admin/                  # Analytics, config, graph, moderation, prompts, support, users
│   │   ├── instructor/             # Connections, invites, students, KPIs
│   │   ├── stripe/                 # Checkout, portal, status, webhook
│   │   ├── referral/, invite/      # Referral codes, invite tokens
│   │   ├── cron/                   # daily-digest, nudges (Vercel cron)
│   │   ├── email/, webhooks/       # Email preferences, Resend inbound
│   │   └── health, flags, report   # System endpoints
│   ├── pricing/, privacy/, terms/, help/  # Public pages
│   ├── try/, banned/, suspended/          # Special pages
│   ├── invite/[token]/, instructor/[slug]/, ref/[code]/  # Dynamic routes
│   ├── auth/callback/route.ts      # Email OTP code exchange
│   ├── layout.tsx                  # Root (Geist font, PostHog, GTM)
│   └── page.tsx                    # Landing page
├── components/
│   ├── CookieConsent.tsx, Footer.tsx, PostHogProvider.tsx, JsonLd.tsx
│   ├── ui/                         # ExamImages, ImageLightbox, TextAssetCard
│   ├── voice/                      # VoiceLab
│   └── graph/                      # Graph visualization components
├── hooks/
│   ├── useSentenceTTS.ts           # Sentence-level TTS streaming
│   ├── useVoiceProvider.ts         # Unified STT + TTS
│   ├── useDeepgramSTT.ts           # Deepgram WebSocket STT
│   ├── useStreamingPlayer.ts       # AudioWorklet PCM playback
│   └── useInstructorConnection.ts  # Instructor detection
├── lib/                            # 68+ modules
│   ├── exam-engine.ts              # Claude + Supabase integration (842 lines)
│   ├── exam-logic.ts               # Pure exam logic, zero deps (741 lines)
│   ├── exam-plan.ts                # Pre-exam scope planning
│   ├── exam-planner.ts             # Planner state machine
│   ├── exam-result.ts              # Result calculation & grading
│   ├── voice/                      # Provider factory, sentence boundary, tier lookup, usage
│   │   └── tts/                    # OpenAI, Deepgram, Cartesia adapters
│   ├── rag-retrieval.ts            # Hybrid vector + FTS search
│   ├── graph-retrieval.ts          # Knowledge graph traversal
│   ├── rag-filters.ts              # Metadata filter inference
│   ├── asset-selector.ts           # Semantic image/text scoring
│   ├── instructor-*.ts             # 12 instructor program modules
│   ├── email*.ts                   # Email routing, logging, preferences
│   ├── stripe.ts                   # Stripe payment integration
│   ├── system-config.ts            # Runtime config + feature flags
│   ├── rate-limit.ts               # Sliding-window rate limiter
│   ├── timing.ts                   # Latency instrumentation
│   ├── supabase/                   # client.ts, server.ts, middleware.ts
│   └── __tests__/                  # 50+ Vitest test files (743+ tests)
├── types/
│   ├── database.ts                 # 813-line type definitions (34 tables)
│   └── speech.d.ts                 # Web Speech API type declarations
├── emails/                         # React Email templates
└── middleware.ts                    # Auth + route protection

supabase/migrations/                # 62+ migration files (34 tables, RLS, RPC, triggers)
scripts/                            # 80+ scripts (pipeline, graph, eval, audit, email)
docs/                               # 50+ audit docs, design docs, implementation plans
e2e/                                # Playwright E2E tests (6 browser projects)
```

---

## Key Architecture Decisions

### Exam Engine (Two-File Split)

- **`exam-logic.ts`** — Pure functions with zero dependencies. Contains `ORAL_EXAM_AREAS`, `filterEligibleTasks()`, `selectRandomTask()`, `buildSystemPrompt()`. Fully unit-testable.
- **`exam-engine.ts`** — Integrates with Supabase (task fetching) and Anthropic API (examiner generation, answer assessment). Imports from `exam-logic.ts`.

### Two Claude Calls Per Exchange

Each student answer triggers two Claude API calls:
1. **`assessAnswer()`** — Scores the answer as satisfactory/unsatisfactory/partial, identifies misconceptions
2. **`generateExaminerTurn()`** — Generates the next examiner question/response using full conversation history

### ACS Area Filtering

Only 9 of 12 ACS areas are used for oral exam simulation. Areas IV (Takeoffs/Landings), V (Performance Maneuvers), and X (Multiengine) are excluded because they test flight skills only, not oral knowledge.

### Auth Flow

1. Signup via Email OTP or OAuth (Google, Apple, Microsoft)
2. OTP verification or OAuth callback at `/auth/callback?code=...`
3. Callback exchanges code for session, auto-creates `user_profiles` row, redirects to `/home`
4. Middleware protects `(dashboard)/*` and `(admin)/*` routes
5. Admin routes additionally guarded by `checkAdminAccess()` in layout
6. Logged-in users redirected away from `/login` and `/signup`

### Session Tracking

- Session created in Supabase when exam starts
- Exchange count updated after each Q&A pair
- Covered ACS task IDs tracked as JSONB array
- Session marked "completed" when user ends exam
- Progress page aggregates stats across all sessions

---

## Database Schema

**Supabase project ref**: `pvuiwwqsumoqjepukjhz`
**Region**: East US (North Virginia)

### Tables (34 total)

**Reference Data:**
| Table | Purpose | RLS |
|-------|---------|-----|
| `acs_tasks` | 143 ACS task definitions (PA/CA/IR) | Read: authenticated |
| `acs_elements` | Normalized K/R/S elements (~300+) | Read: authenticated |

**Knowledge Graph & RAG:**
| Table | Purpose | RLS |
|-------|---------|-----|
| `concepts` | Knowledge graph nodes (~24K, pgvector, FTS) | Read validated; Admin CRUD |
| `concept_relations` | Knowledge graph edges (6 relation types) | Read all; Admin CRUD |
| `concept_chunk_evidence` | Graph-to-RAG evidence links | Read all; Service writes |
| `source_documents` | FAA document registry (~50) | Read: authenticated |
| `source_chunks` | RAG text chunks + embeddings (~10K+) | Read: authenticated |
| `source_images` | Extracted PDF images (~500+) | Read: authenticated |
| `chunk_image_links` | Text-image relationships | Read: authenticated |

**Exam & Sessions:**
| Table | Purpose | RLS |
|-------|---------|-----|
| `exam_sessions` | User exam sessions (rating, study mode, results) | User owns own |
| `session_transcripts` | Q&A exchange records + assessments | Via session ownership |
| `element_attempts` | Per-element scoring (attempt/mention) | Via session ownership |
| `transcript_citations` | RAG chunk references per exchange | Via session ownership |
| `latency_logs` | Voice pipeline timing | Via session ownership |
| `off_graph_mentions` | Out-of-vocabulary mentions | User insert; Admin read |

**Users & Identity:**
| Table | Purpose | RLS |
|-------|---------|-----|
| `user_profiles` | Tier, subscription, preferences, auth method | User reads own |
| `usage_logs` | API usage tracking (TTS/STT/LLM) | User reads own |
| `active_sessions` | Login session tracking | User reads own |
| `email_preferences` | Email opt-in/opt-out | User owns own |

**Instructor Program:**
| Table | Purpose | RLS |
|-------|---------|-----|
| `instructor_profiles` | Verification & onboarding (CFI/CFII/MEI) | User reads/creates own |
| `instructor_invites` | Token-based invite system (link/email/QR) | Instructor reads own |
| `student_instructor_connections` | State machine (pending→approved→rejected) | Via role |
| `user_entitlement_overrides` | Courtesy access grants | Service-only |
| `student_milestones` | Milestone audit trail (4 types) | Student reads own |

**Admin & System:**
| Table | Purpose | RLS |
|-------|---------|-----|
| `admin_users` | Admin allowlist | Admin-only |
| `admin_devices` | Trusted device registry | Admin-only |
| `admin_audit_log` | Immutable audit trail | Admin read/insert |
| `admin_notes` | Internal notes on users | Admin-only |
| `system_config` | Runtime config + feature flags (~15 keys) | Admin read/update |
| `prompt_versions` | Versioned system prompts (draft/published) | Admin manage; Auth read published |
| `moderation_queue` | User reports + safety incidents | User insert; Admin manage |
| `support_tickets` | Support email tickets + replies | Admin-only |
| `ticket_replies` | Support conversation threads | Admin-only |
| `subscription_events` | Idempotent Stripe event log | Service-only |

### RPC Functions (8)

- **`is_admin()`** — Admin check helper for RLS policies
- **`hybrid_search()`** — Concept vector + FTS + exact match search (60/40 weighting)
- **`get_related_concepts()`** — Recursive CTE graph traversal (up to depth 3)
- **`get_uncovered_acs_tasks()`** — Find ACS tasks not yet satisfactorily covered in a session
- **`chunk_hybrid_search()`** — RAG chunk retrieval (vector 65% + FTS 35%, doc type/abbreviation filters)
- **`get_images_for_chunks()`** — Image retrieval linked to RAG chunks with public URLs
- **`get_element_scores()`** — User-wide element performance aggregation by rating
- **`get_session_element_scores()`** — Session-scoped element performance

### ACS Task ID Format

Task IDs follow the pattern: `{PREFIX}.{Roman numeral}.{Letter}`
- `PA` = Private Pilot Airplane (61 tasks, FAA-S-ACS-6C)
- `CA` = Commercial Pilot Airplane (60 tasks, FAA-S-ACS-7B)
- `IR` = Instrument Rating (22 tasks, FAA-S-ACS-8C)
- Roman numeral = Area of Operation (I through XII)
- Letter = Task within area (A, B, C, ...)

Element codes: `{PREFIX}.{Area}.{Task}.{K/R/S}{number}` where K=Knowledge, R=Risk Management, S=Skill

---

## Environment Variables

See `.env.example` for the full list (32 variables). Required:

| Variable | Description |
|----------|-------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anonymous key (client-safe) |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key (server-only, bypasses RLS) |
| `ANTHROPIC_API_KEY` | Anthropic API key for Claude Sonnet |
| `OPENAI_API_KEY` | OpenAI API key for embeddings + TTS fallback |
| `NEXT_PUBLIC_APP_ENV` | Environment identifier (local/staging/production) |

Optional but commonly used:

| Variable | Description |
|----------|-------------|
| `DEEPGRAM_API_KEY` | Deepgram API key for STT + TTS |
| `CARTESIA_API_KEY` | Cartesia API key for premium TTS |
| `STRIPE_SECRET_KEY` | Stripe API key (TEST or LIVE) |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Stripe public key |
| `RESEND_API_KEY` | Resend email service |
| `NEXT_PUBLIC_POSTHOG_KEY` | PostHog analytics project key |
| `POSTHOG_PERSONAL_API_KEY` | PostHog server-side (admin only) |

---

## API Routes (60+)

The API has grown to 60+ routes across 8 domains. Key routes:

### Core Exam
| Route | Methods | Purpose |
|-------|---------|---------|
| `/api/exam` | POST | Exam engine: `start`, `respond`, `next-task` |
| `/api/session` | GET, POST | Session CRUD (create, update, list) |

### Voice Services
| Route | Methods | Purpose |
|-------|---------|---------|
| `/api/tts` | POST | Multi-provider TTS (Cartesia/Deepgram/OpenAI) |
| `/api/stt/token` | GET | Deepgram ephemeral token |
| `/api/stt/usage` | GET | STT usage stats |

### User API (`/api/user/`)
- `tier`, `sessions`, `milestones`, `avatar`, `email-preferences`
- `instructor/` — connections, search, invites, student insights/milestones

### Admin API (`/api/admin/`)
- `analytics/overview`, `dashboard`, `config`
- `graph/`, `moderation/`, `instructors/`, `prompts/`, `support/`, `users/`
- `quality/*`, `partnership/*`, `user-overrides`

### Instructor API (`/api/instructor/`)
- `connections`, `invites/email`, `students/`, `kpis`

### Payments (`/api/stripe/`)
- `checkout`, `portal`, `status`, `webhook`

### Other
- `/api/referral/lookup`, `/api/referral/claim` — Referral system
- `/api/invite/[token]` — Invite acceptance
- `/api/cron/daily-digest`, `/api/cron/nudges` — Scheduled tasks
- `/api/health`, `/api/flags`, `/api/report`, `/api/csp-report` — System

---

## Testing

```bash
npm test          # Run all tests (Vitest)
npm run test:watch  # Watch mode
npm run typecheck   # TypeScript type checking
```

### Unit Tests (743+ tests across 50+ files)

| Category | Coverage |
|----------|----------|
| Core exam | exam-logic, exam-plan, exam-result, difficulty-contract, depth-profile |
| Voice stack | voice-stack-contract, voice-usage, voice-telemetry, deepgram-tts, sentence-boundary |
| RAG & retrieval | rag-filters (32+ tests), image-retrieval, asset-selector, graph-retrieval, citation-relevance |
| Instructor (15 files) | access, entitlements, verification, identity, insights, kpis, quotas, fraud, referrals, connections |
| System | timing, ttl-cache, email, analytics, browser-detect, csp-config, rate-limit, utm |
| Persona | persona-contract, examiner-profile, transition-explanation, rating-parity |

### E2E Tests (Playwright)
- 6 projects: setup, chromium, firefox, webkit, admin, no-auth
- Stored auth states for user and admin flows
- Categories: landing, SEO, consent, analytics, UTM, marketing, integration, admin

---

## Supabase Dashboard Settings

**Important**: After initial setup, configure these in the Supabase dashboard:

1. **Auth > URL Configuration > Site URL**: `https://aviation-oral-exam-companion.vercel.app`
2. **Auth > URL Configuration > Redirect URLs**:
   - `https://aviation-oral-exam-companion.vercel.app/auth/callback`
   - `http://localhost:3000/auth/callback`

---

## Known Limitations / Future Work

- **Knowledge graph behind feature flag** — ~24K concepts + edges populated. Enhanced retrieval behind `graph.enhanced_retrieval` flag; shadow mode available for testing.
- **Transcript persistence active** — `session_transcripts` + `element_attempts` tables populated via exam engine.
- **Latency logging active** — `latency_logs` populated with per-exchange timing spans via `src/lib/timing.ts`.
- **STT Chrome-primary** — Deepgram Nova-3 WebSocket STT works cross-browser. Legacy Web Speech API was Chrome-only.
- **Admin interface complete** — 13 admin pages: dashboard, analytics, config, graph explorer, instructors, moderation, prompts, support, TTS monitoring, voicelab, user management.
- **Three ratings supported** — Private Pilot (61 tasks), Commercial Pilot (60 tasks), and Instrument Rating (22 tasks) fully seeded. ATP schemaed but not populated.
- **No CI/CD pipeline** — No `.github` directory; relies on Vercel auto-deploy and preview deployments.
- **Load testing deferred** — Launched with "LAUNCH WITH CAUTION" (Phase 18); no formal load testing performed.
- **PostHog events partially active** — 3 MVP events active; 11 additional events deferred post-launch.
- **Instructor program launched** — Full lifecycle: application, verification, invites, connections, KPIs, milestones, referrals.

---

## Obsidian Knowledge Base — Mandatory Sync Protocol

**THIS IS A CRITICAL PROCESS FOR MAINTAINING HUMAN-AI COLLABORATION.**

The project owner maintains a knowledge base in Obsidian at:
```
~/Library/Mobile Documents/iCloud~md~obsidian/Documents/Piotr's Second Brain/
  Imagine Flying/NextGen CFI/Products/HeyDPE/
```

### When to Write an Obsidian Update

You MUST write an Obsidian status note in **any** of these situations:

1. **Before context compression** — If the conversation is approaching context limits and compression is imminent, write the current state first.
2. **Before ending a session** — When the user says goodbye, ends the conversation, or work is wrapping up.
3. **Before any deployment** — Before pushing to `main` or triggering a Vercel deploy.
4. **When the user requests it** — If the user asks for an "Obsidian note", this is a **user note** (see format below).
5. **After completing a significant feature or fix** — Any change that alters project behavior or architecture.

### Obsidian Note Format & Best Practices

Follow Obsidian conventions:
- Use **wikilinks** (`[[Note Name]]`) for internal references
- Use **YAML frontmatter** with `date`, `type`, `tags`, and `status` fields
- Use **headings** (H2/H3) for structure, not bold text as section headers
- Keep notes **atomic** — one concept or update per note when possible
- Place notes in the appropriate subfolder (e.g., `HeyDPE - Build Report/`)

### Note Types

**Session Log** (automatic, written by AI):
```markdown
---
date: YYYY-MM-DD
type: session-log
tags: [aviation-oral-exam, dev-session]
status: completed
---

# Session Log — YYYY-MM-DD

## Changes Made
- [Bullet list of what was implemented, fixed, or modified]

## Files Changed
- [List of key files touched with brief description]

## Current State
- [What works now that didn't before]
- [Any new issues discovered]

## Next Steps
- [What should be picked up next session]

## Decisions Made
- [Any architectural or design decisions and their rationale]
```

**User Note** (requested by user — MUST include this marker):
```markdown
---
date: YYYY-MM-DD
type: user-note
tags: [aviation-oral-exam]
author: user-requested
---

> [!important] User-Requested Note
> This note was explicitly requested by the project owner and reflects their intent, priorities, or decisions. Treat its contents as authoritative project direction.

# [Title]

[Content as requested]
```

### Why This Matters

The Obsidian vault is the **single source of truth** for project continuity across sessions. AI context is ephemeral — it gets compressed and eventually lost. The human owner's knowledge base persists. Writing to Obsidian before any context loss ensures:

- No work is forgotten or duplicated across sessions
- Architectural decisions are preserved with rationale
- The next session (human or AI) can pick up exactly where this one left off
- The human owner always has a complete, browsable history of the project

**Never skip this step. If in doubt, write the note.**

---

*Last updated: March 26, 2026*
