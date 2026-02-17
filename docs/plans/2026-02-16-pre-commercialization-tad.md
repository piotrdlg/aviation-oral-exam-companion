# Pre-Commercialization Technical Architecture Design — HeyDPE

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement the companion implementation plan at `docs/plans/2026-02-16-pre-commercialization-implementation-plan.md`.

**Goal:** Design the technical architecture for four pre-commercialization work streams: Admin System, Access Control & Anti-Sharing, Cross-Browser Compatibility, and Phase 1 Monetization (Stripe), enabling autonomous implementation.

**Architecture:** Server-side Next.js 16 App Router + Supabase PostgreSQL with RLS + Stripe for payments. All new API routes follow existing patterns (server-side Supabase client, service-role for cross-user operations). Admin uses Google OAuth with admin_users table authorization. Auth migration replaces email/password with passwordless OTP + OAuth.

**Tech Stack:** Next.js 16.1.6, TypeScript, Tailwind CSS v4, Supabase (auth + DB + RLS), Stripe, Anthropic Claude Sonnet, Deepgram, Cartesia, Vitest

---

## 1. Executive Summary

This document defines the architecture for four work streams that must be completed before accepting paid users. Together they deliver: an admin console for operations, a secure auth system resistant to credential sharing, verified cross-browser voice compatibility, and Stripe-based subscription billing.

**Estimated total scope:** ~7-8 weeks of implementation across all four streams.

**Key architectural constraints:**
- All database access through Supabase RLS (no direct SQL from app code)
- Admin operations use `SUPABASE_SERVICE_ROLE_KEY` (server-side only)
- No breaking changes to the existing exam engine during migration
- Auth migration must be atomic (cutover, no dual-mode period)
- Stripe webhook processing must be idempotent and replay-safe

---

## 2. Scope & Dependencies

### In Scope

| Work Stream | Source Document | Sections |
|-------------|----------------|----------|
| **WS1: Admin System** | Product Upgrades Ch 1 | 1.1–1.8 (launch-minimum only) |
| **WS2: Access Control** | Product Upgrades Ch 3 | Auth migration, session enforcement |
| **WS3: Cross-Browser** | Product Upgrades Ch 2 | Voice verification, fallback testing |
| **WS4: Monetization** | Commercialization Topic List Phase 1 | 1.1–1.3 |

### Explicitly Out of Scope

| Item | Reason |
|------|--------|
| Session Continuity (Ch 4) | Separate work stream; no dependency on these 4 |
| Growth Admin features | Post-launch (impersonation, A/B testing, analytics dashboard) |
| School & Instructor Accounts (Ch 6) | Phase 6 — post-launch growth |
| Legal pages (ToS, Privacy) | Content authoring, not engineering |
| Phase 2+ marketing/SEO | Post-monetization |

### Cross-Stream Dependencies

```
WS1 (Admin) ──────────────────────────────────────────────────┐
  ├─ Prompt versioning (1.6) ← should be live before Stripe   │
  ├─ Kill switches (1.8) ← should be live before Stripe       │
  └─ Usage logging (1.4) ← enriches admin dashboard           │
                                                               │
WS2 (Access Control) ─────────────────────────────────────────┤
  ├─ Auth migration ← breaking change, coordinate cutover     │
  └─ Session enforcement ← after auth migration                │
                                                               │
WS3 (Cross-Browser) ──────────────────────────────────────────┤
  └─ Browser detection utility + verification matrix           │
                                                               │
WS4 (Monetization) ───────────────────────────────────────────┘
  ├─ Depends on: prompt versioning, kill switches (safety)
  ├─ Depends on: auth migration (users must be on new auth)
  └─ Independent: Stripe setup can proceed in parallel
```

---

## 3. Parallelization Analysis

### Streams That Can Run in Parallel

| Stream A | Stream B | Why Independent |
|----------|----------|-----------------|
| Admin DB schema | Stripe product setup | Different systems (Supabase vs Stripe Dashboard) |
| Admin API routes | Cross-browser testing | No shared code |
| Prompt versioning | OAuth provider setup | No shared code |
| Kill switch implementation | Stripe webhook handler | Different API routes |
| Admin frontend | Pricing page frontend | Different route groups |

### Streams That Must Be Sequential

| First | Then | Why |
|-------|------|-----|
| Admin DB migration | Admin API routes | Routes need tables to exist |
| Admin API routes | Admin frontend | Frontend calls API |
| Prompt versioning (DB + API) | Stripe go-live | Safety: must be able to rollback prompts |
| Kill switches (DB + API) | Stripe go-live | Safety: must be able to kill providers |
| Auth migration | Session enforcement | Enforcement assumes OTP/OAuth auth |
| Auth migration | Stripe integration | Users must be on new auth before billing |
| Stripe webhook handler | Entitlement sync | Webhook feeds entitlements |
| Stripe checkout | Pricing page | Page links to Checkout |

### Recommended Execution Order (Critical Path)

```
Week 1-2: [PARALLEL]
  ├─ Thread A: Admin DB schema + API routes (prompt versioning, kill switches, usage logging)
  ├─ Thread B: Stripe account setup + products/prices + webhook handler skeleton
  └─ Thread C: OAuth provider configuration (Google, Apple, Microsoft in Supabase)

Week 3-4: [PARALLEL]
  ├─ Thread A: Admin frontend (dashboard, user management, prompt UI, config UI)
  ├─ Thread B: Auth migration (remove password, add OTP + OAuth, update login/signup pages)
  └─ Thread C: Stripe entitlement sync + customer portal + dunning

Week 5-6: [PARALLEL]
  ├─ Thread A: Report inaccurate answer + moderation queue (Admin WS1.7)
  ├─ Thread B: Session enforcement + Active Sessions UI (WS2)
  └─ Thread C: Pricing page + upgrade prompts + usage dashboard (WS4)

Week 7: [SEQUENTIAL]
  ├─ Cross-browser verification matrix (WS3)
  ├─ Integration testing (all streams together)
  └─ Auth cutover coordination
```

---

## 4. Work Stream 1: Admin System

### 4.1 New Database Tables

#### `system_config`

Key-value store for runtime configuration. Kill switches, maintenance mode, and feature flags.

```sql
CREATE TABLE system_config (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  description TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by UUID REFERENCES auth.users(id)
);

-- Seed with default config
INSERT INTO system_config (key, value, description) VALUES
  ('kill_switch.anthropic', '{"enabled": false}', 'Disable Anthropic API calls'),
  ('kill_switch.openai', '{"enabled": false}', 'Disable OpenAI API calls'),
  ('kill_switch.deepgram', '{"enabled": false}', 'Disable Deepgram API calls'),
  ('kill_switch.cartesia', '{"enabled": false}', 'Disable Cartesia API calls'),
  ('kill_switch.tier.ground_school', '{"enabled": false}', 'Disable ground_school tier'),
  ('kill_switch.tier.checkride_prep', '{"enabled": false}', 'Disable checkride_prep tier'),
  ('kill_switch.tier.dpe_live', '{"enabled": false}', 'Disable dpe_live tier'),
  ('maintenance_mode', '{"enabled": false, "message": ""}', 'Global maintenance mode'),
  ('user_hard_caps', '{"daily_llm_tokens": 100000, "daily_tts_chars": 50000, "daily_stt_seconds": 3600}', 'Per-user daily hard caps');

-- RLS: admin read/write only
ALTER TABLE system_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admin read config" ON system_config FOR SELECT
  USING (EXISTS (SELECT 1 FROM admin_users WHERE user_id = auth.uid()));
CREATE POLICY "Admin update config" ON system_config FOR UPDATE
  USING (EXISTS (SELECT 1 FROM admin_users WHERE user_id = auth.uid()));
```

#### `admin_devices`

Trusted device registry for admin device binding.

```sql
CREATE TABLE admin_devices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  device_fingerprint TEXT NOT NULL,
  device_label TEXT, -- "Piotr's MacBook Pro"
  last_used_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, device_fingerprint)
);

ALTER TABLE admin_devices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admin manage devices" ON admin_devices FOR ALL
  USING (EXISTS (SELECT 1 FROM admin_users WHERE user_id = auth.uid()));
```

**Device fingerprint algorithm:** SHA-256 hash of `user_agent + platform + screen_resolution + timezone`.

#### `admin_audit_log`

Immutable audit trail for all admin actions.

```sql
CREATE TABLE admin_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_user_id UUID NOT NULL REFERENCES auth.users(id),
  action TEXT NOT NULL, -- 'user.ban', 'user.tier_change', 'config.update', 'prompt.publish', etc.
  target_type TEXT, -- 'user', 'config', 'prompt', 'moderation'
  target_id TEXT, -- User ID, config key, prompt version ID, etc.
  details JSONB NOT NULL DEFAULT '{}', -- Action-specific details
  ip_address INET,
  device_fingerprint TEXT,
  reason TEXT, -- Admin-provided reason for the action
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_audit_admin ON admin_audit_log(admin_user_id);
CREATE INDEX idx_audit_target ON admin_audit_log(target_type, target_id);
CREATE INDEX idx_audit_created ON admin_audit_log(created_at DESC);

ALTER TABLE admin_audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admin read audit" ON admin_audit_log FOR SELECT
  USING (EXISTS (SELECT 1 FROM admin_users WHERE user_id = auth.uid()));
CREATE POLICY "Admin insert audit" ON admin_audit_log FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM admin_users WHERE user_id = auth.uid()));
-- No UPDATE or DELETE — immutable log
```

#### `prompt_versions`

Versioned system prompts with approval workflow.

```sql
CREATE TABLE prompt_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prompt_key TEXT NOT NULL, -- 'examiner_system', 'assessment_system'
  rating TEXT, -- NULL = applies to all ratings
  study_mode TEXT, -- NULL = applies to all modes
  version INT NOT NULL,
  content TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft', -- 'draft', 'published', 'archived'
  change_summary TEXT, -- What changed from previous version
  published_at TIMESTAMPTZ,
  published_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id)
);

-- Expression-based uniqueness requires CREATE UNIQUE INDEX, not inline UNIQUE constraint
CREATE UNIQUE INDEX idx_prompt_versions_unique
  ON prompt_versions (prompt_key, COALESCE(rating, '__all__'), COALESCE(study_mode, '__all__'), version);

CREATE INDEX idx_prompt_versions_key_status ON prompt_versions(prompt_key, status);
CREATE INDEX idx_prompt_versions_published ON prompt_versions(prompt_key, published_at DESC)
  WHERE status = 'published';

ALTER TABLE prompt_versions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admin manage prompts" ON prompt_versions FOR ALL
  USING (EXISTS (SELECT 1 FROM admin_users WHERE user_id = auth.uid()));
-- Runtime must read published prompts (non-admin authenticated users)
CREATE POLICY "Auth read published prompts" ON prompt_versions FOR SELECT
  USING (status = 'published' AND auth.uid() IS NOT NULL);
```

**Fail-closed runtime loading:**

```typescript
// src/lib/prompts.ts
async function getPublishedPrompt(
  supabase: SupabaseClient,
  promptKey: string,
  rating?: string,
  studyMode?: string
): Promise<string> {
  // Try DB first — fetch all published versions for this key, then pick best match in code.
  // This avoids ambiguity from multiple PostgREST .or() calls.
  const { data: candidates, error } = await supabase
    .from('prompt_versions')
    .select('content, rating, study_mode, version')
    .eq('prompt_key', promptKey)
    .eq('status', 'published')
    .order('version', { ascending: false });

  // Deterministic selection: score by specificity, then pick highest version within best specificity.
  // Specificity: 2 = exact rating + exact study_mode, 1 = one exact + one wildcard, 0 = both wildcard.
  const scored = (candidates ?? [])
    .filter(c =>
      (c.rating === rating || c.rating === null) &&
      (c.study_mode === studyMode || c.study_mode === null)
    )
    .map(c => ({
      ...c,
      specificity: (c.rating === rating ? 1 : 0) + (c.study_mode === studyMode ? 1 : 0),
    }))
    .sort((a, b) => b.specificity - a.specificity || b.version - a.version);

  const data = scored[0] ?? null;

  if (error || !data) {
    // Fail-closed: use hardcoded fallback — never return empty string
    console.warn(`Failed to load prompt ${promptKey} from DB, using fallback`);
    const fallback = FALLBACK_PROMPTS[promptKey];
    if (!fallback) {
      return `${IMMUTABLE_SAFETY_PREFIX}\n\n[SYSTEM ERROR: No prompt found for key "${promptKey}". Respond with a safe, neutral greeting and ask the student what topic they would like to discuss.]`;
    }
    return fallback;
  }

  // Safety prefix is ALWAYS the hardcoded immutable version — never overridden by DB
  return `${IMMUTABLE_SAFETY_PREFIX}\n\n${data.content}`;
}
```

**Transcript audit linkage:** Each `session_transcripts` row will gain a `prompt_version_id UUID` column referencing the prompt version that generated it.

#### `moderation_queue`

User reports and AI safety incident log.

```sql
CREATE TABLE moderation_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_type TEXT NOT NULL CHECK (report_type IN ('inaccurate_answer', 'safety_incident', 'bug_report', 'content_error')),
  reporter_user_id UUID REFERENCES auth.users(id), -- NULL for system-generated
  session_id UUID REFERENCES exam_sessions(id),
  transcript_id UUID REFERENCES session_transcripts(id),
  prompt_version_id UUID REFERENCES prompt_versions(id),
  details JSONB NOT NULL DEFAULT '{}',
  -- For inaccurate_answer: {user_comment, citations_shown, model_used, provider_used}
  -- For safety_incident: {trigger_text, refusal_response, safety_rule_matched}
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'reviewing', 'resolved', 'dismissed')),
  resolution_notes TEXT,
  resolved_by UUID REFERENCES auth.users(id),
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_moderation_status ON moderation_queue(status, created_at DESC);
CREATE INDEX idx_moderation_reporter ON moderation_queue(reporter_user_id);

ALTER TABLE moderation_queue ENABLE ROW LEVEL SECURITY;
-- Users can insert reports for their own sessions
CREATE POLICY "User submit report" ON moderation_queue FOR INSERT
  WITH CHECK (
    reporter_user_id = auth.uid()
    AND (session_id IS NULL OR EXISTS (
      SELECT 1 FROM exam_sessions WHERE id = session_id AND user_id = auth.uid()
    ))
  );
-- Admin read/update all
CREATE POLICY "Admin manage moderation" ON moderation_queue FOR ALL
  USING (EXISTS (SELECT 1 FROM admin_users WHERE user_id = auth.uid()));
```

#### `admin_notes`

Internal notes attached to users.

```sql
CREATE TABLE admin_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  target_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  admin_user_id UUID NOT NULL REFERENCES auth.users(id),
  note TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_admin_notes_target ON admin_notes(target_user_id, created_at DESC);

ALTER TABLE admin_notes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admin manage notes" ON admin_notes FOR ALL
  USING (EXISTS (SELECT 1 FROM admin_users WHERE user_id = auth.uid()));
```

#### Schema Modifications to Existing Tables

```sql
-- Add prompt version tracking to session_transcripts
ALTER TABLE session_transcripts
  ADD COLUMN prompt_version_id UUID REFERENCES prompt_versions(id);

-- Add banned/suspended status to user_profiles
ALTER TABLE user_profiles
  ADD COLUMN account_status TEXT NOT NULL DEFAULT 'active', -- 'active', 'suspended', 'banned'
  ADD COLUMN status_reason TEXT,
  ADD COLUMN status_changed_at TIMESTAMPTZ,
  ADD COLUMN status_changed_by UUID REFERENCES auth.users(id),
  ADD COLUMN last_login_at TIMESTAMPTZ, -- Updated on login events and exam start, NOT on every middleware request
  ADD COLUMN auth_method TEXT; -- 'email_otp', 'google', 'apple', 'microsoft', 'password' (legacy)
```

### 4.2 API Routes

All admin routes are under `/api/admin/` and share a common auth guard:

```typescript
// src/lib/admin-guard.ts
export async function requireAdmin(request: NextRequest): Promise<{
  user: User;
  supabase: SupabaseClient;
  serviceSupabase: SupabaseClient;
}> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new AdminAuthError('Not authenticated', 401);

  const serviceSupabase = createServiceClient(/*...*/);
  const { data: adminRow } = await serviceSupabase
    .from('admin_users')
    .select('user_id')
    .eq('user_id', user.id)
    .maybeSingle(); // Returns null (not error) when user is not admin

  if (!adminRow) throw new AdminAuthError('Not admin', 403);

  // Optional: device binding check
  const deviceFp = request.headers.get('x-device-fingerprint');
  if (deviceFp) {
    const { data: device } = await serviceSupabase
      .from('admin_devices')
      .select('id')
      .eq('user_id', user.id)
      .eq('device_fingerprint', deviceFp)
      .single();
    // If device binding is enforced and device not found → reject
  }

  return { user, supabase, serviceSupabase };
}
```

#### Route Inventory

| Route | Method | Purpose | Auth |
|-------|--------|---------|------|
| `/api/admin/dashboard` | GET | Dashboard stats (user counts, session stats, cost summary) | Admin |
| `/api/admin/users` | GET | Paginated user list with search/filter | Admin |
| `/api/admin/users/[id]` | GET | User detail (sessions, scores, usage) | Admin |
| `/api/admin/users/[id]/actions` | POST | Ban, suspend, delete, change tier, add note | Admin |
| `/api/admin/sessions/[id]/transcript` | GET | Full transcript for a session | Admin |
| `/api/admin/prompts` | GET | List all prompt versions | Admin |
| `/api/admin/prompts` | POST | Create new prompt version (draft) | Admin |
| `/api/admin/prompts/[id]/publish` | POST | Publish a draft prompt | Admin |
| `/api/admin/prompts/[id]/rollback` | POST | Archive current, restore previous published | Admin |
| `/api/admin/config` | GET | Read system_config | Admin |
| `/api/admin/config` | POST | Update system_config entry | Admin |
| `/api/admin/moderation` | GET | List moderation queue items | Admin |
| `/api/admin/moderation/[id]` | POST | Resolve/dismiss moderation item | Admin |
| `/api/report` | POST | Submit "report inaccurate answer" (user-facing) | Auth |

#### Dashboard Stats Query

```sql
-- Active users (last 24h, 7d, 30d)
SELECT
  COUNT(DISTINCT CASE WHEN last_login_at > NOW() - INTERVAL '1 day' THEN user_id END) as dau,
  COUNT(DISTINCT CASE WHEN last_login_at > NOW() - INTERVAL '7 days' THEN user_id END) as wau,
  COUNT(DISTINCT CASE WHEN last_login_at > NOW() - INTERVAL '30 days' THEN user_id END) as mau,
  COUNT(*) as total_users
FROM user_profiles;

-- Session stats
SELECT
  COUNT(*) FILTER (WHERE status = 'active') as active_now,
  COUNT(*) FILTER (WHERE started_at > NOW() - INTERVAL '1 day') as today,
  COUNT(*) FILTER (WHERE started_at > NOW() - INTERVAL '7 days') as this_week,
  AVG(exchange_count) FILTER (WHERE ended_at IS NOT NULL AND started_at > NOW() - INTERVAL '7 days') as avg_exchanges_7d,
  AVG(EXTRACT(EPOCH FROM (ended_at - started_at))/60)
    FILTER (WHERE ended_at IS NOT NULL AND started_at > NOW() - INTERVAL '7 days') as avg_duration_min_7d
FROM exam_sessions;

-- Cost summary (from usage_logs, last 7 days)
SELECT
  provider,
  event_type,
  COUNT(*) as request_count,
  SUM(quantity) as total_quantity,
  AVG(latency_ms) as avg_latency,
  COUNT(*) FILTER (WHERE status = 'error') as error_count
FROM usage_logs
WHERE created_at > NOW() - INTERVAL '7 days'
GROUP BY provider, event_type;

-- Top anomaly users (>5x average)
WITH avg_usage AS (
  SELECT AVG(cnt) as avg_count FROM (
    SELECT user_id, COUNT(*) as cnt
    FROM usage_logs
    WHERE created_at > NOW() - INTERVAL '7 days'
    GROUP BY user_id
  ) sub
)
SELECT u.id, u.email, COUNT(*) as request_count
FROM usage_logs ul
JOIN auth.users u ON ul.user_id = u.id
WHERE ul.created_at > NOW() - INTERVAL '7 days'
GROUP BY u.id, u.email
HAVING COUNT(*) > (SELECT avg_count * 5 FROM avg_usage)
ORDER BY request_count DESC
LIMIT 10;
```

### 4.3 Frontend Architecture

#### Admin Route Group

```
src/app/
├── admin/
│   └── login/
│       └── page.tsx          # Admin login (Google OAuth only, NOT in (admin) group — avoids layout guard)
├── (admin)/
│   ├── layout.tsx            # Admin layout: sidebar nav, admin auth check → redirects to /admin/login
│   ├── admin/
│   │   ├── page.tsx          # Dashboard (stats, charts, alerts)
│   │   ├── users/
│   │   │   ├── page.tsx      # User list with search/filter
│   │   │   └── [id]/
│   │   │       └── page.tsx  # User detail (sessions, scores, usage, notes)
│   │   ├── prompts/
│   │   │   └── page.tsx      # Prompt version manager
│   │   ├── config/
│   │   │   └── page.tsx      # System config (kill switches, maintenance)
│   │   └── moderation/
│   │       └── page.tsx      # Moderation queue
```

**Key UI components:**
- `AdminLayout` — Sidebar with nav links, admin user badge, breadcrumbs
- `UserTable` — Sortable, filterable, paginated user list
- `UserDetailPanel` — Tab layout: Overview | Sessions | Scores | Usage | Notes
- `TranscriptViewer` — Read-only chat transcript with assessment badges
- `PromptEditor` — Code editor with diff view, version history, publish/rollback buttons
- `KillSwitchPanel` — Toggle cards for each provider + tier, with status indicators
- `ModerationQueue` — List view with filters (open/resolved), detail drawer

### 4.4 Admin Authentication Flow

```
User navigates to /admin
         │
         ▼
Admin layout checks auth.getUser()
         │
    ┌────┴────┐
    │ No user │──── Redirect to /admin/login (Google OAuth only)
    └────┬────┘
         │ User exists
         ▼
Check admin_users table
         │
    ┌────┴────────┐
    │ Not in table │──── Show "Access Denied" page
    └────┬────────┘
         │ Is admin
         ▼
(Optional) Check admin_devices
         │
    ┌────┴───────────┐
    │ Device unknown  │──── Show "Unrecognized device" + block
    └────┬───────────┘
         │ Device OK
         ▼
Render admin dashboard
Log audit entry: admin.login
```

**Admin login page (`/admin/login`):** Single button: "Sign in with Google". Uses `supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: '${window.location.origin}/auth/callback?next=/admin' } })` — routes through the standard `/auth/callback` to establish cookies/session before landing on `/admin`.

### 4.5 Prompt Management System

**Current state:** System prompts are hardcoded in `exam-logic.ts` (`buildSystemPrompt()`) and `exam-engine.ts` (`assessAnswer()`).

**Target state:**
1. Existing hardcoded prompts become the initial seed data (version 1, status='published')
2. Runtime loads from DB with fail-closed fallback to hardcoded
3. Admin UI allows editing, previewing, publishing, and rolling back
4. Every transcript records which prompt version generated it

**Prompt keys:**

| Key | Current Location | Used By |
|-----|-----------------|---------|
| `examiner_system` | `exam-logic.ts:buildSystemPrompt()` | `generateExaminerTurn()` |
| `assessment_system` | `exam-engine.ts:assessAnswer()` | `assessAnswer()` |
**Safety prefix:** A **hardcoded, truly immutable** section that cannot be edited via admin UI or overridden by database values. It contains the core safety guardrails (no flight instruction, verify with CFI, AI accuracy disclaimer). It is prepended at runtime by `getPromptContent()` — the function always uses `IMMUTABLE_SAFETY_PREFIX` and never reads a safety prefix from the DB. This eliminates any risk of prompt injection via the admin prompt editor.

### 4.6 Kill Switch Architecture

**Enforcement priority:** `kill_switch` > `per_user_hard_cap` > `tier_entitlements` > normal routing

**Kill switch check function:**

**Architecture note:** The kill switch check is a **pure function** that receives a pre-fetched config object. Config fetching is done separately via `getSystemConfig()` (see Section 4.6.1 below). This split allows the core logic to be fully unit-testable without mocking DB calls.

```typescript
// src/lib/kill-switch.ts
export type SystemConfigMap = Record<string, Record<string, unknown>>;

export interface KillSwitchResult {
  blocked: boolean;
  reason?: string;
  fallbackTier?: VoiceTier;
}

/**
 * Pure function — no DB calls. Config is passed in from getSystemConfig().
 */
export function checkKillSwitch(
  config: SystemConfigMap,
  provider: string,
  tier: VoiceTier
): KillSwitchResult {
  // Check maintenance mode first (highest priority)
  const maintenance = config['maintenance_mode'] as { enabled: boolean; message: string } | undefined;
  if (maintenance?.enabled) {
    return { blocked: true, reason: maintenance.message || 'Maintenance in progress' };
  }

  // Check provider kill switch
  const providerSwitch = config[`kill_switch.${provider}`] as { enabled: boolean } | undefined;
  if (providerSwitch?.enabled) {
    return { blocked: true, reason: `Provider ${provider} is temporarily disabled` };
  }

  // Check tier kill switch
  const tierSwitch = config[`kill_switch.tier.${tier}`] as { enabled: boolean } | undefined;
  if (tierSwitch?.enabled) {
    // If tier is killed, try to degrade dpe_live → checkride_prep
    if (tier === 'dpe_live') {
      const t2Switch = config['kill_switch.tier.checkride_prep'] as { enabled: boolean } | undefined;
      if (!t2Switch?.enabled) {
        return { blocked: false, fallbackTier: 'checkride_prep' };
      }
    }
    return { blocked: true, reason: `Tier ${tier} is temporarily disabled` };
  }

  return { blocked: false };
}
```

#### 4.6.1 System Config Fetching

**Serverless constraint:** In-memory caching (`let cachedConfig`) does **NOT** work in Vercel's serverless environment — each Lambda invocation has isolated memory. Config is fetched from DB on every request.

```typescript
// src/lib/system-config.ts
export async function getSystemConfig(
  serviceSupabase: SupabaseClient
): Promise<SystemConfigMap> {
  const { data, error } = await serviceSupabase
    .from('system_config')
    .select('key, value');

  if (error || !data) {
    console.warn('Failed to fetch system config, returning empty (fail-open for config)');
    return {};
  }

  const config: SystemConfigMap = {};
  for (const row of data) {
    config[row.key] = row.value as Record<string, unknown>;
  }
  return config;
}
```

**Performance note:** This adds one small DB query per API request. The `system_config` table has <10 rows and is read via primary key scan — latency is negligible (<5ms). If scale demands caching, migrate to Upstash Redis with 30-second TTL.

**Integration points:** Kill switch check is called at the top of:
- `POST /api/exam` (LLM provider check)
- `POST /api/tts` (TTS provider check)
- `GET /api/stt/token` (STT provider check)

**Activation behavior:**
- In-flight requests: allowed to complete (drain)
- New requests: rejected before provider dispatch
- User sees: banner "Voice is temporarily unavailable — switching to text mode"
- LLM kill: "The examiner is temporarily unavailable. Your session has been paused."
- Reversible: admin toggles flag back, service resumes on next request (config fetched per-request, no cache)

### 4.7 Support & Moderation

**"Report Inaccurate Answer" button:**
- Rendered on every examiner message in the chat UI
- On click: opens modal with:
  - Pre-filled: transcript exchange ID, citations shown, prompt version IDs
  - User fills: comment text, error type (factual/scoring/safety)
- POST to `/api/report` → inserts into `moderation_queue`
- Admin sees in moderation queue with full context

**Feedback widget (separate from report):**
- Accessible from Settings page or help icon
- Two flows: "Bug Report" vs "Content Accuracy Error"
- Bug reports: capture browser info, page URL, screenshot (optional)
- Content errors: link to specific ACS element or FAA document

---

## 5. Work Stream 2: Access Control & Anti-Sharing

### 5.1 Auth Migration

**Current auth:** Email + password via `supabase.auth.signUp()` / `signInWithPassword()`.

**Target auth:** Passwordless OTP + OAuth (Google, Apple, Microsoft).

#### Supabase Auth Configuration Changes

| Setting | Current | New |
|---------|---------|-----|
| Email provider | Enabled (password) | Enabled (OTP only) |
| Google OAuth | Disabled | Enabled |
| Apple OAuth | Disabled | Enabled |
| Microsoft OAuth | Disabled | Enabled |
| Password auth | Required | Disabled |
| OTP email template | Default | Custom branded |

**Supabase OTP flow:**
```typescript
// Login with OTP
const { error } = await supabase.auth.signInWithOtp({
  email: userEmail,
  options: {
    shouldCreateUser: true, // Auto-create account on first OTP login
  }
});
// User receives 6-digit code via email (Resend SMTP)
// User enters code:
const { data, error } = await supabase.auth.verifyOtp({
  email: userEmail,
  token: sixDigitCode,
  type: 'email',
});
```

**OAuth flow:**
```typescript
// Google OAuth
const { error } = await supabase.auth.signInWithOAuth({
  provider: 'google',
  options: {
    redirectTo: `${window.location.origin}/auth/callback`,
  }
});
```

#### Login Page Redesign

```
┌──────────────────────────────────────┐
│           Welcome to HeyDPE          │
│                                      │
│  ┌──────────────────────────────────┐│
│  │ Continue with Google        [G]  ││
│  └──────────────────────────────────┘│
│  ┌──────────────────────────────────┐│
│  │ Continue with Apple         []  ││
│  └──────────────────────────────────┘│
│  ┌──────────────────────────────────┐│
│  │ Continue with Microsoft     [M]  ││
│  └──────────────────────────────────┘│
│                                      │
│  ──────── or ────────                │
│                                      │
│  Email address:                      │
│  ┌──────────────────────────────────┐│
│  │ pilot@example.com                ││
│  └──────────────────────────────────┘│
│  ┌──────────────────────────────────┐│
│  │       Send Login Code            ││
│  └──────────────────────────────────┘│
│                                      │
│  Already have a code? Enter it here  │
│                                      │
│  ┌──┐ ┌──┐ ┌──┐ ┌──┐ ┌──┐ ┌──┐    │
│  │  │ │  │ │  │ │  │ │  │ │  │    │
│  └──┘ └──┘ └──┘ └──┘ └──┘ └──┘    │
│                                      │
│  Code expires in 10 minutes          │
└──────────────────────────────────────┘
```

**Key changes to existing pages:**
- Remove `/signup` page entirely (OTP auto-creates accounts)
- Merge signup into `/login` (single unified entry point)
- Remove password fields
- Remove "Forgot Password?" link
- Add OAuth provider buttons
- Add OTP code entry UI (6-digit input with auto-focus)
- Update `/auth/callback` to handle OAuth redirects (already domain-agnostic)

#### Migration Strategy

Since there are no existing paid users, this is a clean cutover:
1. Deploy new login page with OTP + OAuth
2. Disable password-based auth in Supabase
3. Existing accounts can still log in via OTP to same email
4. No password migration needed

### 5.2 Session Enforcement: "One Active Exam" Model

#### New Table: `active_sessions`

```sql
CREATE TABLE active_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  session_token_hash TEXT NOT NULL, -- SHA-256 of JWT session_id claim (stable per login session)
  device_info JSONB NOT NULL DEFAULT '{}', -- {user_agent, platform, timezone, screen}
  device_label TEXT, -- "Chrome on macOS" (derived from user_agent)
  ip_address INET, -- Informational only, never used for enforcement
  approximate_location TEXT, -- Derived from IP, labeled "approximate"
  is_exam_active BOOLEAN NOT NULL DEFAULT FALSE,
  exam_session_id UUID REFERENCES exam_sessions(id),
  last_activity_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, session_token_hash)
);

CREATE INDEX idx_active_sessions_user ON active_sessions(user_id);
CREATE INDEX idx_active_sessions_exam ON active_sessions(user_id, is_exam_active)
  WHERE is_exam_active = TRUE;

ALTER TABLE active_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "User read own sessions" ON active_sessions FOR SELECT
  USING (user_id = auth.uid());
CREATE POLICY "User delete own sessions" ON active_sessions FOR DELETE
  USING (user_id = auth.uid());
-- INSERT/UPDATE via service role only (server manages session tracking)
```

**Session token hash extraction:** The `session_token_hash` is derived by decoding the Supabase JWT `access_token` and hashing the `session_id` claim (a stable UUID assigned at login time that does not rotate on token refresh — unlike `refresh_token` which may rotate if refresh token rotation is enabled). In API route handlers, extract it via:
```typescript
import { createHash } from 'crypto';

function decodeJwtPayload(jwt: string): Record<string, unknown> {
  const payload = jwt.split('.')[1];
  return JSON.parse(Buffer.from(payload, 'base64url').toString());
}

const { data: { session } } = await supabase.auth.getSession();
if (!session?.access_token) throw new Error('No active session');
const jwtPayload = decodeJwtPayload(session.access_token);
const sessionId = jwtPayload.session_id as string;
if (!sessionId) throw new Error('JWT missing session_id claim');
const tokenHash = createHash('sha256').update(sessionId).digest('hex');
```
The raw `session_id` is a UUID (not a bearer secret), but we hash it anyway for consistency with the column name `session_token_hash`. This approach is robust against refresh token rotation settings.

#### Exam Enforcement Logic

**Enforcement points:** The `enforceOneActiveExam()` check is called on **every exam mutation** — `start`, `respond`, and `next-task` — not just on `start`. This prevents a stale session from continuing to submit answers after a new session has started on another device.

```typescript
// Called from POST /api/exam for actions: 'start', 'respond', 'next-task'
async function enforceOneActiveExam(
  serviceSupabase: SupabaseClient,
  userId: string,
  newExamSessionId: string,
  currentTokenHash: string
): Promise<{ pausedSessionId?: string }> {
  // Find any other active exam for this user
  const { data: otherActive } = await serviceSupabase
    .from('active_sessions')
    .select('id, exam_session_id, session_token_hash')
    .eq('user_id', userId)
    .eq('is_exam_active', true)
    .neq('session_token_hash', currentTokenHash)
    .limit(1)
    .maybeSingle(); // Returns null (not error) when no rows found

  if (otherActive?.exam_session_id) {
    // Pause the other exam session
    await serviceSupabase
      .from('exam_sessions')
      .update({ status: 'paused' })
      .eq('id', otherActive.exam_session_id)
      .eq('status', 'active'); // CAS: only if still active

    // Clear the active exam flag on the other device
    await serviceSupabase
      .from('active_sessions')
      .update({ is_exam_active: false, exam_session_id: null })
      .eq('id', otherActive.id);

    return { pausedSessionId: otherActive.exam_session_id };
  }

  // Set current session as active exam
  await serviceSupabase
    .from('active_sessions')
    .upsert({
      user_id: userId,
      session_token_hash: currentTokenHash,
      is_exam_active: true,
      exam_session_id: newExamSessionId,
      last_activity_at: new Date().toISOString(),
    }, { onConflict: 'user_id,session_token_hash' });

  return {};
}
```

### 5.3 Active Sessions UI

In Settings page, add "Active Sessions" section:

```
┌──────────────────────────────────────┐
│ Active Sessions                      │
│                                      │
│ ┌────────────────────────────────┐   │
│ │ Chrome on macOS                │   │
│ │ Approximate location: Jacksonville│
│ │ Last active: 2 minutes ago     │   │
│ │ Status: Exam in progress       │   │
│ │ [This device]                  │   │
│ └────────────────────────────────┘   │
│                                      │
│ ┌────────────────────────────────┐   │
│ │ Safari on iOS                  │   │
│ │ Approximate location: Jacksonville│
│ │ Last active: 3 hours ago       │   │
│ │ Status: Idle                   │   │
│ └────────────────────────────────┘   │
│                                      │
│ [Sign Out All Other Sessions]        │
└──────────────────────────────────────┘
```

Note: Per-session sign-out buttons are intentionally omitted. The MVP only supports "Sign Out All Other Sessions" because we store `session_token_hash` (not the raw session_id needed for targeted Supabase session revocation).

**API:** `GET /api/user/sessions` → list active sessions. `DELETE /api/user/sessions` → sign out ALL OTHER sessions (delete from `active_sessions` where not current, then `supabase.auth.signOut({ scope: 'others' })` using user's own client). Per-session revocation is not supported in MVP because we only store `session_token_hash` (not the raw session_id needed for targeted revocation).

---

## 6. Work Stream 3: Cross-Browser Compatibility

### 6.1 Current State Assessment

The voice system already supports 3 tiers with cross-browser Deepgram STT for Tier 2+. The owner decided to **drop Tier 1 from the commercial product**, making Deepgram universal for all paid users. This eliminates the Web Speech API browser dependency.

**What needs verification (NOT new code, just testing):**
1. Deepgram WebSocket STT on all target browsers
2. Cartesia PCM streaming on Safari (AudioWorklet requirement)
3. Deepgram TTS fallback when Cartesia unavailable
4. MediaRecorder codec compatibility (Safari uses MP4/AAC, not WebM/Opus)
5. iOS-specific constraints (autoplay, AudioContext resume, background audio)

### 6.2 Browser Detection Utility

Add a lightweight browser detection utility for runtime feature probing:

```typescript
// src/lib/browser-detect.ts
export interface BrowserCapabilities {
  supportsAudioWorklet: boolean;
  supportsMediaRecorder: boolean;
  mediaRecorderMimeType: string; // 'audio/webm;codecs=opus' or 'audio/mp4'
  supportsWebSocket: boolean;
  isIOSSafari: boolean;
  isIOSChrome: boolean; // Uses WebKit engine
  browserName: string;
  requiresUserGestureForAudio: boolean;
}

export function detectBrowserCapabilities(): BrowserCapabilities {
  const ua = navigator.userAgent;
  const isIOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const isSafari = /^((?!chrome|android|CriOS|FxiOS|EdgiOS).)*safari/i.test(ua);
  const isIOSSafari = isIOS && isSafari;
  const isIOSChrome = isIOS && /CriOS/.test(ua); // iOS Chrome uses WebKit

  return {
    supportsAudioWorklet: !!window.AudioContext && 'audioWorklet' in AudioContext.prototype,
    supportsMediaRecorder: typeof MediaRecorder !== 'undefined',
    mediaRecorderMimeType: typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported?.('audio/webm;codecs=opus')
      ? 'audio/webm;codecs=opus'
      : 'audio/mp4',
    supportsWebSocket: typeof WebSocket !== 'undefined',
    isIOSSafari,
    isIOSChrome,
    browserName: detectBrowserName(ua),
    requiresUserGestureForAudio: isIOS || isSafari,
  };
}
```

### 6.3 Cartesia AudioWorklet Fallback

Cartesia streams raw PCM audio which requires AudioWorklet for playback. On browsers that don't support AudioWorklet (or Safari < 14.5), automatically fall back to Deepgram TTS:

```typescript
// In useVoiceProvider hook
if (tier === 'dpe_live' && !capabilities.supportsAudioWorklet) {
  console.warn('AudioWorklet not supported, falling back to Tier 2 TTS');
  effectiveTier = 'checkride_prep'; // Use Deepgram TTS instead
}
```

### 6.4 Test Matrix

| Test Case | Chrome | Firefox | Safari | iOS Safari | iOS Chrome | Android |
|-----------|--------|---------|--------|-----------|-----------|---------|
| STT: Deepgram WebSocket connects | | | | | | |
| STT: Transcription accuracy (5 test phrases) | | | | | | |
| STT: Interim results displayed | | | | | | |
| TTS: Cartesia PCM playback | | | | | | |
| TTS: Deepgram fallback playback | | | | | | |
| TTS: Auto-play after user gesture | | | | | | |
| Full exam: Start → 3 Q&A → End | | | | | | |
| Progress page loads after session | | | | | | |
| Mic permission prompt | | | | | | |
| Background/foreground audio recovery | | | | | | |

---

## 7. Work Stream 4: Phase 1 Monetization (Stripe)

### 7.1 Stripe Product & Price Setup

**Products:**

| Product | Stripe Product Name | Description |
|---------|-------------------|-------------|
| HeyDPE Subscription | `heydpe_subscription` | Voice-first AI oral exam practice |

**Prices:**

| Price | Amount | Interval | Trial | Stripe Price ID (created at setup) |
|-------|--------|----------|-------|-------------------------------------|
| Monthly | $39.00 | monthly | 7-day | `price_monthly_xxx` |
| Annual | $299.00 | yearly | 7-day | `price_annual_xxx` |

**Tax:** Configure Stripe Tax with product tax code `txcd_10103000` (Digital educational services).

### 7.2 Webhook Handler

#### New Table: `subscription_events`

Idempotent event log to prevent duplicate processing.

```sql
CREATE TABLE subscription_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stripe_event_id TEXT NOT NULL UNIQUE,
  event_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'processing' CHECK (status IN ('processing', 'processed', 'failed')),
  error TEXT, -- Error message if status = 'failed'
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  payload JSONB NOT NULL DEFAULT '{}'
);

CREATE INDEX idx_sub_events_stripe ON subscription_events(stripe_event_id);

ALTER TABLE subscription_events ENABLE ROW LEVEL SECURITY;
-- No user access — service role only
```

#### Webhook Route: `POST /api/stripe/webhook`

```typescript
// src/app/api/stripe/webhook/route.ts
export async function POST(request: NextRequest) {
  const body = await request.text();
  const sig = request.headers.get('stripe-signature')!;

  // 1. Verify webhook signature
  const event = stripe.webhooks.constructEvent(body, sig, STRIPE_WEBHOOK_SECRET);

  // 2. Idempotency: try INSERT; on conflict check if already processed
  const { data: claimed, error: claimError } = await serviceSupabase
    .from('subscription_events')
    .insert({
      stripe_event_id: event.id,
      event_type: event.type,
      status: 'processing',
      payload: event.data.object,
    })
    .select('id')
    .single();

  if (claimError) {
    // UNIQUE conflict — check if already successfully processed
    const { data: existing } = await serviceSupabase
      .from('subscription_events')
      .select('status')
      .eq('stripe_event_id', event.id)
      .maybeSingle();

    if (existing?.status === 'processed') {
      return NextResponse.json({ received: true, deduplicated: true });
    }
    // status is 'processing' or 'failed' — previous attempt didn't finish; re-process below
  }

  // 3. Process event (first attempt or retry of a failed/incomplete attempt)
  try {
    switch (event.type) {
      case 'checkout.session.completed':
        await handleCheckoutCompleted(event.data.object);
        break;
      case 'customer.subscription.updated':
        await handleSubscriptionUpdated(event.data.object);
        break;
      case 'customer.subscription.deleted':
        await handleSubscriptionDeleted(event.data.object);
        break;
      case 'invoice.payment_failed':
        await handlePaymentFailed(event.data.object);
        break;
      // Future: 'invoice.paid', 'customer.subscription.trial_will_end'
    }

    // 4. Mark event as successfully processed
    await serviceSupabase
      .from('subscription_events')
      .update({ status: 'processed' })
      .eq('stripe_event_id', event.id);

    return NextResponse.json({ received: true });
  } catch (err) {
    // Mark as failed so retries can re-process (not skip)
    await serviceSupabase
      .from('subscription_events')
      .update({ status: 'failed', error: String(err) })
      .eq('stripe_event_id', event.id);

    console.error('Webhook processing error:', err);
    return NextResponse.json({ error: 'Processing failed' }, { status: 500 });
  }
}
```

#### Webhook Event Handlers

| Event | Handler Action |
|-------|----------------|
| `checkout.session.completed` | Create/update `user_profiles`: set Stripe fields, tier → `dpe_live`, status → `active`/`trialing` |
| `customer.subscription.updated` | Update `user_profiles`: sync status, period dates, price, cancel_at_period_end |
| `customer.subscription.deleted` | Downgrade: tier → `ground_school`, status → `canceled`, clear Stripe fields |
| `invoice.payment_failed` | Set `subscription_status = 'past_due'`, `latest_invoice_status = 'failed'` |
| `invoice.paid` | *(Future)* Update `latest_invoice_status = 'paid'`, ensure tier is correct |
| `customer.subscription.trial_will_end` | *(Future)* Trigger email reminder via Resend |

### 7.3 Entitlement Sync

**The "paid but still free" race condition:**

```
User clicks "Subscribe" → Stripe Checkout → Payment succeeds
    → Redirect to app (instant) → User sees free tier 😟
    → Webhook fires (1-5 seconds later) → Tier updated 😊
```

**Solution: Client-side check on redirect.**

```typescript
// src/app/api/stripe/status/route.ts
export async function GET(request: NextRequest) {
  // Called by client after Stripe checkout redirect
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Check user_profiles first (webhook may have already fired)
  const { data: profile } = await serviceSupabase
    .from('user_profiles')
    .select('tier, subscription_status, stripe_subscription_id, stripe_customer_id')
    .eq('user_id', user.id)
    .single();

  if (profile?.subscription_status === 'active' || profile?.subscription_status === 'trialing') {
    return NextResponse.json({ tier: profile.tier, status: profile.subscription_status });
  }

  // Webhook hasn't fired yet — check Stripe directly
  if (profile?.stripe_customer_id) {
    const subscriptions = await stripe.subscriptions.list({
      customer: profile.stripe_customer_id,
      status: 'all',
      limit: 1,
    });

    if (subscriptions.data.length > 0) {
      const sub = subscriptions.data[0];
      if (sub.status === 'active' || sub.status === 'trialing') {
        // Grant entitlement immediately (webhook will reconcile later)
        await serviceSupabase
          .from('user_profiles')
          .update({
            tier: 'dpe_live',
            subscription_status: sub.status,
            stripe_subscription_id: sub.id,
            stripe_price_id: sub.items.data[0]?.price.id,
            current_period_start: new Date(sub.current_period_start * 1000).toISOString(),
            current_period_end: new Date(sub.current_period_end * 1000).toISOString(),
          })
          .eq('user_id', user.id);

        return NextResponse.json({ tier: 'dpe_live', status: sub.status });
      }
    }
  }

  return NextResponse.json({ tier: profile?.tier ?? 'ground_school', status: 'free' });
}
```

### 7.4 Checkout & Portal Routes

```typescript
// src/app/api/stripe/checkout/route.ts
export async function POST(request: NextRequest) {
  const { plan } = await request.json(); // 'monthly' | 'annual'
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const priceId = plan === 'annual' ? STRIPE_PRICES.annual : STRIPE_PRICES.monthly;
  if (!priceId) return NextResponse.json({ error: 'Invalid plan' }, { status: 400 });

  // Get or create Stripe customer
  let customerId = await getOrCreateStripeCustomer(user);

  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    client_reference_id: user.id, // Links checkout to Supabase user for reliable webhook mapping
    metadata: { supabase_user_id: user.id }, // Top-level: available on checkout.session.completed event
    mode: 'subscription',
    line_items: [{ price: priceId, quantity: 1 }],
    subscription_data: {
      trial_period_days: 7,
      metadata: { supabase_user_id: user.id }, // Propagated to subscription object
    },
    success_url: `${process.env.NEXT_PUBLIC_SITE_URL}/practice?checkout=success`,
    cancel_url: `${process.env.NEXT_PUBLIC_SITE_URL}/pricing?checkout=canceled`,
    tax_id_collection: { enabled: true },
    automatic_tax: { enabled: true },
  });

  return NextResponse.json({ url: session.url });
}

// src/app/api/stripe/portal/route.ts
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await serviceSupabase
    .from('user_profiles')
    .select('stripe_customer_id')
    .eq('user_id', user.id)
    .single();

  if (!profile?.stripe_customer_id) {
    return NextResponse.json({ error: 'No subscription' }, { status: 400 });
  }

  const session = await stripe.billingPortal.sessions.create({
    customer: profile.stripe_customer_id,
    return_url: `${process.env.NEXT_PUBLIC_SITE_URL}/settings`,
  });

  return NextResponse.json({ url: session.url });
}
```

### 7.5 Pricing Page

New route: `/pricing`

```
┌──────────────────────────────────────────────────────────────┐
│                    Ready for Your Checkride?                 │
│         Practice with an AI examiner that talks back.        │
│                                                              │
│  ┌─────────────────────┐  ┌─────────────────────────────┐   │
│  │     Monthly          │  │    Annual (Save 36%)         │   │
│  │                      │  │                              │   │
│  │     $39/mo           │  │    $299/year                 │   │
│  │                      │  │    ($24.92/mo)               │   │
│  │  ✓ All 3 ratings     │  │    ✓ Everything in Monthly   │   │
│  │  ✓ Voice-first AI    │  │    ✓ Save $169/year          │   │
│  │  ✓ ACS tracking      │  │                              │   │
│  │  ✓ Unlimited sessions│  │                              │   │
│  │  ✓ 7-day free trial  │  │    ✓ 7-day free trial       │   │
│  │                      │  │                              │   │
│  │  [Start Free Trial]  │  │    [Start Free Trial]        │   │
│  └─────────────────────┘  └─────────────────────────────┘   │
│                                                              │
│  ── FAQ ──                                                   │
│  Q: Which ratings are included?                              │
│  A: All of them — PPL, CPL, and IR.                         │
│  ...                                                         │
└──────────────────────────────────────────────────────────────┘
```

### 7.6 Dunning & Failed Payments

| Event | Timing | Action |
|-------|--------|--------|
| First payment failure | Day 0 | Stripe auto-retries; set `subscription_status = 'past_due'` |
| Second retry | Day 3 | Stripe retries; send email warning via Resend |
| Third retry | Day 7 | Stripe retries; show in-app banner |
| All retries exhausted | Day 10 | Stripe cancels subscription; webhook fires; downgrade to `ground_school` |
| Grace period | Day 0-3 | User keeps `dpe_live` tier during grace |
| After grace | Day 4+ | Downgrade to `ground_school`; show "Your subscription has lapsed" |

### 7.7 Plan Change Semantics

| Change | Behavior |
|--------|----------|
| Monthly → Annual | Prorated credit for remaining monthly, immediate switch, new annual billing cycle |
| Annual → Monthly | Takes effect at end of current annual period |
| Cancel | `cancel_at_period_end = true`; access continues until period end |
| Resubscribe after cancel | New subscription; new trial only if never trialed before |

---

## 8. Consolidated New Environment Variables

| Variable | Purpose | Where Stored |
|----------|---------|--------------|
| `STRIPE_SECRET_KEY` | Stripe API key | Vercel env vars (all targets) |
| `STRIPE_WEBHOOK_SECRET` | Webhook signature verification | Vercel env vars (all targets) |
| `STRIPE_PRICE_MONTHLY` | Monthly price ID | Vercel env vars |
| `STRIPE_PRICE_ANNUAL` | Annual price ID | Vercel env vars |
| `NEXT_PUBLIC_SITE_URL` | Base URL for redirects | Vercel env vars (`https://heydpe.com`) |
| `GOOGLE_OAUTH_CLIENT_ID` | (Configured in Supabase Dashboard) | Supabase Auth settings |
| `GOOGLE_OAUTH_CLIENT_SECRET` | (Configured in Supabase Dashboard) | Supabase Auth settings |
| `APPLE_OAUTH_*` | (Configured in Supabase Dashboard) | Supabase Auth settings |
| `MICROSOFT_OAUTH_*` | (Configured in Supabase Dashboard) | Supabase Auth settings |

---

## 9. Consolidated Database Migration

All schema changes consolidated into a single migration file: `20260216100001_pre_commercialization.sql`

**Pre-existing table dependencies (from earlier migrations — MUST exist before applying):**
- `admin_users` — created in `20260214000001_initial_schema.sql` (columns: `user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE`, `created_at TIMESTAMPTZ`). RLS policies reference it via `EXISTS (SELECT 1 FROM admin_users WHERE user_id = auth.uid())`.
- `user_profiles` — created in `20260214000008_voice_tiers.sql`. This migration adds columns to it. RLS policy allows users to SELECT their own profile (`user_id = auth.uid()`).
- `usage_logs` — created in `20260214000008_voice_tiers.sql`. Referenced by admin dashboard queries.
- `exam_sessions` — created in `20260214000001_initial_schema.sql`. Has CHECK constraint `status IN ('active', 'paused', 'completed')` — this migration expands it to also allow `'abandoned'` and `'errored'`.

**Tables created (8):**
1. `system_config`
2. `admin_devices`
3. `admin_audit_log`
4. `prompt_versions`
5. `moderation_queue`
6. `admin_notes`
7. `active_sessions`
8. `subscription_events`

**Tables modified (2):**
1. `session_transcripts` — add `prompt_version_id`
2. `user_profiles` — add account management columns (`account_status`, `status_reason`, `status_changed_at`, `status_changed_by`, `last_login_at`, `auth_method`) and Stripe billing columns (`stripe_customer_id`, `subscription_status`, `stripe_subscription_id`, `stripe_price_id`, `stripe_product_id`, `stripe_subscription_item_id`, `cancel_at_period_end`, `trial_end`, `current_period_start`, `current_period_end`, `latest_invoice_status`, `last_webhook_event_id`, `last_webhook_event_ts`, `tier`)

**Indexes created:** 12 new indexes across all new tables.

**RLS policies created:** ~20 new policies.

---

## 10. Security Architecture

### API Rate Limiting

Add rate limiting middleware for all API routes:

| Route | Limit | Window |
|-------|-------|--------|
| `/api/exam` | 20 req/min per user | Sliding window |
| `/api/tts` | 30 req/min per user | Sliding window |
| `/api/stt/token` | 4 req/min per user | Fixed window (existing) |
| `/api/stripe/webhook` | 100 req/min per IP | Sliding window |
| `/api/report` | 10 req/min per user | Sliding window |
| `/api/admin/*` | 60 req/min per admin | Sliding window |
| `/api/stripe/checkout` | 5 req/min per user | Sliding window |

**Implementation:** Use Vercel Edge Middleware with in-memory rate counting (acceptable for single-region deployment). For production scale, migrate to Upstash Redis. **See implementation plan Task 41** for the implementation steps.

### Admin Security Layers

```
Layer 1: Hidden route (obscurity, not security)
Layer 2: Supabase Auth (authenticated user)
Layer 3: admin_users table check (authorization)
Layer 4: Device binding (FUTURE — table created but not enforced in MVP)
Layer 5: Admin audit log (accountability)
Layer 6: RLS policies (database-level enforcement)
```

### Account Security

| Feature | Implementation |
|---------|---------------|
| Account ban | `user_profiles.account_status = 'banned'`; middleware rejects all requests |
| Account suspension | `user_profiles.account_status = 'suspended'`; middleware shows message |
| Account deletion | Cascade delete: sessions, transcripts, attempts, usage, citations, profile |
| Session revocation (user-initiated) | Delete other entries from `active_sessions` + call `supabase.auth.signOut({ scope: 'others' })` using user's own client to invalidate all other Supabase auth sessions. Admin-initiated ban uses `account_status = 'banned'` which is enforced by middleware on next request. |

**Middleware account status check:**

```typescript
// In updateSession() middleware
if (user) {
  const { data: profile } = await supabase
    .from('user_profiles')
    .select('account_status')
    .eq('user_id', user.id)
    .single();

  if (profile?.account_status === 'banned') {
    await supabase.auth.signOut();
    return NextResponse.redirect(new URL('/banned', request.url));
  }
  if (profile?.account_status === 'suspended') {
    return NextResponse.redirect(new URL('/suspended', request.url));
  }
}
```

---

## 11. Testing Strategy

### Unit Tests (Vitest)

| Module | Tests |
|--------|-------|
| `kill-switch.ts` | Kill switch logic, fallback chain, config loading |
| `admin-guard.ts` | Auth check, admin check, device binding |
| `prompts.ts` | Fail-closed loading, fallback behavior |
| `entitlement.ts` | Tier mapping from subscription status |
| `browser-detect.ts` | Browser capability detection |

### Integration Tests

| Test | Scope |
|------|-------|
| Stripe webhook idempotency | Send same event twice, verify single processing |
| Entitlement sync race | Simulate checkout redirect before webhook |
| Kill switch enforcement | Toggle kill switch, verify provider blocked |
| Admin auth flow | Non-admin rejected, admin allowed |
| Session enforcement | Two exams, first paused |

### E2E Tests (Manual, then Playwright)

| Flow | Steps |
|------|-------|
| New user signup (OTP) | Enter email → receive code → enter code → land on /practice |
| Google OAuth login | Click Google → authorize → land on /practice |
| Subscribe via Stripe | Click pricing → checkout → payment → verify tier upgrade |
| Admin login | Navigate /admin → Google OAuth → see dashboard |
| Cross-browser voice | Full exam on Chrome, Firefox, Safari, iOS Safari |

---

## 12. Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|-----------|
| Auth migration breaks existing sessions | High | No existing paid users; clean cutover; test thoroughly |
| Stripe webhook delivery failures | Medium | Idempotent handler + client-side status check fallback |
| Kill switch propagation delay | Low | Config fetched per-request (no cache); changes take effect on next API call |
| Prompt DB failure | High | Fail-closed to hardcoded fallback; never serve empty prompt |
| OAuth provider outage | Medium | OTP always available as fallback |
| Cartesia AudioWorklet on Safari | Medium | Auto-detect and fall back to Deepgram TTS |
| Rate limiting false positives | Low | Generous limits; admin can whitelist |

---

## Related Documents

- `docs/plans/2026-02-14-three-tier-voice-system-design.md` — Voice tier architecture
- `docs/plans/2026-02-14-three-tier-voice-implementation-plan.md` — Voice implementation
- Product Upgrades for Commercialization (Obsidian) — Full requirements
- Commercialization Topic List (Obsidian) — Phase 1 monetization requirements
- Market Analysis & Pricing Strategy (Obsidian) — Pricing decisions

---

*Created: February 16, 2026*
*Source: Product Upgrades Ch 1-3, Commercialization Topic List Phase 1*
