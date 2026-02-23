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
| Auth | Supabase Auth | Email/password, email confirmation |
| AI Examiner | Claude Sonnet (`claude-sonnet-4-6`) | DPE persona + answer assessment |
| TTS | Multi-provider (Cartesia/Deepgram/OpenAI) | Tier-based voice selection via provider factory |
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

Task IDs follow the pattern: `{PREFIX}.{Roman numeral}.{Letter}`
- `PA` = Private Pilot Airplane (61 tasks, FAA-S-ACS-6C)
- `CA` = Commercial Pilot Airplane (60 tasks, FAA-S-ACS-7B)
- `IR` = Instrument Rating (22 tasks, FAA-S-ACS-8C)
- Roman numeral = Area of Operation (I through XII)
- Letter = Task within area (A, B, C, ...)

Element codes: `{PREFIX}.{Area}.{Task}.{K/R/S}{number}` where K=Knowledge, R=Risk Management, S=Skill

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

235+ unit tests across 12 test files covering:
- `exam-logic.ts` — area filtering, task selection, prompt construction
- `rag-filters.ts` — metadata filter inference (32 tests)
- `timing.ts`, `ttl-cache.ts`, `eval-helpers.ts` — observability + caching
- `session-policy.ts`, `browser-detect.ts`, `email-routing.ts` — runtime logic

---

## Supabase Dashboard Settings

**Important**: After initial setup, configure these in the Supabase dashboard:

1. **Auth > URL Configuration > Site URL**: `https://aviation-oral-exam-companion.vercel.app`
2. **Auth > URL Configuration > Redirect URLs**:
   - `https://aviation-oral-exam-companion.vercel.app/auth/callback`
   - `http://localhost:3000/auth/callback`

---

## Known Limitations / Future Work

- **Knowledge graph populated but unused at runtime** — ACS skeleton (areas, tasks, elements + `is_component_of` edges) is populated via migration `20260220100002`. Not yet used by exam engine for graph-enhanced retrieval.
- **No transcript persistence** — Conversation history is client-side only; `session_transcripts` table exists but isn't written to yet.
- **Latency logging implemented** — `latency_logs` table is populated with per-exchange timing spans via `src/lib/timing.ts`. Requires migration `20260220100001`.
- **Voice mode is Chrome-only** — Web Speech API (`SpeechRecognition`) is not available in Firefox/Safari.
- **No admin interface** — Admin RLS policies exist but no UI for managing concepts or reviewing off-graph mentions.
- **Three ratings supported** — Private Pilot (61 tasks), Commercial Pilot (60 tasks), and Instrument Rating (22 tasks) are fully seeded. ATP is schemaed but not yet populated.

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

*Last updated: February 2026*
