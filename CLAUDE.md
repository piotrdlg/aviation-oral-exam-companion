# Claude Context File — Aviation Oral Exam Companion

> Read this file first when working on any task in this repository.

---

## Overview

**Aviation Oral Exam Companion** is a voice-first AI web application that simulates FAA Designated Pilot Examiner (DPE) oral examinations for Private Pilot checkride preparation. The AI examiner follows the FAA Airman Certification Standards (ACS) document FAA-S-ACS-6C (November 2023) to ask questions, assess answers, and naturally transition between topics.

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
| Auth | Supabase Auth | Email/password, email confirmation |
| AI Examiner | Claude Sonnet (`claude-sonnet-4-5-20250929`) | DPE persona + answer assessment |
| TTS | OpenAI TTS (`tts-1`, voice: `onyx`) | Deep, authoritative DPE voice |
| STT | Web Speech API (browser-native) | Chrome only, interim results |
| Testing | Vitest | Unit tests for pure logic |
| Deployment | Vercel | Auto-deploy from `main` branch |

---

## Project Structure

```
src/
├── app/
│   ├── (auth)/                 # Route group: login, signup (no dashboard nav)
│   │   ├── login/page.tsx
│   │   └── signup/page.tsx
│   ├── (dashboard)/            # Route group: protected pages with nav bar
│   │   ├── layout.tsx          # Nav bar + sign out button
│   │   ├── loading.tsx         # Skeleton loading state
│   │   ├── practice/page.tsx   # Main exam interface (chat + voice)
│   │   ├── progress/page.tsx   # Session history + stats dashboard
│   │   └── settings/page.tsx   # Account info
│   ├── api/
│   │   ├── exam/route.ts       # Exam engine API (start, respond, next-task)
│   │   ├── session/route.ts    # Session CRUD (create, update, list)
│   │   └── tts/route.ts        # OpenAI TTS proxy
│   ├── auth/
│   │   └── callback/route.ts   # Email confirmation code exchange
│   ├── error.tsx               # Global error boundary
│   ├── not-found.tsx           # 404 page
│   ├── layout.tsx              # Root layout (Geist font, dark bg)
│   └── page.tsx                # Landing page (unauthenticated)
├── lib/
│   ├── exam-engine.ts          # Supabase + Anthropic API integration
│   ├── exam-logic.ts           # Pure logic (no external deps, fully testable)
│   ├── __tests__/
│   │   └── exam-logic.test.ts  # 17 unit tests
│   └── supabase/
│       ├── client.ts           # Browser Supabase client
│       ├── middleware.ts        # Auth session refresh + route protection
│       └── server.ts           # Server-side Supabase client (cookies)
├── types/
│   ├── database.ts             # TypeScript interfaces for all DB tables
│   └── speech.d.ts             # Web Speech API type declarations
└── middleware.ts                # Next.js middleware entry point

supabase/migrations/
├── 20260214000001_initial_schema.sql   # Full schema (8 tables, RLS, RPC)
└── 20260214000002_seed_acs_tasks.sql   # 61 ACS tasks from FAA-S-ACS-6C
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

1. Signup creates account via Supabase Auth
2. Confirmation email links to `/auth/callback?code=...`
3. Callback route exchanges code for session, redirects to `/practice`
4. Middleware protects `/practice`, `/progress`, `/settings` routes
5. Logged-in users are redirected away from `/login` and `/signup`

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

### Tables

| Table | Purpose | RLS |
|-------|---------|-----|
| `acs_tasks` | 61 ACS task definitions (immutable reference data) | Read-only for authenticated |
| `concepts` | Knowledge graph nodes (pgvector embeddings, FTS) | Read validated; admin CRUD |
| `concept_relations` | Knowledge graph edges (6 relation types) | Read all; admin CRUD |
| `admin_users` | Admin allowlist | Admin-only read |
| `exam_sessions` | User exam sessions with coverage tracking | User owns their own |
| `session_transcripts` | Full Q&A transcripts per session | Via session ownership |
| `latency_logs` | Voice pipeline performance metrics | Via session ownership |
| `off_graph_mentions` | Student mentions not in knowledge graph | User insert; admin read |

### RPC Functions

- **`hybrid_search()`** — Combined vector + full-text + exact match search on concepts
- **`get_related_concepts()`** — Recursive CTE graph traversal (up to depth 3)
- **`get_uncovered_acs_tasks()`** — Find ACS tasks not yet satisfactorily covered in a session

### ACS Task ID Format

Task IDs follow the pattern: `PA.{Roman numeral}.{Letter}`
- `PA` = Private Pilot Airplane
- Roman numeral = Area of Operation (I through XII)
- Letter = Task within area (A, B, C, ...)

Element codes: `PA.{Area}.{Task}.{K/R/S}{number}` where K=Knowledge, R=Risk Management, S=Skill

---

## Environment Variables

See `.env.example` for the full list. Required:

| Variable | Description |
|----------|-------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anonymous key (client-safe) |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key (server-only, bypasses RLS) |
| `ANTHROPIC_API_KEY` | Anthropic API key for Claude Sonnet |
| `OPENAI_API_KEY` | OpenAI API key for TTS |

---

## API Routes

### `POST /api/exam`

Requires auth. Actions:

| Action | Payload | Returns |
|--------|---------|---------|
| `start` | `{}` | `{ taskId, taskData, examinerMessage }` |
| `respond` | `{ taskData, history, studentAnswer }` | `{ taskId, taskData, examinerMessage, assessment }` |
| `next-task` | `{ taskData, coveredTaskIds }` | `{ taskId, taskData, examinerMessage }` or `{ sessionComplete }` |

### `POST /api/session`

Requires auth. Actions:

| Action | Payload | Returns |
|--------|---------|---------|
| `create` | `{}` | `{ session }` |
| `update` | `{ sessionId, status?, exchange_count?, acs_tasks_covered? }` | `{ ok: true }` |

### `GET /api/session`

Requires auth. Returns user's last 20 sessions: `{ sessions: [...] }`

### `POST /api/tts`

Requires auth. Input: `{ text }` (max 2000 chars). Returns: MP3 audio stream.

---

## Testing

```bash
npm test          # Run all tests (Vitest)
npm run test:watch  # Watch mode
```

17 unit tests cover:
- `ORAL_EXAM_AREAS` — correct inclusion/exclusion of areas
- `filterEligibleTasks()` — filtering, exclusion, edge cases
- `selectRandomTask()` — selection with fallback logic
- `buildSystemPrompt()` — prompt construction with task data

---

## Supabase Dashboard Settings

**Important**: After initial setup, configure these in the Supabase dashboard:

1. **Auth > URL Configuration > Site URL**: `https://aviation-oral-exam-companion.vercel.app`
2. **Auth > URL Configuration > Redirect URLs**:
   - `https://aviation-oral-exam-companion.vercel.app/auth/callback`
   - `http://localhost:3000/auth/callback`

---

## Known Limitations / Future Work

- **Knowledge graph is empty** — `concepts` and `concept_relations` tables are schemaed but not populated. The exam currently uses ACS tasks directly without graph traversal.
- **No transcript persistence** — Conversation history is client-side only; `session_transcripts` table exists but isn't written to yet.
- **No latency logging** — `latency_logs` table exists but isn't populated.
- **Voice mode is Chrome-only** — Web Speech API (`SpeechRecognition`) is not available in Firefox/Safari.
- **No admin interface** — Admin RLS policies exist but no UI for managing concepts or reviewing off-graph mentions.
- **Single rating** — Only Private Pilot is supported. Schema supports instrument/commercial/ATP but no ACS data is seeded for them.

---

*Last updated: February 2026*
