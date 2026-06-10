# HeyDPE — Comprehensive Project Status Inventory

> **Date**: 2026-03-26
> **Purpose**: Full system audit and inventory of the HeyDPE codebase, database, infrastructure, and documentation.

---

## 1. Executive Summary

HeyDPE is a **voice-first AI aviation oral exam simulator** built on Next.js 16.1.6, Supabase (PostgreSQL + pgvector), Claude Sonnet, and a multi-provider TTS/STT voice stack. The project has grown significantly beyond the initial CLAUDE.md description:

| Metric | CLAUDE.md States | Actual |
|--------|-----------------|--------|
| Database tables | 8 | **34** |
| API routes | 5 | **60+** |
| Route groups | 2 (auth, dashboard) | **3 (auth, dashboard, admin)** |
| Lib modules | ~10 referenced | **68+ main modules** |
| Test files | 12 referenced | **50+ unit test files** |
| Unit tests | 235+ | **743+** |
| npm scripts | ~4 | **80+** |
| Migrations | 2 | **62+** |
| Pages | ~8 | **28** |

---

## 2. Tech Stack (Current)

| Layer | Technology | Version/Notes |
|-------|-----------|---------------|
| Framework | Next.js | 16.1.6 (App Router, Turbopack) |
| Language | TypeScript | ^5, strict mode |
| Styling | Tailwind CSS | v4 (PostCSS plugin) |
| Database | Supabase (PostgreSQL) | pgvector, pg_trgm, RLS, RPC |
| Auth | Supabase Auth | Email OTP, Google, Apple, Microsoft OAuth |
| AI Examiner | Claude Sonnet | `claude-sonnet-4-6` via Anthropic SDK ^0.74.0 |
| TTS | Multi-provider | Cartesia Sonic-3, Deepgram Aura-2, OpenAI TTS-1 |
| STT | Deepgram Nova-3 | WebSocket, MediaRecorder (Opus/WebM) |
| Payments | Stripe | ^20.3.1 + Svix webhooks |
| Email | Resend | ^6.9.2 + React Email |
| Analytics | PostHog | Client (^1.351.1) + Server (^5.26.2) |
| Charts | Nivo | Treemap (^0.99.0) |
| Graph Viz | react-force-graph | 2D + 3D rendering |
| PDF Parse | pdf-parse | ^1.1.1 |
| QR Codes | qrcode | ^1.5.4 |
| Testing | Vitest + Playwright | ^4.0.18 / ^1.58.2 |
| Deployment | Vercel | Auto-deploy from main |

---

## 3. Project Structure

```
src/
├── app/
│   ├── (auth)/                     # Login, signup (no nav)
│   │   ├── login/page.tsx
│   │   └── signup/page.tsx
│   ├── (dashboard)/                # Protected pages with nav bar
│   │   ├── layout.tsx, loading.tsx
│   │   ├── home/page.tsx           # Dashboard home + stats
│   │   ├── practice/page.tsx       # Main exam interface
│   │   │   └── components/         # SessionConfig, OnboardingWizard
│   │   ├── progress/page.tsx       # Session history + ACS coverage
│   │   │   └── components/         # AcsCoverageTreemap, WeakAreas, StudyRecommendations
│   │   └── settings/page.tsx       # Account, voice, theme, avatar
│   ├── (admin)/                    # Admin-only with guard checks
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
│   ├── api/                        # 60+ API routes (see Section 5)
│   ├── auth/callback/route.ts      # Email confirmation code exchange
│   ├── pricing/page.tsx            # Pricing plans + FAQs
│   ├── privacy/page.tsx            # Privacy policy
│   ├── terms/page.tsx              # Terms of service
│   ├── help/page.tsx               # Help & FAQ
│   ├── try/page.tsx                # Demo page
│   ├── banned/page.tsx             # Banned user notice
│   ├── suspended/page.tsx          # Suspended user notice
│   ├── invite/[token]/page.tsx     # Instructor invite handler
│   ├── instructor/[slug]/page.tsx  # Public instructor profile
│   ├── ref/[code]/page.tsx         # Referral redirect
│   ├── email/preferences/page.tsx  # Email unsubscribe
│   ├── layout.tsx                  # Root (Geist font, PostHog, GTM)
│   ├── page.tsx                    # Landing page
│   ├── error.tsx, not-found.tsx    # Error boundaries
│   ├── robots.ts, sitemap.ts       # SEO
│   ├── apple-icon.tsx              # Apple touch icon
│   └── opengraph-image.tsx         # OG image generation
├── components/
│   ├── CookieConsent.tsx           # GTM consent mode
│   ├── Footer.tsx                  # Shared footer
│   ├── PostHogProvider.tsx         # Analytics provider
│   ├── JsonLd.tsx                  # Structured data
│   ├── UTMCapture.tsx              # Referral tracking
│   ├── ui/                         # ExamImages, ImageLightbox, TextAssetCard, ReferralWelcomeBanner
│   ├── voice/                      # VoiceLab
│   ├── graph/                      # Graph visualization components
│   └── session/                    # Session UI components
├── hooks/
│   ├── useSentenceTTS.ts           # Sentence-level TTS streaming
│   ├── useVoiceProvider.ts         # Unified STT + TTS
│   ├── useDeepgramSTT.ts           # Deepgram WebSocket STT
│   ├── useStreamingPlayer.ts       # AudioWorklet PCM playback
│   └── useInstructorConnection.ts  # Instructor detection
├── lib/                            # 68+ modules (see Section 6)
│   ├── exam-engine.ts              # Claude + Supabase integration
│   ├── exam-logic.ts               # Pure exam logic (no deps)
│   ├── exam-plan.ts                # Pre-exam scope planning
│   ├── exam-planner.ts             # Planner state machine
│   ├── exam-result.ts              # Result calculation
│   ├── voice/                      # Provider factory, sentence boundary, tier lookup, usage
│   │   └── tts/                    # OpenAI, Deepgram, Cartesia adapters
│   ├── supabase/                   # client.ts, server.ts, middleware.ts
│   ├── rag-retrieval.ts            # Vector + FTS hybrid search
│   ├── graph-retrieval.ts          # Knowledge graph traversal
│   ├── rag-filters.ts              # Metadata filter inference
│   ├── asset-selector.ts           # Semantic image/text scoring
│   ├── instructor-*.ts             # 12 instructor modules
│   ├── email*.ts                   # 4 email modules
│   ├── stripe.ts                   # Stripe integration
│   ├── system-config.ts            # Runtime config + feature flags
│   ├── rate-limit.ts               # Sliding-window rate limiter
│   ├── timing.ts                   # Latency instrumentation
│   ├── ttl-cache.ts                # In-memory TTL cache
│   └── __tests__/                  # 50+ Vitest test files
├── types/
│   ├── database.ts                 # 813-line type definitions (all tables)
│   └── speech.d.ts                 # Web Speech API types
├── emails/                         # React Email templates
└── middleware.ts                    # Auth + route protection

supabase/migrations/                # 62+ migration files
scripts/                            # 80+ scripts (pipeline, graph, eval, audit, email, etc.)
docs/                               # 50+ audit docs, design docs, implementation plans
e2e/                                # Playwright E2E tests (6 projects)
mockups/                            # 7 HTML theme prototypes
```

---

## 4. Database Schema (34 Tables)

### Supabase Project
- **Ref**: `pvuiwwqsumoqjepukjhz`
- **Region**: East US (North Virginia)
- **Extensions**: pgvector, pg_trgm

### Table Inventory

| # | Table | Purpose | Rows (approx) | RLS |
|---|-------|---------|---------------|-----|
| 1 | `acs_tasks` | ACS task definitions (PA/CA/IR) | 143 | Read: authenticated |
| 2 | `acs_elements` | Normalized K/R/S elements | ~300+ | Read: authenticated |
| 3 | `concepts` | Knowledge graph nodes + embeddings | ~24,000 | Read: validated; Admin CRUD |
| 4 | `concept_relations` | Knowledge graph edges (6 types) | ~50,000+ | Read: all; Admin CRUD |
| 5 | `concept_chunk_evidence` | Graph-to-RAG evidence links | varies | Read: all; Service writes |
| 6 | `source_documents` | FAA document registry | ~50 | Read: authenticated |
| 7 | `source_chunks` | RAG text chunks + embeddings | ~10,000+ | Read: authenticated |
| 8 | `source_images` | Extracted PDF images | ~500+ | Read: authenticated |
| 9 | `chunk_image_links` | Text-image relationships | ~1,000+ | Read: authenticated |
| 10 | `transcript_citations` | Chunk refs per exchange | varies | Via session ownership |
| 11 | `exam_sessions` | User exam sessions | growing | User owns own |
| 12 | `session_transcripts` | Q&A exchange records | growing | Via session ownership |
| 13 | `element_attempts` | Per-element scoring | growing | Via session ownership |
| 14 | `latency_logs` | Voice pipeline timing | growing | Via session ownership |
| 15 | `off_graph_mentions` | Out-of-vocabulary mentions | growing | User insert; Admin read |
| 16 | `user_profiles` | Subscription, preferences, tier | growing | User reads own |
| 17 | `usage_logs` | API usage tracking | growing | User reads own |
| 18 | `active_sessions` | Login session tracking | growing | User reads own |
| 19 | `admin_users` | Admin allowlist | small | Admin-only |
| 20 | `admin_devices` | Trusted device registry | small | Admin-only |
| 21 | `admin_audit_log` | Immutable audit trail | growing | Admin read/insert |
| 22 | `admin_notes` | Internal notes on users | small | Admin-only |
| 23 | `system_config` | Runtime config + feature flags | ~15 keys | Admin read/update |
| 24 | `prompt_versions` | Versioned system prompts | ~20 | Admin manage; Auth read published |
| 25 | `moderation_queue` | User reports + safety incidents | growing | User insert own; Admin manage |
| 26 | `support_tickets` | Support email tickets | growing | Admin-only |
| 27 | `ticket_replies` | Support conversation threads | growing | Admin-only |
| 28 | `subscription_events` | Idempotent Stripe event log | growing | Service-only |
| 29 | `instructor_profiles` | Instructor verification | growing | User reads/creates own |
| 30 | `instructor_invites` | Invite tokens | growing | Instructor reads own |
| 31 | `student_instructor_connections` | Connection state machine | growing | Via role |
| 32 | `user_entitlement_overrides` | Entitlement grants | small | Service-only |
| 33 | `student_milestones` | Milestone audit trail | growing | Student reads own |
| 34 | `email_preferences` | Email opt-in/opt-out | growing | User owns own |

### RPC Functions (8)

| Function | Purpose |
|----------|---------|
| `is_admin()` | Admin check helper for RLS policies |
| `hybrid_search()` | Concept vector + FTS + exact match search |
| `get_related_concepts()` | Recursive graph traversal (depth 3) |
| `get_uncovered_acs_tasks()` | Find uncovered tasks in a session |
| `chunk_hybrid_search()` | RAG chunk retrieval (vector 65% + FTS 35%) |
| `get_images_for_chunks()` | Image retrieval linked to RAG chunks |
| `get_element_scores()` | User-wide element performance aggregation |
| `get_session_element_scores()` | Session-scoped element performance |

### Key Triggers

| Trigger | Table | Purpose |
|---------|-------|---------|
| `concepts_updated_at` | concepts | Auto-update timestamp |
| `concepts_embedding_stale` | concepts | Mark embedding stale on content change |
| `element_attempts_enforce_session` | element_attempts | Auto-set session_id from transcript |
| `on_auth_user_created` | auth.users | Auto-create user_profiles row |
| Various `*_updated_at` | multiple | Auto-timestamp updates |

---

## 5. API Routes (60+)

### Core Exam
| Route | Methods | Purpose |
|-------|---------|---------|
| `/api/exam` | POST | Exam engine (start, respond, next-task) |
| `/api/session` | GET, POST | Session CRUD (create, update, list) |
| `/api/bench` | GET, POST | Performance benchmarking |

### Voice Services
| Route | Methods | Purpose |
|-------|---------|---------|
| `/api/tts` | POST | Text-to-speech (Cartesia/Deepgram/OpenAI) |
| `/api/stt/token` | GET | Deepgram ephemeral token |
| `/api/stt/usage` | GET | STT usage stats |
| `/api/stt/test` | GET | STT health check |

### User API (`/api/user/`)
| Route | Purpose |
|-------|---------|
| `tier` | User tier & feature access |
| `sessions` | Session history |
| `milestones` | Achievements |
| `avatar` | Avatar upload |
| `email-preferences` | Email opt-in/out |
| `instructor/` | Get/set instructor connection |
| `instructor/search` | Search instructors |
| `instructor/invites` | Get invitations |
| `instructor/connections` | Get connections |
| `instructor/students/insights` | Student analytics |
| `instructor/students/milestones` | Student milestones |

### Admin API (`/api/admin/`)
| Route | Purpose |
|-------|---------|
| `analytics/overview` | Analytics dashboard |
| `dashboard` | Admin dashboard stats |
| `config` | System config CRUD |
| `graph`, `graph/health`, `graph/coverage` | Knowledge graph |
| `moderation`, `moderation/[id]` | Moderation queue |
| `instructors`, `instructors/[id]` | Instructor admin |
| `instructor-entitlements` | Entitlement config |
| `prompts`, `prompts/[id]/publish`, `prompts/[id]/rollback` | Prompt versioning |
| `support` | Support tickets |
| `users`, `users/[id]`, `users/[id]/actions` | User management |
| `user-overrides` | Tier overrides |
| `sessions/[id]/transcript` | Transcript viewer |
| `quality/*` | Quality metrics |
| `partnership/*` | Partnership analytics |

### Instructor API (`/api/instructor/`)
| Route | Purpose |
|-------|---------|
| `connections` | Student connections |
| `invites/email` | Send invite |
| `students`, `students/[id]` | Student list & detail |
| `kpis` | Instructor KPIs |

### Payments (`/api/stripe/`)
| Route | Purpose |
|-------|---------|
| `checkout` | Create checkout session |
| `portal` | Billing portal redirect |
| `status` | Subscription status |
| `webhook` | Stripe event handler |

### Referral & Invite
| Route | Purpose |
|-------|---------|
| `/api/referral/lookup`, `/api/referral/claim` | Referral system |
| `/api/invite/[token]` | Accept invitation |
| `/api/public/qr/referral/[code]` | QR code generation |

### Email & Notifications
| Route | Purpose |
|-------|---------|
| `/api/email/preferences` | Email preferences |
| `/api/webhooks/resend-inbound` | Inbound email webhook |
| `/api/cron/daily-digest` | Daily email digest (13:00 UTC) |
| `/api/cron/nudges` | Nudge emails (15:00 UTC) |

### System
| Route | Purpose |
|-------|---------|
| `/api/health` | Health check |
| `/api/flags` | Client feature flags |
| `/api/report` | Bug/feedback reports |
| `/api/csp-report` | CSP violation reports |

---

## 6. Library Modules (src/lib/) — 68+ Files

### Core Exam Engine
- `exam-engine.ts` — Claude + Supabase integration (842 lines)
- `exam-logic.ts` — Pure functions, zero deps (741 lines)
- `exam-plan.ts` — Pre-exam scope planning
- `exam-planner.ts` — Planner state machine
- `exam-result.ts` — Result calculation & grading

### Voice Stack (8 files in `voice/`)
- `types.ts` — Tier definitions (ground_school / checkride_prep / dpe_live)
- `provider-factory.ts` — Factory pattern with fallback chain
- `tts/openai-tts.ts`, `tts/deepgram-tts.ts`, `tts/cartesia-tts.ts` — Provider adapters
- `sentence-boundary.ts` — Aviation-aware boundary detection
- `tier-lookup.ts` — User tier mapping
- `usage.ts` — Quota enforcement

### RAG & Knowledge Retrieval
- `rag-retrieval.ts` — Hybrid vector + FTS search
- `graph-retrieval.ts` — Concept graph traversal
- `rag-filters.ts` — Metadata filter inference
- `rag-search-with-fallback.ts` — Fallback chain
- `citation-relevance.ts` — Citation scoring
- `asset-selector.ts` — Semantic image/text selection (4-signal scoring)
- `image-retrieval.ts` — Image-specific retrieval

### Instructor Program (12 modules)
- `instructor-identity.ts`, `instructor-access.ts`, `instructor-connections.ts`
- `instructor-entitlements.ts`, `instructor-fraud-signals.ts`, `instructor-insights.ts`
- `instructor-invites.ts`, `instructor-kpis.ts`, `instructor-quotas.ts`
- `instructor-verification.ts`, `instructor-student-summary.ts`, `instructor-summary-builder.ts`

### Email & Notifications
- `email.ts`, `email-routing.ts`, `email-logging.ts`, `email-preferences.ts`
- `nudge-engine.ts`, `digest-builder.ts`, `unsubscribe-token.ts`

### DPE Persona & Difficulty
- `examiner-profile.ts` — DPE personality profiles
- `persona-contract.ts` — Personality injection
- `depth-profile.ts` — Question depth calibration
- `difficulty-contract.ts` — Difficulty level contracts
- `transition-explanation.ts` — Natural ACS area transitions

### System Infrastructure
- `system-config.ts` — Runtime config (TTL-cached 60s)
- `kill-switch.ts` — Feature flags
- `rate-limit.ts` — Sliding-window rate limiter
- `session-enforcement.ts` — One active exam per user
- `session-policy.ts` — Session lifecycle
- `admin-guard.ts`, `admin-audit.ts` — Admin authorization + audit
- `app-env.ts` — Environment detection
- `browser-detect.ts` — Browser capability detection

### Observability & Analytics
- `timing.ts` — Request latency instrumentation
- `posthog-server.ts` — Server-side PostHog
- `analytics.ts`, `analytics-utils.ts` — Client analytics
- `voice-telemetry.ts` — Voice pipeline monitoring

### Other Utilities
- `ttl-cache.ts` — Generic TTL cache
- `prompts.ts` — Safety prefix + fallback prompts
- `stripe.ts` — Stripe API integration
- `theme.ts`, `avatar-options.ts` — UI customization
- `structural-fingerprints.ts` — Taxonomy fingerprinting
- `utm.ts` — UTM parameter parsing

---

## 7. Testing

### Unit Tests (50+ files, 743+ tests)
All in `src/lib/__tests__/` using Vitest:

**Core Logic**: exam-logic, exam-plan, exam-result, difficulty-contract, depth-profile
**Voice**: voice-stack-contract, voice-usage, voice-telemetry, deepgram-tts-contract, sentence-boundary
**RAG**: rag-filters (32+ tests), image-retrieval, asset-selector, graph-retrieval, citation-relevance
**Instructor** (15 files): access, entitlements, verification, identity, insights, kpis, quotas, fraud-signals, referrals, connections, student-summary, invites, summary-builder, rate-limiter
**System**: timing, ttl-cache, email, email-routing, analytics, browser-detect, app-env, csp-config, audio-unlock, provider-factory, utm, unsubscribe-token
**Persona**: persona-contract, examiner-profile, transition-explanation, structural-fingerprints, rating-parity

### E2E Tests (Playwright)
- 6 projects: setup, chromium, firefox, webkit, admin, no-auth
- Stored auth states for user and admin flows
- Test categories: landing, SEO, consent, analytics, UTM, marketing, integration, assets, admin

### Script Tests
- `scripts/__tests__/`: embed-concepts, infer-edges, extract-regulatory-claims, chunk-utils, extract-topics

---

## 8. Voice System Architecture

### Three Tiers
| Tier | STT | TTS | Sessions/mo | Exchanges/session | TTS chars/mo |
|------|-----|-----|-------------|-------------------|--------------|
| ground_school | Deepgram Nova-3 | Deepgram Aura-2 | 60 | 30 | 500K |
| checkride_prep | Deepgram Nova-3 | Deepgram Aura-2 | 60 | 30 | 500K |
| dpe_live | Deepgram Nova-3 | Cartesia Sonic-3 | unlimited | 50 | 1M |

### TTS Provider Chain
1. **Cartesia** (Sonic-3/Sonic-Turbo) — Premium tier, emotion control
2. **Deepgram** (Aura-2) — Mid/free tier, reliable
3. **OpenAI** (TTS-1/TTS-1-HD) — Fallback

### STT
- Deepgram Nova-3 via WebSocket (all tiers)
- MediaRecorder with Opus/WebM encoding
- Auto-retry (2 attempts, 2s delay)
- Deduplication of is_final results

### Audio Pipeline
- Sentence boundary detection (aviation-aware abbreviations)
- Structured 3-chunk response delivery (paragraph-based)
- TTS prefetch caching for zero-gap inter-chunk playback
- iOS audio unlock workaround

---

## 9. ACS Task Coverage

| Rating | Prefix | Tasks | Standard |
|--------|--------|-------|----------|
| Private Pilot | PA | 61 | FAA-S-ACS-6C |
| Commercial Pilot | CA | 60 | FAA-S-ACS-7B |
| Instrument Rating | IR | 22 | FAA-S-ACS-8C |
| **Total** | | **143** | |

### Study Modes
- `linear` — Sequential ACS area progression
- `cross_acs` — Taxonomy-aware connected walk (Jaccard similarity)
- `weak_areas` — Weighted shuffle targeting weak elements
- `quick_drill` — Rapid-fire short sessions

### Difficulty Levels
- `easy`, `medium`, `hard`, `mixed`
- Per-element default difficulty stored in acs_elements

---

## 10. Feature Flags (system_config)

| Key | Purpose |
|-----|---------|
| `kill_switch.anthropic` | Disable Claude API |
| `kill_switch.openai` | Disable OpenAI API |
| `kill_switch.deepgram` | Disable Deepgram API |
| `kill_switch.cartesia` | Disable Cartesia API |
| `kill_switch.tier.*` | Disable specific tiers |
| `maintenance_mode` | Global maintenance |
| `user_hard_caps` | Daily usage limits |
| `graph.enhanced_retrieval` | Merge graph into RAG context |
| `graph.shadow_mode` | Log graph retrieval in parallel |
| `tts_sentence_stream` | Structured 3-chunk delivery |
| `voice.user_options` | DPE persona list |

---

## 11. Instructor Partnership Program

### Tables
- `instructor_profiles` — Verification & onboarding (CFI/CFII/MEI/AGI/IGI)
- `instructor_invites` — Token-based invite system (link/email/QR)
- `student_instructor_connections` — State machine (pending → approved → rejected)
- `user_entitlement_overrides` — Courtesy paid_equivalent access
- `student_milestones` — Milestone tracking (4 types)

### Features
- Instructor application & admin approval workflow
- Student invite via link, email, or QR code
- Student insights & KPI dashboards
- Weekly summary emails
- Quota enforcement (students per instructor)
- Fraud signal detection
- Referral tracking & attribution

---

## 12. Payments (Stripe Integration)

- Checkout session creation
- Billing portal management
- Subscription lifecycle (active, past_due, canceled, trialing, incomplete)
- Idempotent webhook processing via `subscription_events` table
- Tier mapping: Stripe product → voice tier

---

## 13. Observability & Analytics

### PostHog Events (3 MVP + 11 deferred)
- `exam_session_started`, `exam_session_completed`, `checkout_completed` (active)
- 11 additional events deferred post-launch

### Latency Instrumentation
- Per-exchange timing spans in `latency_logs`
- Voice pipeline metrics (VAD → STT → LLM → TTS segments)

### Admin Dashboard
- Real-time KPIs, cost breakdown, anomaly detection
- User DAU/WAU/MAU
- Session metrics, quality audits

---

## 14. Documentation Inventory

### System Audit (20 docs)
- 01–20: Tech stack, architecture, KG, exam flow, latency, GraphRAG, optimization, staging, production audit, taxonomy, multi-hub KG, exam planning

### Production Audit (13 docs)
- 00–12: Requirements, deployed reality, DB snapshot, RAG grounding, exam flow, grading, prompting, graph opportunities, risks, drift, recommendations, FAA gaps

### Implementation Plans (7+)
- Voice tiers, image augmentation, multi-rating onboarding, pre-commercialization, knowledge graph visualization

### Design Documents (8+)
- Email auth, marketing strategy, multi-exam resume, session policy, graph visualization, cockpit design system

---

## 15. Scripts Infrastructure (80+ npm scripts)

### Categories
- **Ingestion Pipeline**: ingest sources, embed concepts, link ACS, extract claims/topics
- **Graph Operations**: build backbone, attach hubs, infer edges, validate, metrics
- **Taxonomy**: build, classify chunks, assign hubs, expand regulations
- **Evaluation** (23 scripts): difficulty, depth, examiner identity, flow, grounding, multimodal, persona, prompt, rating parity
- **Instructor** (8 scripts): abuse, entitlement, fraud, freshness, insights, launch gate, quota, referral
- **Smoke Tests**: phase 6/7/21 validation
- **Staging & Verification**: env-doctor, latency benchmark, phase verification
- **Audit**: DB snapshot, launch readiness, production verification, funnel audit
- **Email Campaigns**: trial reminders, daily digest, nudges, instructor weekly

---

## 16. Deployment & Infrastructure

### Vercel
- Auto-deploy from `main` branch
- Cron jobs: daily-digest (13:00 UTC), nudges (15:00 UTC)
- CSP headers hardened with dynamic Supabase origin

### Supabase
- PostgreSQL with pgvector + pg_trgm
- RLS on all tables
- Storage bucket: `source-images`
- Custom domain: `auth.heydpe.com`

### Security
- CSP: Strict with specific API origins
- Rate limiting: Per-route sliding window
- Session enforcement: One active exam per user
- Admin: Device trust + audit log

---

## 17. Known Issues & Gaps

1. **CLAUDE.md is severely outdated** — States 8 tables, 5 API routes, 2 route groups; reality is 34/60+/3
2. **Knowledge graph populated but partially utilized** — Enhanced retrieval behind feature flag
3. **No CI/CD pipeline** — No `.github` directory; relies on Vercel auto-deploy
4. **Load testing deferred** — Phase 18 launched with "LAUNCH WITH CAUTION" verdict
5. **11 PostHog events deferred** — Only 3 MVP events active
6. **Obsidian vault 9 days stale** — Last session log: March 17, 2026
7. **ATP rating schemaed but not populated** — Only Private, Commercial, Instrument seeded
8. **Voice mode Chrome-only** — Web Speech API limitation (STT; TTS works cross-browser)

---

## 18. Obsidian Vault Status

- **Location**: `~/Library/Mobile Documents/iCloud~md~obsidian/Documents/Piotr's Second Brain/Imagine Flying/NextGen CFI/Products/HeyDPE/HeyDPE - Build Report/`
- **Total notes**: 44 session-logs
- **Date range**: Feb 25 – Mar 17, 2026
- **Last update**: March 17 (Admin Nav Regression Fix)
- **Gap**: 9 days since last note (today is March 26)

---

*Generated 2026-03-26 via comprehensive codebase + database audit*
