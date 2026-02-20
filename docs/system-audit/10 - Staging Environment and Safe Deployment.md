---
date: 2026-02-20
type: system-audit
tags: [heydpe, staging, deployment, environment, safety, runbook]
status: final
---

# 10 — Staging Environment and Safe Deployment

> This document defines how staging isolation works in the HeyDPE architecture and provides a step-by-step runbook for setting up and verifying a staging environment.

---

## What Staging Means in This Architecture

HeyDPE runs on **Next.js (Vercel) + Supabase**. There is no separate backend, queue, or cache layer. Staging isolation requires:

1. **A separate Supabase project** — physically isolated database, auth, storage, and edge functions. No shared state with production.
2. **A Vercel Preview deployment** (or separate Vercel project) — uses staging Supabase credentials via env vars.

```
Production                          Staging
┌─────────────┐                    ┌─────────────┐
│  Vercel     │                    │  Vercel     │
│  (main)     │                    │  (preview)  │
│  VERCEL_ENV │                    │  VERCEL_ENV │
│ =production │                    │  =preview   │
└──────┬──────┘                    └──────┬──────┘
       │                                  │
┌──────▼──────┐                    ┌──────▼──────┐
│  Supabase   │                    │  Supabase   │
│  (prod)     │                    │  (staging)  │
│  pvuiww...  │                    │  xxxxx...   │
└─────────────┘                    └─────────────┘
```

> [!important] Key Principle
> Production and staging never share a Supabase project. Scripts refuse to run against production by default. Environment mismatches between app config and DB config are caught automatically.

---

## Environment Detection

The module `src/lib/app-env.ts` provides:

| Helper | Purpose |
|--------|---------|
| `getAppEnv()` | Returns `'local'` / `'staging'` / `'production'` |
| `isProduction()` | Boolean shorthand |
| `assertNotProduction(action)` | Throws if running against production |
| `getDbEnvName(config)` | Reads `system_config['app.environment']` |
| `assertDbEnvMatchesAppEnv(...)` | Throws on app/DB env mismatch |

**Detection priority:**
1. `NEXT_PUBLIC_APP_ENV` (explicit override)
2. `VERCEL_ENV` mapping: `production` → production, `preview` → staging
3. Default: `local`

**DB-side verification:**
```sql
-- Set in each Supabase project:
INSERT INTO system_config (key, value)
VALUES ('app.environment', '{"name":"staging"}')
ON CONFLICT (key) DO UPDATE SET value = '{"name":"staging"}';
```

Scripts that write data check both the app env AND the DB env signature, catching cases where `.env.local` accidentally points to the wrong project.

---

## A. Create Staging Supabase Project

> [!note] Manual Steps
> These must be performed by a human in the Supabase dashboard.

- [ ] Go to [supabase.com/dashboard](https://supabase.com/dashboard)
- [ ] Create a new project (e.g., `heydpe-staging`) in the same organization
- [ ] Choose the same region as production (East US / North Virginia)
- [ ] Note the project URL and keys:
  - `NEXT_PUBLIC_SUPABASE_URL` (project URL)
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY` (anon/public key)
  - `SUPABASE_SERVICE_ROLE_KEY` (service role key — Settings > API)
- [ ] Create required storage buckets:
  - `source-images` (public)
  - `avatars` (public)

---

## B. Set Environment Marker in Staging DB

After creating the project, run this SQL in the Supabase SQL Editor:

```sql
-- Create system_config table if running before migrations
CREATE TABLE IF NOT EXISTS system_config (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Mark this database as staging
INSERT INTO system_config (key, value)
VALUES ('app.environment', '{"name":"staging"}')
ON CONFLICT (key) DO UPDATE SET value = '{"name":"staging"}';
```

> [!warning] Production DB
> For production, set `{"name":"production"}`. This enables mismatch detection — if a script configured for staging accidentally connects to the production DB, it will throw immediately.

---

## C. Configure Vercel

### Option 1: Preview Environment (Recommended)

In Vercel project settings → Environment Variables:

| Variable | Value | Environment |
|----------|-------|-------------|
| `NEXT_PUBLIC_APP_ENV` | `staging` | Preview only |
| `NEXT_PUBLIC_SUPABASE_URL` | staging project URL | Preview only |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | staging anon key | Preview only |
| `SUPABASE_SERVICE_ROLE_KEY` | staging service role key | Preview only |
| `ANTHROPIC_API_KEY` | same as prod (or separate) | Preview only |
| `OPENAI_API_KEY` | same as prod (or separate) | Preview only |

Production env vars remain unchanged and only apply to Production deployments.

### Option 2: Separate Vercel Project

Create a second Vercel project linked to the same repo but with staging env vars for all environments.

### Option 3: Local Staging

Copy `.env.staging.example` to `.env.local` and fill in staging credentials:
```bash
cp .env.staging.example .env.local
# Edit .env.local with staging Supabase credentials
```

---

## D. Apply Migrations

Link the Supabase CLI to the staging project:

```bash
supabase link --project-ref YOUR_STAGING_PROJECT_REF
```

Apply all migrations in order:

```bash
supabase db push
```

This applies all migrations from `supabase/migrations/` including:
- `20260214000001_initial_schema.sql` — base tables, RLS, RPC
- `20260214000002_seed_acs_tasks.sql` — Private Pilot ACS tasks
- `20260214000003_acs_elements.sql` — ACS elements table + seed
- ... (all subsequent migrations in timestamp order)

> [!important] Prerequisites
> The ACS graph migration (`20260220100002`) depends on `acs_elements` being populated. Ensure `20260214000003` runs first (it does, by timestamp order).

---

## E. Seed Knowledge Base (Optional but Recommended)

To test RAG retrieval in staging, ingest source documents:

```bash
# Ensure .env.local points to staging
npm run ingest:staging
```

This runs `scripts/ingest-sources.ts` with `NEXT_PUBLIC_APP_ENV=staging` (blocks production). Expected duration: 15-30 minutes depending on corpus size.

> [!note] Source PDFs
> The `sources/` directory must contain the FAA PDFs (PHAK, AFH, AIM, CFR parts). These are not committed to the repo. Copy them from local storage.

---

## F. Verification Steps

### 1. Run at least one exam exchange

Open the staging deployment URL, log in, start a practice exam, answer one question.

### 2. Run automated verification

```bash
npm run verify:staging
```

Expected: all 5 checks pass (latency logs, timing spans, embedding cache, ACS graph, metadata filter flag).

### 3. Run regulatory eval (optional)

```bash
npm run eval:regulatory -- --with-filters
```

Expected: ≥22/25 baseline, ≥25/25 with filters (requires ingested knowledge base).

---

## G. Promotion Checklist

Before merging a branch to `main` / deploying to production:

- [ ] All unit tests pass (`npm test`)
- [ ] TypeScript clean (`npm run typecheck`)
- [ ] No new lint errors in changed files
- [ ] `npm run verify:staging` passes 5/5 (if staging is set up)
- [ ] Eval harness: baseline ≥80%, with-filters ≥ baseline
- [ ] Feature flags are OFF by default in production:
  - `rag.metadata_filter` — default OFF, enable explicitly after deploy
- [ ] Migrations applied to production: `supabase db push` (after re-linking to prod project)
- [ ] Manual smoke test: start exam, answer question, verify TTS works

---

## H. Feature Flag Rollout Plan

| Flag | Default | When to Enable |
|------|---------|----------------|
| `rag.metadata_filter` | OFF (`{"enabled": false}`) | After verifying 25/25 eval with-filters in staging |

To enable in staging:
```sql
INSERT INTO system_config (key, value)
VALUES ('rag.metadata_filter', '{"enabled": true}')
ON CONFLICT (key) DO UPDATE SET value = '{"enabled": true}';
```

To enable in production (after staging verification):
```sql
-- Same SQL, run against PRODUCTION Supabase
INSERT INTO system_config (key, value)
VALUES ('rag.metadata_filter', '{"enabled": true}')
ON CONFLICT (key) DO UPDATE SET value = '{"enabled": true}';
```

To disable (rollback):
```sql
UPDATE system_config SET value = '{"enabled": false}'
WHERE key = 'rag.metadata_filter';
```

---

## Script Safety Summary

| Script | Writes to DB? | Production Guard |
|--------|---------------|-----------------|
| `scripts/ingest-sources.ts` | Yes (source_documents, source_chunks) | `assertNotProduction()` — blocks by default |
| `scripts/seed-elements.ts` | Yes (acs_elements) | No guard (seed data is idempotent) |
| `scripts/classify-difficulty.ts` | Yes (acs_elements.difficulty_default) | No guard (classification is idempotent) |

Override: set `ALLOW_PROD_WRITE=1` env var (not recommended).

---

*See also: [[02 - Current Architecture Map]], [[09 - Staging Verification]], [[07 - Optimization Roadmap]]*
