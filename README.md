# Aviation Oral Exam Companion

A voice-first AI oral exam simulator for Private Pilot checkride preparation. An AI examiner follows the FAA Airman Certification Standards (ACS) to ask questions, assess answers, and naturally transition between topics — just like a real Designated Pilot Examiner (DPE).

## Features

- **ACS-aligned questions** covering 9 oral-exam-relevant areas from FAA-S-ACS-6C
- **Voice mode** with speech-to-text (Web Speech API) and text-to-speech (OpenAI TTS)
- **Adaptive examiner** that probes weak areas with follow-up questions
- **Session tracking** with progress dashboard showing exchanges and ACS coverage
- **Text mode** for typing answers when voice isn't available

## Tech Stack

- **Next.js 16** (App Router, TypeScript, Tailwind CSS v4)
- **Supabase** (PostgreSQL, Auth, Row-Level Security)
- **Claude Sonnet** (examiner persona + answer assessment)
- **OpenAI TTS** (text-to-speech for examiner voice)
- **Vitest** (unit tests)
- **Vercel** (deployment)

## Getting Started

### Prerequisites

- Node.js 18+
- Supabase project
- Anthropic API key
- OpenAI API key

### Setup

1. Clone the repository:
   ```bash
   git clone https://github.com/piotrdlg/aviation-oral-exam-companion.git
   cd aviation-oral-exam-companion
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Copy environment variables:
   ```bash
   cp .env.example .env.local
   ```

4. Fill in your API keys in `.env.local`

5. Link and push the database schema:
   ```bash
   npx supabase link --project-ref YOUR_PROJECT_REF
   npx supabase db push --linked
   ```

6. Run the dev server:
   ```bash
   npm run dev
   ```

### Commands

| Command | Description |
|---------|-------------|
| `npm run dev` | Start development server |
| `npm run build` | Production build |
| `npm test` | Run unit tests |
| `npm run lint` | Run ESLint |

## Architecture

```
src/
├── app/
│   ├── (auth)/          # Login, signup pages
│   ├── (dashboard)/     # Practice, progress, settings
│   ├── api/
│   │   ├── exam/        # Exam engine API (start, respond, next-task)
│   │   ├── session/     # Session CRUD
│   │   └── tts/         # Text-to-speech proxy
│   ├── error.tsx        # Global error boundary
│   └── not-found.tsx    # 404 page
├── lib/
│   ├── exam-engine.ts   # Claude API integration (Supabase + Anthropic)
│   ├── exam-logic.ts    # Pure logic (task filtering, prompt building)
│   └── supabase/        # Supabase client helpers
└── types/
    └── speech.d.ts      # Web Speech API type declarations
```

## ACS Coverage

The exam covers these Private Pilot ACS areas during oral examination:

| Area | Topic |
|------|-------|
| I | Preflight Preparation |
| II | Preflight Procedures |
| III | Airport and Seaplane Base Operations |
| VI | Navigation |
| VII | Slow Flight and Stalls (knowledge/risk) |
| VIII | Basic Instrument Maneuvers (knowledge/risk) |
| IX | Emergency Operations |
| XI | Night Operations |
| XII | Postflight Procedures |

Areas IV (Takeoffs/Landings), V (Performance Maneuvers), and X (Multiengine) are excluded as they are flight-skill-only areas.
