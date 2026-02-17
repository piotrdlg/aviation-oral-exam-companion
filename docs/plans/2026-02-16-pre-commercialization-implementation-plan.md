# Pre-Commercialization Implementation Plan — HeyDPE

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement the four pre-commercialization work streams (Admin System, Access Control, Cross-Browser, Monetization) from the TAD at `docs/plans/2026-02-16-pre-commercialization-tad.md`.

**Architecture:** Next.js 16 App Router + Supabase + Stripe. TDD where applicable. All DB changes via Supabase migrations. All API routes follow existing patterns.

**Tech Stack:** Next.js 16.1.6, TypeScript, Tailwind CSS v4, Supabase, Stripe, Vitest

---

## Parallelization Map

```
PHASE 1 (Week 1-2): Foundation — 3 parallel threads
  Thread A: Database migrations + core utilities (Tasks 1-5)
  Thread B: Stripe account & webhook skeleton (Tasks 6-9)
  Thread C: OAuth provider configuration (Task 10)

PHASE 2 (Week 3-4): Core features — 3 parallel threads
  Thread A: Admin API + frontend (Tasks 11-17)
  Thread B: Auth migration UI (Tasks 18-21)
  Thread C: Stripe entitlement + billing flows (Tasks 22-25)

PHASE 3 (Week 5-6): Completion — 3 parallel threads
  Thread A: Support & moderation (Tasks 26-28)
  Thread B: Session enforcement + Active Sessions (Tasks 29-32)
  Thread C: Pricing page + upgrade UX (Tasks 33-36)

PHASE 4 (Week 7): Integration & verification
  Sequential: Cross-browser testing + integration testing (Tasks 37-39)
  Parallel: Admin login page (Task 40) + Rate limiting (Task 41)
```

---

## PHASE 1: Foundation (Week 1-2)

### Task 1: Database Migration — Admin Tables

**Files:**
- Create: `supabase/migrations/20260216100001_pre_commercialization.sql`
- Modify: `src/types/database.ts`

**Step 1: Write the migration SQL**

**Pre-existing dependencies (from earlier migrations — MUST exist before applying):**
- `admin_users` — created in `20260214000001_initial_schema.sql` (`user_id UUID PRIMARY KEY`, `created_at`). Referenced in RLS policies.
- `user_profiles` — created in `20260214000008_voice_tiers.sql`. This migration adds columns to it. Has RLS policy allowing users to SELECT own profile.
- `usage_logs` — created in `20260214000008_voice_tiers.sql`. Referenced by admin dashboard queries.
- `exam_sessions` — created in `20260214000001_initial_schema.sql`. This migration expands its status CHECK constraint.

```sql
-- supabase/migrations/20260216100001_pre_commercialization.sql

-- ============================================================
-- 1. system_config — runtime configuration store
-- ============================================================
CREATE TABLE system_config (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  description TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by UUID REFERENCES auth.users(id)
);

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

ALTER TABLE system_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admin read config" ON system_config FOR SELECT
  USING (EXISTS (SELECT 1 FROM admin_users WHERE user_id = auth.uid()));
CREATE POLICY "Admin update config" ON system_config FOR UPDATE
  USING (EXISTS (SELECT 1 FROM admin_users WHERE user_id = auth.uid()));
-- Note: No INSERT policy — config keys are seeded in migration only.
-- Admin UI can UPDATE existing keys but not add new ones (use service role for that).

-- ============================================================
-- 2. admin_devices — trusted device registry
-- ============================================================
CREATE TABLE admin_devices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  device_fingerprint TEXT NOT NULL,
  device_label TEXT,
  last_used_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, device_fingerprint)
);

ALTER TABLE admin_devices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admin manage devices" ON admin_devices FOR ALL
  USING (EXISTS (SELECT 1 FROM admin_users WHERE user_id = auth.uid()));

-- ============================================================
-- 3. admin_audit_log — immutable audit trail
-- ============================================================
CREATE TABLE admin_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_user_id UUID NOT NULL REFERENCES auth.users(id),
  action TEXT NOT NULL,
  target_type TEXT,
  target_id TEXT,
  details JSONB NOT NULL DEFAULT '{}',
  ip_address INET,
  device_fingerprint TEXT,
  reason TEXT,
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

-- ============================================================
-- 4. prompt_versions — versioned system prompts
-- ============================================================
CREATE TABLE prompt_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prompt_key TEXT NOT NULL,
  rating TEXT,
  study_mode TEXT,
  version INT NOT NULL,
  content TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  change_summary TEXT,
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

-- ============================================================
-- 5. moderation_queue — user reports and safety incidents
-- ============================================================
CREATE TABLE moderation_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_type TEXT NOT NULL CHECK (report_type IN ('inaccurate_answer', 'safety_incident', 'bug_report', 'content_error')),
  reporter_user_id UUID REFERENCES auth.users(id),
  session_id UUID REFERENCES exam_sessions(id),
  transcript_id UUID REFERENCES session_transcripts(id),
  prompt_version_id UUID REFERENCES prompt_versions(id),
  details JSONB NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'reviewing', 'resolved', 'dismissed')),
  resolution_notes TEXT,
  resolved_by UUID REFERENCES auth.users(id),
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_moderation_status ON moderation_queue(status, created_at DESC);
CREATE INDEX idx_moderation_reporter ON moderation_queue(reporter_user_id);

ALTER TABLE moderation_queue ENABLE ROW LEVEL SECURITY;
CREATE POLICY "User submit report" ON moderation_queue FOR INSERT
  WITH CHECK (
    reporter_user_id = auth.uid()
    AND (session_id IS NULL OR EXISTS (
      SELECT 1 FROM exam_sessions WHERE id = session_id AND user_id = auth.uid()
    ))
  );
CREATE POLICY "Admin manage moderation" ON moderation_queue FOR ALL
  USING (EXISTS (SELECT 1 FROM admin_users WHERE user_id = auth.uid()));

-- ============================================================
-- 6. admin_notes — internal notes on users
-- ============================================================
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

-- ============================================================
-- 7. active_sessions — login session tracking
-- ============================================================
CREATE TABLE active_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  session_token_hash TEXT NOT NULL, -- SHA-256 of JWT session_id claim (stable per login session)
  device_info JSONB NOT NULL DEFAULT '{}',
  device_label TEXT,
  ip_address INET,
  approximate_location TEXT,
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

-- ============================================================
-- 8. subscription_events — idempotent Stripe event log
-- ============================================================
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

-- ============================================================
-- 9. Schema modifications to existing tables
-- ============================================================

-- Track which prompt version generated each transcript
ALTER TABLE session_transcripts
  ADD COLUMN IF NOT EXISTS prompt_version_id UUID REFERENCES prompt_versions(id);

-- Expand exam_sessions status CHECK to allow new statuses
ALTER TABLE exam_sessions DROP CONSTRAINT IF EXISTS exam_sessions_status_check;
ALTER TABLE exam_sessions ADD CONSTRAINT exam_sessions_status_check
  CHECK (status IN ('active', 'paused', 'completed', 'abandoned', 'errored'));

-- Account status management
ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS account_status TEXT NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS status_reason TEXT,
  ADD COLUMN IF NOT EXISTS status_changed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS status_changed_by UUID REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS auth_method TEXT;

-- Stripe billing columns
ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT,
  ADD COLUMN IF NOT EXISTS subscription_status TEXT DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS stripe_subscription_id TEXT,
  ADD COLUMN IF NOT EXISTS stripe_price_id TEXT,
  ADD COLUMN IF NOT EXISTS stripe_product_id TEXT,
  ADD COLUMN IF NOT EXISTS stripe_subscription_item_id TEXT,
  ADD COLUMN IF NOT EXISTS cancel_at_period_end BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS trial_end TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS current_period_start TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS current_period_end TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS latest_invoice_status TEXT,
  ADD COLUMN IF NOT EXISTS last_webhook_event_id TEXT,
  ADD COLUMN IF NOT EXISTS last_webhook_event_ts TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS tier TEXT NOT NULL DEFAULT 'ground_school';

CREATE INDEX IF NOT EXISTS idx_user_profiles_stripe_customer
  ON user_profiles(stripe_customer_id)
  WHERE stripe_customer_id IS NOT NULL;
```

**Step 2: Apply the migration**

Run: `npx supabase db push` or apply via Supabase Dashboard SQL editor.

Expected: All tables created, indexes built, RLS policies active.

**Step 3: Commit**

```bash
git add supabase/migrations/20260216100001_pre_commercialization.sql
git commit -m "feat: add pre-commercialization database schema (admin, auth, billing)"
```

---

### Task 2: TypeScript Types for New Tables

**Files:**
- Modify: `src/types/database.ts`

**Step 1: Add types for all new tables**

Add the following types to `src/types/database.ts`:

```typescript
// System config
export interface SystemConfig {
  key: string;
  value: Record<string, unknown>;
  description: string | null;
  updated_at: string;
  updated_by: string | null;
}

export interface KillSwitchValue {
  enabled: boolean;
}

export interface MaintenanceModeValue {
  enabled: boolean;
  message: string;
}

export interface UserHardCapsValue {
  daily_llm_tokens: number;
  daily_tts_chars: number;
  daily_stt_seconds: number;
}

// Admin
export interface AdminDevice {
  id: string;
  user_id: string;
  device_fingerprint: string;
  device_label: string | null;
  last_used_at: string;
  created_at: string;
}

export interface AdminAuditLog {
  id: string;
  admin_user_id: string;
  action: string;
  target_type: string | null;
  target_id: string | null;
  details: Record<string, unknown>;
  ip_address: string | null;
  device_fingerprint: string | null;
  reason: string | null;
  created_at: string;
}

export interface AdminNote {
  id: string;
  target_user_id: string;
  admin_user_id: string;
  note: string;
  created_at: string;
}

// Prompts
export type PromptStatus = 'draft' | 'published' | 'archived';

export interface PromptVersion {
  id: string;
  prompt_key: string;
  rating: string | null;
  study_mode: string | null;
  version: number;
  content: string;
  status: PromptStatus;
  change_summary: string | null;
  published_at: string | null;
  published_by: string | null;
  created_at: string;
  created_by: string | null;
}

// Moderation
export type ModerationStatus = 'open' | 'reviewing' | 'resolved' | 'dismissed';
export type ReportType = 'inaccurate_answer' | 'safety_incident' | 'bug_report' | 'content_error';

export interface ModerationQueueItem {
  id: string;
  report_type: ReportType;
  reporter_user_id: string | null;
  session_id: string | null;
  transcript_id: string | null;
  prompt_version_id: string | null;
  details: Record<string, unknown>;
  status: ModerationStatus;
  resolution_notes: string | null;
  resolved_by: string | null;
  resolved_at: string | null;
  created_at: string;
}

// Sessions
export interface ActiveSession {
  id: string;
  user_id: string;
  session_token_hash: string;
  device_info: Record<string, unknown>;
  device_label: string | null;
  ip_address: string | null;
  approximate_location: string | null;
  is_exam_active: boolean;
  exam_session_id: string | null;
  last_activity_at: string;
  created_at: string;
}

// Billing
export interface SubscriptionEvent {
  id: string;
  stripe_event_id: string;
  event_type: string;
  status: 'processing' | 'processed' | 'failed';
  error: string | null;
  created_at: string;
  payload: Record<string, unknown>;
}

// Extend UserProfile with new fields
export type AccountStatus = 'active' | 'suspended' | 'banned';
export type AuthMethod = 'email_otp' | 'google' | 'apple' | 'microsoft' | 'password';
```

Also update the existing `ExamSession` interface to add `'abandoned' | 'errored'` to status union, and update `UserProfile` to include the new fields.

**Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`

Expected: No errors.

**Step 3: Commit**

```bash
git add src/types/database.ts
git commit -m "feat: add TypeScript types for pre-commercialization tables"
```

---

### Task 3: Kill Switch Utility

**Files:**
- Create: `src/lib/kill-switch.ts`
- Test: `src/lib/__tests__/kill-switch.test.ts`

**Step 1: Write the failing tests**

```typescript
// src/lib/__tests__/kill-switch.test.ts
import { describe, it, expect } from 'vitest';
import { checkKillSwitch, type SystemConfigMap } from '../kill-switch';

const DEFAULT_CONFIG: SystemConfigMap = {
  'kill_switch.anthropic': { enabled: false },
  'kill_switch.openai': { enabled: false },
  'kill_switch.deepgram': { enabled: false },
  'kill_switch.cartesia': { enabled: false },
  'kill_switch.tier.ground_school': { enabled: false },
  'kill_switch.tier.checkride_prep': { enabled: false },
  'kill_switch.tier.dpe_live': { enabled: false },
  'maintenance_mode': { enabled: false, message: '' },
};

describe('checkKillSwitch', () => {
  it('allows request when no kill switches active', () => {
    const result = checkKillSwitch(DEFAULT_CONFIG, 'anthropic', 'dpe_live');
    expect(result.blocked).toBe(false);
  });

  it('blocks request when provider kill switch is active', () => {
    const config = { ...DEFAULT_CONFIG, 'kill_switch.anthropic': { enabled: true } };
    const result = checkKillSwitch(config, 'anthropic', 'dpe_live');
    expect(result.blocked).toBe(true);
    expect(result.reason).toContain('anthropic');
  });

  it('blocks request when tier kill switch is active', () => {
    const config = { ...DEFAULT_CONFIG, 'kill_switch.tier.dpe_live': { enabled: true } };
    const result = checkKillSwitch(config, 'cartesia', 'dpe_live');
    expect(result.blocked).toBe(true);
  });

  it('degrades dpe_live to checkride_prep when dpe_live killed but checkride_prep alive', () => {
    const config = { ...DEFAULT_CONFIG, 'kill_switch.tier.dpe_live': { enabled: true } };
    const result = checkKillSwitch(config, 'deepgram', 'dpe_live');
    expect(result.blocked).toBe(false);
    expect(result.fallbackTier).toBe('checkride_prep');
  });

  it('blocks when both dpe_live and checkride_prep killed', () => {
    const config = {
      ...DEFAULT_CONFIG,
      'kill_switch.tier.dpe_live': { enabled: true },
      'kill_switch.tier.checkride_prep': { enabled: true },
    };
    const result = checkKillSwitch(config, 'deepgram', 'dpe_live');
    expect(result.blocked).toBe(true);
  });

  it('blocks all requests during maintenance mode', () => {
    const config = {
      ...DEFAULT_CONFIG,
      'maintenance_mode': { enabled: true, message: 'Upgrading systems' },
    };
    const result = checkKillSwitch(config, 'anthropic', 'dpe_live');
    expect(result.blocked).toBe(true);
    expect(result.reason).toContain('Upgrading systems');
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npm test -- --run src/lib/__tests__/kill-switch.test.ts`

Expected: FAIL (module not found).

**Step 3: Write the implementation**

```typescript
// src/lib/kill-switch.ts
import type { VoiceTier } from '@/lib/voice/types';

export type SystemConfigMap = Record<string, Record<string, unknown>>;

export interface KillSwitchResult {
  blocked: boolean;
  reason?: string;
  fallbackTier?: VoiceTier;
}

/**
 * Check kill switches against loaded system config.
 * Pure function — no DB calls. Config fetching is handled separately.
 */
export function checkKillSwitch(
  config: SystemConfigMap,
  provider: string,
  tier: VoiceTier
): KillSwitchResult {
  // Check maintenance mode first
  const maintenance = config['maintenance_mode'] as { enabled: boolean; message: string } | undefined;
  if (maintenance?.enabled) {
    return {
      blocked: true,
      reason: maintenance.message || 'Maintenance in progress',
    };
  }

  // Check provider kill switch
  const providerSwitch = config[`kill_switch.${provider}`] as { enabled: boolean } | undefined;
  if (providerSwitch?.enabled) {
    return { blocked: true, reason: `Provider ${provider} is temporarily disabled` };
  }

  // Check tier kill switch
  const tierSwitch = config[`kill_switch.tier.${tier}`] as { enabled: boolean } | undefined;
  if (tierSwitch?.enabled) {
    // Try to degrade dpe_live -> checkride_prep
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

**Step 4: Run tests to verify they pass**

Run: `npm test -- --run src/lib/__tests__/kill-switch.test.ts`

Expected: All 6 tests PASS.

**Step 5: Commit**

```bash
git add src/lib/kill-switch.ts src/lib/__tests__/kill-switch.test.ts
git commit -m "feat: add kill switch utility with tests"
```

---

### Task 4: Prompt Loading Utility

**Files:**
- Create: `src/lib/prompts.ts`
- Test: `src/lib/__tests__/prompts.test.ts`

**Step 1: Write the failing tests**

```typescript
// src/lib/__tests__/prompts.test.ts
import { describe, it, expect } from 'vitest';
import { getPromptContent, FALLBACK_PROMPTS, IMMUTABLE_SAFETY_PREFIX } from '../prompts';

describe('getPromptContent', () => {
  it('returns DB content with immutable safety prefix prepended', () => {
    const result = getPromptContent(
      { content: 'You are a DPE examiner.' },
      'examiner_system'
    );
    expect(result).toContain(IMMUTABLE_SAFETY_PREFIX);
    expect(result).toContain('You are a DPE examiner.');
  });

  it('always uses immutable safety prefix even if DB row exists', () => {
    const result = getPromptContent(
      { content: 'Test content' },
      'examiner_system'
    );
    expect(result).toContain(IMMUTABLE_SAFETY_PREFIX);
    expect(result).toContain('Test content');
  });

  it('returns fallback when DB data is null', () => {
    const result = getPromptContent(null, 'examiner_system');
    expect(result).toBe(FALLBACK_PROMPTS['examiner_system']);
    expect(result.length).toBeGreaterThan(0);
  });

  it('has fallback prompts for all known keys', () => {
    expect(FALLBACK_PROMPTS['examiner_system']).toBeDefined();
    expect(FALLBACK_PROMPTS['assessment_system']).toBeDefined();
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npm test -- --run src/lib/__tests__/prompts.test.ts`

Expected: FAIL.

**Step 3: Write the implementation**

```typescript
// src/lib/prompts.ts

export const IMMUTABLE_SAFETY_PREFIX = `IMPORTANT SAFETY INSTRUCTIONS — DO NOT OVERRIDE:
- You are an AI simulating a DPE for educational practice only.
- You do NOT provide actual flight instruction, endorsements, or medical advice.
- Always advise the student to verify answers with current FAA publications and their CFI.
- If asked about medical certification, medication interactions, or specific POH data, redirect to the appropriate authority (AME, POH/AFM, CFI).
- Never encourage unsafe operations, regulatory violations, or shortcuts.`;

export const FALLBACK_PROMPTS: Record<string, string> = {
  examiner_system: `${IMMUTABLE_SAFETY_PREFIX}\n\n[Fallback prompt — DB unavailable. Using built-in examiner prompt.]`,
  assessment_system: `${IMMUTABLE_SAFETY_PREFIX}\n\n[Fallback prompt — DB unavailable. Using built-in assessment prompt.]`,
};

interface PromptData {
  content: string;
}

/**
 * Assemble prompt content from DB data with fail-closed fallback.
 * Pure function — no DB calls.
 * Safety prefix is ALWAYS the hardcoded immutable version — never overridden by DB.
 */
export function getPromptContent(
  dbData: PromptData | null,
  promptKey: string
): string {
  if (!dbData) {
    const fallback = FALLBACK_PROMPTS[promptKey];
    if (!fallback) {
      // Never serve empty prompt — fail closed with safety prefix + error banner
      return `${IMMUTABLE_SAFETY_PREFIX}\n\n[SYSTEM ERROR: No prompt found for key "${promptKey}". Respond with a safe, neutral greeting and ask the student what topic they would like to discuss.]`;
    }
    return fallback;
  }

  return `${IMMUTABLE_SAFETY_PREFIX}\n\n${dbData.content}`;
}
```

**Step 4: Run tests**

Run: `npm test -- --run src/lib/__tests__/prompts.test.ts`

Expected: All 4 tests PASS.

**Step 5: Commit**

```bash
git add src/lib/prompts.ts src/lib/__tests__/prompts.test.ts
git commit -m "feat: add prompt loading utility with fail-closed fallback"
```

---

### Task 5: Admin Auth Guard

**Files:**
- Create: `src/lib/admin-guard.ts`

**Step 1: Write the admin guard utility**

```typescript
// src/lib/admin-guard.ts
import 'server-only'; // Prevents accidental client-side import
import { NextRequest, NextResponse } from 'next/server';
import type { User } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';

const serviceSupabase = createServiceClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export class AdminAuthError extends Error {
  constructor(message: string, public statusCode: number) {
    super(message);
    this.name = 'AdminAuthError';
  }
}

// For route handlers (have NextRequest):
export async function requireAdmin(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    throw new AdminAuthError('Not authenticated', 401);
  }

  const { data: adminRow } = await serviceSupabase
    .from('admin_users')
    .select('user_id')
    .eq('user_id', user.id)
    .maybeSingle(); // Returns null (not error) when user is not admin

  if (!adminRow) {
    throw new AdminAuthError('Not authorized as admin', 403);
  }

  return { user, supabase, serviceSupabase };
}

// For server components (no NextRequest — e.g., admin layout):
export async function checkAdminAccess(): Promise<{ user: User } | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: adminRow } = await serviceSupabase
    .from('admin_users')
    .select('user_id')
    .eq('user_id', user.id)
    .maybeSingle(); // Returns null (not error) when no rows found

  if (!adminRow) return null;
  return { user };
}

export async function logAdminAction(
  adminUserId: string,
  action: string,
  targetType: string | null,
  targetId: string | null,
  details: Record<string, unknown>,
  reason: string | null,
  request: NextRequest
) {
  await serviceSupabase.from('admin_audit_log').insert({
    admin_user_id: adminUserId,
    action,
    target_type: targetType,
    target_id: targetId,
    details,
    ip_address: request.headers.get('x-forwarded-for')?.split(',')[0] ?? null,
    device_fingerprint: request.headers.get('x-device-fingerprint') ?? null,
    reason,
  });
}

export function handleAdminError(error: unknown): NextResponse {
  if (error instanceof AdminAuthError) {
    return NextResponse.json(
      { error: error.message },
      { status: error.statusCode }
    );
  }
  console.error('Admin route error:', error);
  return NextResponse.json({ error: 'Internal error' }, { status: 500 });
}
```

**Step 2: Commit**

```bash
git add src/lib/admin-guard.ts
git commit -m "feat: add admin auth guard and audit logging utility"
```

---

### Task 6: Stripe SDK Setup

**Files:**
- Create: `src/lib/stripe.ts`

**Step 1: Install Stripe SDK**

Run: `npm install stripe`

**Step 2: Create Stripe client**

```typescript
// src/lib/stripe.ts
import Stripe from 'stripe';

if (!process.env.STRIPE_SECRET_KEY) {
  throw new Error('STRIPE_SECRET_KEY is not set');
}

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  // Use your Stripe account's default API version.
  // To pin: set STRIPE_API_VERSION env var to a valid date from https://docs.stripe.com/upgrades
  ...(process.env.STRIPE_API_VERSION ? { apiVersion: process.env.STRIPE_API_VERSION as Stripe.LatestApiVersion } : {}),
  typescript: true,
});

export const STRIPE_PRICES = {
  monthly: process.env.STRIPE_PRICE_MONTHLY!,
  annual: process.env.STRIPE_PRICE_ANNUAL!,
};
```

**Step 3: Commit**

```bash
git add src/lib/stripe.ts package.json package-lock.json
git commit -m "feat: add Stripe SDK client"
```

---

### Task 7: Stripe Webhook Handler

**Files:**
- Create: `src/app/api/stripe/webhook/route.ts`

**Step 1: Write the webhook handler**

```typescript
// src/app/api/stripe/webhook/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { stripe } from '@/lib/stripe';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import type Stripe from 'stripe';

const serviceSupabase = createServiceClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(request: NextRequest) {
  const body = await request.text();
  const sig = request.headers.get('stripe-signature');

  if (!sig) {
    return NextResponse.json({ error: 'Missing signature' }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(
      body, sig, process.env.STRIPE_WEBHOOK_SECRET!
    );
  } catch (err) {
    console.error('Webhook signature verification failed:', err);
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  // Idempotency: try INSERT; on conflict check if already processed
  // Uses UNIQUE constraint on stripe_event_id; concurrent calls safely fail
  const { data: claimed, error: claimError } = await serviceSupabase
    .from('subscription_events')
    .insert({
      stripe_event_id: event.id,
      event_type: event.type,
      status: 'processing',
      payload: event.data.object as Record<string, unknown>,
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

  try {
    // First attempt or retry of a failed/incomplete attempt
    switch (event.type) {
      case 'checkout.session.completed':
        await handleCheckoutCompleted(event.data.object as Stripe.Checkout.Session, event.id);
        break;
      case 'customer.subscription.updated':
        await handleSubscriptionUpdated(event.data.object as Stripe.Subscription, event.id);
        break;
      case 'customer.subscription.deleted':
        await handleSubscriptionDeleted(event.data.object as Stripe.Subscription, event.id);
        break;
      case 'invoice.payment_failed':
        await handlePaymentFailed(event.data.object as Stripe.Invoice, event.id);
        break;
    }

    // Mark event as successfully processed
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

async function handleCheckoutCompleted(session: Stripe.Checkout.Session, eventId: string) {
  if (session.mode !== 'subscription') return;

  const subscription = await stripe.subscriptions.retrieve(session.subscription as string);
  const customerId = session.customer as string;

  // Find user by client_reference_id first (most reliable), fallback to stripe_customer_id
  let userId: string | null = session.client_reference_id ?? null;

  if (!userId) {
    // Fallback: lookup by Stripe customer ID
    const { data: profile } = await serviceSupabase
      .from('user_profiles')
      .select('user_id')
      .eq('stripe_customer_id', customerId)
      .single();
    userId = profile?.user_id ?? null;
  }

  if (!userId) {
    // Throw so the event stays in 'failed' status and Stripe retries
    // (user mapping may succeed after auth flow completes)
    throw new Error(`No user found for Stripe customer: ${customerId}`);
  }

  const profile = { user_id: userId };

  await serviceSupabase
    .from('user_profiles')
    .update({
      tier: 'dpe_live',
      subscription_status: subscription.status,
      stripe_subscription_id: subscription.id,
      stripe_price_id: subscription.items.data[0]?.price.id,
      stripe_product_id: subscription.items.data[0]?.price.product as string,
      stripe_subscription_item_id: subscription.items.data[0]?.id,
      cancel_at_period_end: subscription.cancel_at_period_end,
      trial_end: subscription.trial_end
        ? new Date(subscription.trial_end * 1000).toISOString()
        : null,
      current_period_start: new Date(subscription.current_period_start * 1000).toISOString(),
      current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
      last_webhook_event_id: eventId,
      last_webhook_event_ts: new Date().toISOString(),
    })
    .eq('user_id', profile.user_id);
}

async function handleSubscriptionUpdated(subscription: Stripe.Subscription, eventId: string) {
  const customerId = subscription.customer as string;

  const tier = subscription.status === 'active' || subscription.status === 'trialing'
    ? 'dpe_live'
    : 'ground_school';

  await serviceSupabase
    .from('user_profiles')
    .update({
      tier,
      subscription_status: subscription.status,
      cancel_at_period_end: subscription.cancel_at_period_end,
      stripe_price_id: subscription.items.data[0]?.price.id,
      current_period_start: new Date(subscription.current_period_start * 1000).toISOString(),
      current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
      last_webhook_event_id: eventId,
      last_webhook_event_ts: new Date().toISOString(),
    })
    .eq('stripe_customer_id', customerId);
}

async function handleSubscriptionDeleted(subscription: Stripe.Subscription, eventId: string) {
  const customerId = subscription.customer as string;

  await serviceSupabase
    .from('user_profiles')
    .update({
      tier: 'ground_school',
      subscription_status: 'canceled',
      cancel_at_period_end: false,
      stripe_subscription_id: null,
      stripe_price_id: null,
      stripe_product_id: null,
      stripe_subscription_item_id: null,
      last_webhook_event_id: eventId,
      last_webhook_event_ts: new Date().toISOString(),
    })
    .eq('stripe_customer_id', customerId);
}

async function handlePaymentFailed(invoice: Stripe.Invoice, eventId: string) {
  const customerId = invoice.customer as string;

  await serviceSupabase
    .from('user_profiles')
    .update({
      subscription_status: 'past_due',
      latest_invoice_status: 'failed',
      last_webhook_event_id: eventId,
      last_webhook_event_ts: new Date().toISOString(),
    })
    .eq('stripe_customer_id', customerId);
}
```

**Step 2: Commit**

```bash
git add src/app/api/stripe/webhook/route.ts
git commit -m "feat: add Stripe webhook handler with idempotency"
```

---

### Task 8: Stripe Checkout & Portal Routes

**Files:**
- Create: `src/app/api/stripe/checkout/route.ts`
- Create: `src/app/api/stripe/portal/route.ts`
- Create: `src/app/api/stripe/status/route.ts`

**Step 1: Write checkout route**

```typescript
// src/app/api/stripe/checkout/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { stripe, STRIPE_PRICES } from '@/lib/stripe';
import { createClient as createServiceClient } from '@supabase/supabase-js';

const serviceSupabase = createServiceClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { plan } = await request.json(); // 'monthly' | 'annual'
  const priceId = plan === 'annual' ? STRIPE_PRICES.annual : STRIPE_PRICES.monthly;

  if (!priceId) {
    return NextResponse.json({ error: 'Invalid plan' }, { status: 400 });
  }

  // Get or create Stripe customer
  const { data: profile } = await serviceSupabase
    .from('user_profiles')
    .select('stripe_customer_id')
    .eq('user_id', user.id)
    .single();

  let customerId = profile?.stripe_customer_id;

  if (!customerId) {
    const customer = await stripe.customers.create({
      email: user.email,
      metadata: { supabase_user_id: user.id },
    });
    customerId = customer.id;

    await serviceSupabase
      .from('user_profiles')
      .update({ stripe_customer_id: customerId })
      .eq('user_id', user.id);
  }

  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://heydpe.com';

  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    client_reference_id: user.id, // Links checkout to Supabase user for reliable webhook mapping
    metadata: { supabase_user_id: user.id }, // Searchable in Stripe Dashboard
    mode: 'subscription',
    line_items: [{ price: priceId, quantity: 1 }],
    subscription_data: {
      trial_period_days: 7,
      metadata: { supabase_user_id: user.id }, // Propagated to subscription object
    },
    success_url: `${baseUrl}/practice?checkout=success`,
    cancel_url: `${baseUrl}/pricing?checkout=canceled`,
    tax_id_collection: { enabled: true },
    automatic_tax: { enabled: true },
  });

  return NextResponse.json({ url: session.url });
}
```

**Step 2: Write portal route**

```typescript
// src/app/api/stripe/portal/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { stripe } from '@/lib/stripe';
import { createClient as createServiceClient } from '@supabase/supabase-js';

const serviceSupabase = createServiceClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data: profile } = await serviceSupabase
    .from('user_profiles')
    .select('stripe_customer_id')
    .eq('user_id', user.id)
    .single();

  if (!profile?.stripe_customer_id) {
    return NextResponse.json({ error: 'No subscription found' }, { status: 400 });
  }

  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://heydpe.com';

  const session = await stripe.billingPortal.sessions.create({
    customer: profile.stripe_customer_id,
    return_url: `${baseUrl}/settings`,
  });

  return NextResponse.json({ url: session.url });
}
```

**Step 3: Write status route (handles "paid but still free" race)**

```typescript
// src/app/api/stripe/status/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { stripe } from '@/lib/stripe';
import { createClient as createServiceClient } from '@supabase/supabase-js';

const serviceSupabase = createServiceClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data: profile } = await serviceSupabase
    .from('user_profiles')
    .select('tier, subscription_status, stripe_customer_id')
    .eq('user_id', user.id)
    .single();

  // If webhook already processed, return current state
  if (profile?.subscription_status === 'active' || profile?.subscription_status === 'trialing') {
    return NextResponse.json({ tier: profile.tier, status: profile.subscription_status });
  }

  // Webhook may not have fired yet — check Stripe directly
  if (profile?.stripe_customer_id) {
    const subscriptions = await stripe.subscriptions.list({
      customer: profile.stripe_customer_id,
      status: 'all',
      limit: 1,
    });

    if (subscriptions.data.length > 0) {
      const sub = subscriptions.data[0];
      if (sub.status === 'active' || sub.status === 'trialing') {
        // Grant entitlement immediately
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

**Step 4: Commit**

```bash
git add src/app/api/stripe/checkout/route.ts src/app/api/stripe/portal/route.ts src/app/api/stripe/status/route.ts
git commit -m "feat: add Stripe checkout, portal, and status API routes"
```

---

### Task 9: System Config Loader

**Files:**
- Create: `src/lib/system-config.ts`

**Step 1: Write config loader (no in-memory cache — serverless-safe)**

**Important:** In-memory caching (`let cachedConfig`) does NOT work in Vercel's serverless environment — each Lambda invocation has isolated memory. Config is fetched from DB on every request. The `system_config` table has <10 rows, so this is a negligible cost (~2ms).

```typescript
// src/lib/system-config.ts
import type { SupabaseClient } from '@supabase/supabase-js';
import type { SystemConfigMap } from './kill-switch';

/**
 * Fetch all system config from DB. Called once per API request.
 * No in-memory cache — serverless Lambda instances don't share memory.
 */
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

**Step 2: Commit**

```bash
git add src/lib/system-config.ts
git commit -m "feat: add serverless-safe system config loader"
```

---

### Task 10: OAuth Provider Configuration

**This is a manual configuration task — no code, just Supabase Dashboard settings.**

**Step 1: Configure Google OAuth**

1. Go to Google Cloud Console → Create or select project
2. APIs & Services → OAuth consent screen → Configure
3. APIs & Services → Credentials → Create OAuth 2.0 Client ID
4. Authorized redirect URI: `https://pvuiwwqsumoqjepukjhz.supabase.co/auth/v1/callback`
5. Copy Client ID and Client Secret
6. Supabase Dashboard → Auth → Providers → Google → Enable → Paste credentials

**Step 2: Configure Apple Sign In**

1. Apple Developer Console → Certificates, IDs & Profiles
2. Create App ID with Sign In with Apple capability
3. Create Service ID → Configure redirect URL
4. Generate private key for Sign In with Apple
5. Supabase Dashboard → Auth → Providers → Apple → Enable → Paste credentials

**Step 3: Configure Microsoft OAuth**

1. Azure Portal → App registrations → New registration
2. Redirect URI: `https://pvuiwwqsumoqjepukjhz.supabase.co/auth/v1/callback`
3. Certificates & secrets → New client secret
4. Copy Application (client) ID and secret
5. Supabase Dashboard → Auth → Providers → Microsoft → Enable → Paste credentials

**Step 4: Configure OTP emails**

1. Supabase Dashboard → Auth → Email Templates → Magic Link
2. Customize template with HeyDPE branding
3. Subject: "Your HeyDPE Login Code"
4. Body: Include 6-digit code, 10-minute expiry notice, HeyDPE branding

---

## PHASE 2: Core Features (Week 3-4)

### Task 11: Admin Dashboard API

**Files:**
- Create: `src/app/api/admin/dashboard/route.ts`

**Step 1: Write the dashboard stats endpoint**

This endpoint returns user counts, session stats, cost summary, and anomaly flags. Uses `serviceSupabase` for cross-user queries.

Key queries:
- DAU/WAU/MAU from `user_profiles.last_login_at`
- Active/completed/abandoned sessions from `exam_sessions`
- Per-provider usage from `usage_logs` (7-day rolling)
- Top anomaly users (>5x average usage)

**Step 2: Commit**

```bash
git add src/app/api/admin/dashboard/route.ts
git commit -m "feat: add admin dashboard stats API"
```

---

### Task 12: Admin User Management API

**Files:**
- Create: `src/app/api/admin/users/route.ts`
- Create: `src/app/api/admin/users/[id]/route.ts`
- Create: `src/app/api/admin/users/[id]/actions/route.ts`

**Step 1: Write user list endpoint (GET /api/admin/users)**

Paginated, searchable by email, sortable by signup date, last active, tier, session count. Uses `serviceSupabase`.

**Step 2: Write user detail endpoint (GET /api/admin/users/[id])**

Returns: profile, all sessions (with status, rating, exchange count), element scores, usage summary, admin notes.

**Step 3: Write user actions endpoint (POST /api/admin/users/[id]/actions)**

Actions: `ban`, `suspend`, `activate`, `change_tier`, `delete`, `add_note`, `extend_trial`.

Each action:
1. Validates request
2. Performs action on `user_profiles` (or cascade delete)
3. Logs to `admin_audit_log` via `logAdminAction()`
4. Returns updated profile

**Step 4: Commit**

```bash
git add src/app/api/admin/users/
git commit -m "feat: add admin user management API (list, detail, actions)"
```

---

### Task 13: Admin Transcript Viewer API

**Files:**
- Create: `src/app/api/admin/sessions/[id]/transcript/route.ts`

**Step 1: Write transcript endpoint**

Returns full transcript for any session (admin only). Includes: exchange number, role, text, assessment, element attempts, citations, prompt version ID.

**Step 2: Commit**

```bash
git add src/app/api/admin/sessions/
git commit -m "feat: add admin transcript viewer API"
```

---

### Task 14: Admin Prompt Management API

**Files:**
- Create: `src/app/api/admin/prompts/route.ts`
- Create: `src/app/api/admin/prompts/[id]/publish/route.ts`
- Create: `src/app/api/admin/prompts/[id]/rollback/route.ts`

**Step 1: Write prompt CRUD**

- GET: List all versions (grouped by prompt_key)
- POST: Create new draft version (auto-increment version number)

**Step 2: Write publish endpoint**

- Archives currently published version for same key
- Sets new version status = 'published', published_at, published_by

**Step 3: Write rollback endpoint**

- Archives current published
- Finds previous published (now archived), restores to published
- Logs to audit

**Step 4: Commit**

```bash
git add src/app/api/admin/prompts/
git commit -m "feat: add admin prompt management API (CRUD, publish, rollback)"
```

---

### Task 15: Admin System Config API

**Files:**
- Create: `src/app/api/admin/config/route.ts`

**Step 1: Write config CRUD**

- GET: Returns all system_config entries
- POST: Update a specific key's value + `updated_by` + `updated_at = new Date().toISOString()` (must set explicitly — no DB trigger exists for this table). No cache to invalidate — config is fetched per-request.

**Step 2: Commit**

```bash
git add src/app/api/admin/config/route.ts
git commit -m "feat: add admin system config API (kill switches, maintenance mode)"
```

---

### Task 16: Admin Frontend — Layout & Dashboard

**Files:**
- Create: `src/app/(admin)/layout.tsx`
- Create: `src/app/(admin)/admin/page.tsx`

**Step 1: Write admin layout**

Sidebar navigation with links to: Dashboard, Users, Prompts, Config, Moderation. Top bar shows admin user email. Auth check at layout level using `checkAdminAccess()` (the server-component-friendly admin guard that doesn't require `NextRequest`). Redirect to `/admin/login` if null returned.

**Step 2: Write dashboard page**

Four stat cards: Total Users, Active Sessions, 7d Avg Exchanges, Est. Daily Cost. Below: recent sessions table, anomaly alerts.

**Step 3: Commit**

```bash
git add src/app/\(admin\)/
git commit -m "feat: add admin layout and dashboard page"
```

---

### Task 17: Admin Frontend — User Management & Config Pages

**Files:**
- Create: `src/app/(admin)/admin/users/page.tsx`
- Create: `src/app/(admin)/admin/users/[id]/page.tsx`
- Create: `src/app/(admin)/admin/prompts/page.tsx`
- Create: `src/app/(admin)/admin/config/page.tsx`
- Create: `src/app/(admin)/admin/moderation/page.tsx`

**Step 1: User list page** — Searchable table with pagination, tier badges, action buttons.

**Step 2: User detail page** — Tabs: Overview | Sessions | Scores | Usage | Notes.

**Step 3: Prompt management page** — Prompt key selector, version list with diff, code editor, publish/rollback buttons.

**Step 4: Config page** — Kill switch toggle cards (per provider + per tier), maintenance mode toggle with message input, hard cap sliders.

**Step 5: Moderation page** — Filterable queue list (open/resolved), detail drawer with transcript context.

**Step 6: Commit**

```bash
git add src/app/\(admin\)/admin/
git commit -m "feat: add admin UI pages (users, prompts, config, moderation)"
```

---

### Task 18: Auth Migration — Login Page Redesign

**Files:**
- Modify: `src/app/(auth)/login/page.tsx`
- Delete: `src/app/(auth)/signup/page.tsx` (merge into login)

**Step 1: Redesign login page**

Replace password form with:
1. OAuth buttons (Google, Apple, Microsoft) at top
2. Divider "or"
3. Email input + "Send Login Code" button
4. 6-digit OTP input (appears after code sent)
5. "Code expires in 10 minutes" message
6. Loading states for each step

**Step 2: Remove signup page**

OTP auto-creates accounts via `shouldCreateUser: true`. No separate signup needed.

**Step 3: Update middleware**

Remove `/signup` from auth routes redirect. Keep `/login` as the sole auth entry point.

**Step 4: Commit**

```bash
git add src/app/\(auth\)/login/page.tsx
git rm src/app/\(auth\)/signup/page.tsx
git add src/lib/supabase/middleware.ts
git commit -m "feat: replace password auth with OTP + OAuth login"
```

---

### Task 19: Auth Migration — Callback Route Update

**Files:**
- Modify: `src/app/auth/callback/route.ts`

**Step 1: Update callback to handle OAuth providers**

The existing callback handles email confirmation codes. Update to also handle OAuth redirects (the `code` parameter works the same way for OAuth providers).

Verify: `exchangeCodeForSession()` works for both OTP verification and OAuth callback. (It should — Supabase uses the same PKCE flow for both.)

**Step 2: Commit**

```bash
git add src/app/auth/callback/route.ts
git commit -m "feat: update auth callback for OAuth + OTP flows"
```

---

### Task 20: Auth Migration — Landing Page Update

**Files:**
- Modify: `src/app/page.tsx`

**Step 1: Update CTAs**

Replace "Sign Up" CTA with "Start Free Practice" → links to `/login`. Update any references to signup flow.

**Step 2: Commit**

```bash
git add src/app/page.tsx
git commit -m "feat: update landing page CTAs for new auth flow"
```

---

### Task 21: Auth Migration — Middleware Account Status Check

**Files:**
- Modify: `src/lib/supabase/middleware.ts`

**Step 1: Add account status check**

After getting user, check `user_profiles.account_status`. If `banned`, sign out and redirect to `/banned`. If `suspended`, redirect to `/suspended`.

**RLS note:** The existing `user_profiles` RLS policy (from `20260214000008_voice_tiers.sql`) allows users to SELECT their own profile where `user_id = auth.uid()`, so the middleware can read `account_status`. Use the server supabase client with the user's cookie-based session (not service role) for this query.

**Step 2: Create banned/suspended pages**

Create simple pages at `src/app/banned/page.tsx` and `src/app/suspended/page.tsx` with appropriate messaging.

**Step 3: Commit**

```bash
git add src/lib/supabase/middleware.ts src/app/banned/page.tsx src/app/suspended/page.tsx
git commit -m "feat: add account status enforcement in middleware"
```

---

### Task 22: Kill Switch Integration into API Routes

**Files:**
- Modify: `src/app/api/exam/route.ts`
- Modify: `src/app/api/tts/route.ts`
- Modify: `src/app/api/stt/token/route.ts`

**Step 1: Add kill switch check to exam route**

At the top of the `POST /api/exam` handler (before any Anthropic API call), check `checkKillSwitch(config, 'anthropic', tier)`. If blocked, return appropriate error.

**Step 2: Add kill switch check to TTS route**

Before creating TTS provider, check kill switch for the TTS provider (`openai`, `deepgram`, or `cartesia` depending on tier). If blocked with fallback tier, use fallback. If fully blocked, return error.

**Step 3: Add kill switch check to STT token route**

Before issuing Deepgram token, check kill switch for `deepgram`. If blocked, return error.

**Step 4: Commit**

```bash
git add src/app/api/exam/route.ts src/app/api/tts/route.ts src/app/api/stt/token/route.ts
git commit -m "feat: integrate kill switches into API routes"
```

---

### Task 23: Prompt Versioning Integration into Exam Engine

**Files:**
- Modify: `src/lib/exam-engine.ts`
- Modify: `src/lib/exam-logic.ts`

**Step 1: Seed initial prompt versions**

Create a seed migration that inserts the current hardcoded prompts as version 1, status='published'.

**Step 2: Write prompt selection function in exam-engine.ts**

Add a `loadPromptFromDB()` function that:
1. Queries `prompt_versions` for all published versions matching `prompt_key`
2. Applies deterministic specificity scoring (see TAD Section 4.2) to select the best match by `rating` and `study_mode`
3. Passes the selected content to `getPromptContent()` (which prepends the immutable safety prefix)
4. Returns both the assembled prompt string AND the `prompt_version_id` (UUID) for traceability

```typescript
async function loadPromptFromDB(
  supabase: SupabaseClient,
  promptKey: string,
  rating?: string,
  studyMode?: string
): Promise<{ content: string; versionId: string | null }> {
  const { data: candidates } = await supabase
    .from('prompt_versions')
    .select('id, content, rating, study_mode, version')
    .eq('prompt_key', promptKey)
    .eq('status', 'published')
    .order('version', { ascending: false });

  const scored = (candidates ?? [])
    .filter(c => (c.rating === rating || c.rating === null) && (c.study_mode === studyMode || c.study_mode === null))
    .map(c => ({ ...c, specificity: (c.rating === rating ? 1 : 0) + (c.study_mode === studyMode ? 1 : 0) }))
    .sort((a, b) => b.specificity - a.specificity || b.version - a.version);

  const best = scored[0] ?? null;
  return {
    content: getPromptContent(best, promptKey),
    versionId: best?.id ?? null,
  };
}
```

**Step 3: Propagate prompt_version_id to session_transcripts**

When writing to `session_transcripts`, include `prompt_version_id` from the loaded prompt. This enables tracing which prompt version generated each response.

**Step 4: Update `buildSystemPrompt()` to accept DB content**

The pure function in `exam-logic.ts` should accept the prompt content as a parameter instead of generating it. This preserves testability.

**Step 5: Commit**

```bash
git add src/lib/exam-engine.ts src/lib/exam-logic.ts supabase/migrations/
git commit -m "feat: integrate prompt versioning into exam engine"
```

---

### Task 24: Usage Logging Enhancement

**Files:**
- Modify: `src/app/api/exam/route.ts`
- Modify: `src/app/api/tts/route.ts`

**Step 1: Add LLM usage logging to exam route**

After each Claude API call (assessAnswer + generateExaminerTurn), log to `usage_logs`:
- `event_type: 'llm_request'`
- `provider: 'anthropic'`
- `quantity: input_tokens + output_tokens`
- `latency_ms`
- `status: 'ok' | 'error'`

**Step 2: Verify TTS usage logging (already partially implemented)**

The TTS route already logs usage. Verify it captures `quantity` (character count) correctly.

**Step 3: Commit**

```bash
git add src/app/api/exam/route.ts src/app/api/tts/route.ts
git commit -m "feat: enhance usage logging for LLM and TTS requests"
```

---

### Task 25: Last Login & Auth Method Tracking

**Files:**
- Modify: `src/app/auth/callback/route.ts`
- Modify: `src/app/api/exam/route.ts`

**Step 1: Track last_login_at on auth callback (NOT middleware)**

**Important:** Do NOT update `last_login_at` in middleware on every request — this adds a DB write to every page load and API call. Instead, update `last_login_at` in two targeted locations:

1. **`/auth/callback` route** — fires on every login (OTP verification or OAuth redirect)
2. **`POST /api/exam` (action: 'start')** — fires on exam start (captures active usage)

```typescript
// In /auth/callback route, after successful code exchange:
await serviceSupabase
  .from('user_profiles')
  .update({
    last_login_at: new Date().toISOString(),
    auth_method: user.app_metadata?.provider ?? 'email_otp',
  })
  .eq('user_id', user.id);
```

**Step 2: Track auth_method from provider metadata**

`user.app_metadata.provider` contains `'google'`, `'apple'`, `'microsoft'`, or `'email'` (for OTP). Map `'email'` → `'email_otp'` for clarity.

**Step 3: Commit**

```bash
git add src/app/auth/callback/route.ts src/app/api/exam/route.ts
git commit -m "feat: track last login time and auth method on login/exam events"
```

---

## PHASE 3: Completion (Week 5-6)

### Task 26: Report Inaccurate Answer — User-Facing Button

**Files:**
- Modify: `src/app/(dashboard)/practice/page.tsx`
- Create: `src/app/api/report/route.ts`

**Step 1: Add report button to each examiner message**

Small flag icon on each examiner message. On click, opens modal with:
- Pre-filled: exchange number, citations shown
- User fills: comment, error type (factual/scoring/safety)

**Step 2: Write report API route**

POST to `/api/report` → inserts into `moderation_queue` with:
- report_type
- reporter_user_id
- session_id, transcript_id
- details (user comment, error type, citations, prompt version ID)

**Step 3: Commit**

```bash
git add src/app/\(dashboard\)/practice/page.tsx src/app/api/report/route.ts
git commit -m "feat: add 'report inaccurate answer' button and API"
```

---

### Task 27: Feedback Widget

**Files:**
- Modify: `src/app/(dashboard)/settings/page.tsx`

**Step 1: Add feedback section to Settings**

Two options: "Report a Bug" and "Report Content Error". Each opens a form that submits to `/api/report` with appropriate `report_type`.

Bug reports capture: browser info (from navigator), page URL, description.

**Step 2: Commit**

```bash
git add src/app/\(dashboard\)/settings/page.tsx
git commit -m "feat: add feedback widget to Settings page"
```

---

### Task 28: Moderation Queue API + Admin Page Wiring

**Files:**
- Create: `src/app/api/admin/moderation/route.ts`
- Create: `src/app/api/admin/moderation/[id]/route.ts`
- Modify: `src/app/(admin)/admin/moderation/page.tsx` (created in Task 17)

**Step 1: Create moderation API routes**

- `GET /api/admin/moderation` — List moderation queue items with `?status=pending` filter. Admin guard required.
- `POST /api/admin/moderation/[id]` — Resolve or dismiss a moderation item. Accepts `{ status: 'resolved' | 'dismissed', admin_notes: string }`. Updates the row, sets `resolved_at` and `resolved_by`.

**Step 2: Wire moderation page to API**

Connect the admin moderation UI (from Task 17) to the API routes.

**Step 3: Commit**

```bash
git add src/app/api/admin/moderation/route.ts src/app/api/admin/moderation/\[id\]/route.ts src/app/\(admin\)/admin/moderation/page.tsx
git commit -m "feat: add moderation API routes and wire admin page"
```

---

### Task 29: Session Enforcement — Server Logic

**Files:**
- Create: `src/lib/session-enforcement.ts`
- Modify: `src/app/api/exam/route.ts`

**Step 1: Write session token hash helper**

Extract the Supabase session identifier and hash it. Place in `src/lib/session-enforcement.ts`:
```typescript
import { createHash } from 'crypto';

function decodeJwtPayload(jwt: string): Record<string, unknown> {
  const payload = jwt.split('.')[1];
  return JSON.parse(Buffer.from(payload, 'base64url').toString());
}

export function getSessionTokenHash(session: { access_token: string }): string {
  // Decode the JWT to extract the stable session_id claim.
  // session_id is assigned at login time and does NOT rotate on token refresh
  // (unlike refresh_token which may rotate if refresh token rotation is enabled).
  const jwtPayload = decodeJwtPayload(session.access_token);
  const sessionId = jwtPayload.session_id as string;
  if (!sessionId) throw new Error('JWT missing session_id claim');
  return createHash('sha256').update(sessionId).digest('hex');
}
```

**Step 2: Write enforcement utility**

`enforceOneActiveExam(serviceSupabase, userId, examSessionId, tokenHash)`:
1. Check for other active exams for this user (use `.maybeSingle()` — null means no conflict)
2. If found: pause the other exam, clear active flag
3. Set current session as active exam
4. Return `{ pausedSessionId? }`

**Step 3: Integrate into ALL exam mutation actions**

Call `enforceOneActiveExam()` in `POST /api/exam` for **all three actions** — `start`, `respond`, and `next-task` — not just `start`. This prevents a stale session on another device from continuing to submit answers after a new session has started. For `respond` and `next-task`, if the calling session is not the active one, return an error instructing the client to end the session.

**Step 4: Commit**

```bash
git add src/lib/session-enforcement.ts src/app/api/exam/route.ts
git commit -m "feat: enforce one active exam session per user"
```

---

### Task 30: Session Enforcement — Client Notification

**Files:**
- Modify: `src/app/(dashboard)/practice/page.tsx`

**Step 1: Handle paused session notification**

When exam start response includes `pausedSessionId`, show a toast/banner: "Your exam on another device has been paused. Your progress is saved."

**Step 2: Commit**

```bash
git add src/app/\(dashboard\)/practice/page.tsx
git commit -m "feat: show notification when another exam session is paused"
```

---

### Task 31: Active Sessions API

**Files:**
- Create: `src/app/api/user/sessions/route.ts`

**Step 1: Write active sessions endpoints**

- GET: List user's active sessions (device label, last active, is_exam_active, approximate location)
- DELETE: Sign out all OTHER sessions — delete all entries from `active_sessions` except the current one, then call `await supabase.auth.signOut({ scope: 'others' })` using the user's own client (not admin) to invalidate all other Supabase auth sessions. This is the MVP approach — per-session revocation is not supported because we only store `session_token_hash` (not the raw session_id needed for targeted revocation)

**Step 2: Commit**

```bash
git add src/app/api/user/sessions/route.ts
git commit -m "feat: add active sessions API for user session management"
```

---

### Task 32: Active Sessions UI in Settings

**Files:**
- Modify: `src/app/(dashboard)/settings/page.tsx`

**Step 1: Add Active Sessions section**

Show list of active sessions with device label, approximate location, last active time, exam status. "This device" badge on current session. No per-session sign-out buttons (MVP limitation — we only store session_token_hash, not revocable session IDs). Single "Sign Out All Other Sessions" button at the bottom that calls `DELETE /api/user/sessions`.

**Step 2: Commit**

```bash
git add src/app/\(dashboard\)/settings/page.tsx
git commit -m "feat: add active sessions UI to Settings page"
```

---

### Task 33: Pricing Page

**Files:**
- Create: `src/app/pricing/page.tsx`

**Step 1: Write pricing page**

Two pricing cards (Monthly $39/mo, Annual $299/yr) with feature list. "Start Free Trial" buttons link to Stripe Checkout via `/api/stripe/checkout`. FAQ section below. No auth required to view; redirect to login before checkout if not authenticated.

**Step 2: Commit**

```bash
git add src/app/pricing/page.tsx
git commit -m "feat: add pricing page with Stripe checkout integration"
```

---

### Task 34: Upgrade Prompts

**Files:**
- Modify: `src/app/(dashboard)/practice/page.tsx`

**Step 1: Add upgrade prompt on quota exceeded**

When API returns `status: 429` with `error: 'quota_exceeded'`, show modal: "You've reached your session limit. Upgrade to continue practicing." with CTA to `/pricing`.

**Step 2: Add proactive warning at 80% quota**

When fetching user tier info, if usage is >80% of limit, show subtle banner: "You've used 80% of your monthly sessions. [Upgrade]"

**Step 3: Commit**

```bash
git add src/app/\(dashboard\)/practice/page.tsx
git commit -m "feat: add upgrade prompts on quota limits"
```

---

### Task 35: Usage Dashboard in Settings

**Files:**
- Modify: `src/app/(dashboard)/settings/page.tsx`

**Step 1: Add usage section**

Show current usage vs limits:
- Sessions this month: X / Y
- TTS characters: X / Y
- Current plan: [Monthly/Annual/Free]
- Renewal date: [date]
- [Manage Subscription] button → Stripe Customer Portal
- [Upgrade] button if on free tier

**Step 2: Commit**

```bash
git add src/app/\(dashboard\)/settings/page.tsx
git commit -m "feat: add usage dashboard and subscription management to Settings"
```

---

### Task 36: Post-Checkout Entitlement Sync

**Files:**
- Modify: `src/app/(dashboard)/practice/page.tsx`

**Step 1: Handle checkout success**

When URL contains `?checkout=success`, call `/api/stripe/status` to verify entitlement. Show success banner: "Welcome to HeyDPE! Your subscription is active." Update local tier state.

**Step 2: Commit**

```bash
git add src/app/\(dashboard\)/practice/page.tsx
git commit -m "feat: handle post-checkout entitlement verification"
```

---

## PHASE 4: Integration & Verification (Week 7)

### Task 37: Browser Detection Utility

**Files:**
- Create: `src/lib/browser-detect.ts`
- Test: `src/lib/__tests__/browser-detect.test.ts`

**Step 1: Write browser detection utility**

Pure function that examines `navigator` to determine:
- `supportsAudioWorklet`
- `supportsMediaRecorder`
- `mediaRecorderMimeType` ('audio/webm;codecs=opus' or 'audio/mp4')
- `isIOSSafari`, `isIOSChrome`
- `requiresUserGestureForAudio`

**Step 2: Write tests (can only test format detection, not real navigator)**

Test the parsing logic with mock user-agent strings.

**Step 3: Commit**

```bash
git add src/lib/browser-detect.ts src/lib/__tests__/browser-detect.test.ts
git commit -m "feat: add browser capability detection utility"
```

---

### Task 38: Cross-Browser Voice Integration

**Files:**
- Modify: `src/app/(dashboard)/practice/page.tsx` (or voice hook)

**Step 1: Integrate browser detection with voice provider**

In the voice hook or practice page initialization:
1. Detect browser capabilities
2. If on Tier 3 and `!supportsAudioWorklet`: use Tier 2 TTS instead
3. If on iOS: handle user-gesture audio requirements

**Step 2: Commit**

```bash
git add src/app/\(dashboard\)/practice/page.tsx
git commit -m "feat: integrate browser detection with voice provider fallback"
```

---

### Task 39: Cross-Browser Manual Test Execution

**No code changes. Manual testing with documentation.**

**Step 1: Execute test matrix**

Test the full exam flow (start → answer 3 questions with voice → end → check progress) on:
- Desktop: Chrome, Firefox, Safari
- Mobile: iOS Safari, iOS Chrome, Android Chrome

**Step 2: Document results**

Record pass/fail for each cell in the test matrix (see TAD Section 6.4).

**Step 3: Fix any failures discovered**

Address issues found during testing.

**Step 4: Commit any fixes**

```bash
git add -A
git commit -m "fix: cross-browser compatibility fixes from test matrix"
```

---

### Task 40: Admin Login Page

**Files:**
- Create: `src/app/admin/login/page.tsx` (OUTSIDE `(admin)` route group — avoids layout auth guard)

**Step 1: Write admin login page**

Simple page with a single button: "Sign in with Google". Uses `supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: '${window.location.origin}/auth/callback?next=/admin' } })` — this ensures the OAuth flow goes through the existing `/auth/callback` route to establish app cookies, then redirects to `/admin`. This is separate from the user-facing `/login` page.

**IMPORTANT:** This page lives at `src/app/admin/login/page.tsx` (NOT inside the `(admin)` route group) to avoid a redirect loop. The `(admin)` route group layout has an admin auth guard that redirects to `/admin/login` when unauthenticated — if the login page were inside the `(admin)` group, it would also be guarded and redirect back to itself.

**Step 2: Commit**

```bash
git add src/app/admin/login/page.tsx
git commit -m "feat: add admin login page with Google OAuth"
```

---

### Task 41: API Rate Limiting

**Files:**
- Create: `src/lib/rate-limit.ts`
- Modify: `src/middleware.ts`

**Step 1: Write rate limiting utility**

Implement a simple in-memory sliding window rate limiter. This is acceptable for single-region Vercel deployment. Rate limits per route (see TAD Section 10):

| Route | Limit | Window |
|-------|-------|--------|
| `/api/exam` | 20 req/min | Per user |
| `/api/tts` | 30 req/min | Per user |
| `/api/stt/token` | 4 req/min | Per user (fixed window) |
| `/api/stripe/webhook` | 100 req/min | Per IP |
| `/api/report` | 10 req/min | Per user |
| `/api/admin/*` | 60 req/min | Per admin |
| `/api/stripe/checkout` | 5 req/min | Per user |

**Note:** In-memory rate limiting resets on Lambda cold starts. For production scale, migrate to Upstash Redis.

**Step 2: Integrate into middleware**

Add rate limit check in `src/middleware.ts` for API routes before passing to route handlers.

**Step 3: Commit**

```bash
git add src/lib/rate-limit.ts src/middleware.ts
git commit -m "feat: add API rate limiting middleware"
```

---

## Summary: Task Dependency Graph

```
[Task 1: DB Migration] ─────────────────────────────────────────────────┐
[Task 2: TypeScript Types] ─depends on Task 1──────────────────────────┐│
[Task 3: Kill Switch Util] ─independent──────────────────────────────┐ ││
[Task 4: Prompt Loading] ─independent────────────────────────────────┤ ││
[Task 5: Admin Guard] ─depends on Task 1────────────────────────────┐│ ││
[Task 6: Stripe SDK] ─independent────────────────────────────────┐  ││ ││
[Task 7: Stripe Webhook] ─depends on Task 6─────────────────────┤  ││ ││
[Task 8: Stripe Routes] ─depends on Task 6──────────────────────┤  ││ ││
[Task 9: Config Loader] ─depends on Task 1───────────────────────┤  ││ ││
[Task 10: OAuth Config] ─independent (manual)────────────────────┤  ││ ││
                                                                  │  ││ ││
[Task 11: Dashboard API] ─depends on Tasks 1,5──────────────────┤  ││ ││
[Task 12: User Mgmt API] ─depends on Tasks 1,5──────────────────┤  ││ ││
[Task 13: Transcript API] ─depends on Tasks 1,5─────────────────┤  ││ ││
[Task 14: Prompt API] ─depends on Tasks 1,4,5───────────────────┤  ││ ││
[Task 15: Config API] ─depends on Tasks 1,5,9───────────────────┤  ││ ││
[Task 16: Admin Layout+Dashboard] ─depends on Task 11───────────┤  ││ ││
[Task 17: Admin Pages] ─depends on Tasks 12-15──────────────────┤  ││ ││
                                                                  │  ││ ││
[Task 18: Login Redesign] ─depends on Task 10───────────────────┤  ││ ││
[Task 19: Callback Update] ─depends on Task 18──────────────────┤  ││ ││
[Task 20: Landing Page] ─depends on Task 18─────────────────────┤  ││ ││
[Task 21: Middleware Status] ─depends on Task 1──────────────────┤  ││ ││
                                                                  │  ││ ││
[Task 22: Kill Switch Integration] ─depends on Tasks 3,9────────┤  ││ ││
[Task 23: Prompt Integration] ─depends on Tasks 4,14────────────┤  ││ ││
[Task 24: Usage Logging] ─depends on Task 1─────────────────────┤  ││ ││
[Task 25: Last Login Track] ─depends on Task 1──────────────────┘  ││ ││
                                                                    ││ ││
[Tasks 26-28: Moderation] ─depends on Tasks 1,5────────────────────┘│ ││
[Tasks 29-32: Session Enforcement] ─depends on Tasks 1,18──────────┘ ││
[Tasks 33-36: Pricing/Billing UI] ─depends on Tasks 6-8──────────────┘│
[Tasks 37-39: Cross-Browser] ─depends on all above────────────────────┘
[Task 40: Admin Login Page] ─depends on Task 16─────────────────────────
[Task 41: Rate Limiting] ─independent (can be done anytime)─────────────
```

---

## Files Changed Summary

### New Files (40)

| File | Purpose |
|------|---------|
| `supabase/migrations/20260216100001_pre_commercialization.sql` | All new tables |
| `src/lib/kill-switch.ts` | Kill switch logic |
| `src/lib/__tests__/kill-switch.test.ts` | Kill switch tests |
| `src/lib/prompts.ts` | Prompt loading with fallback |
| `src/lib/__tests__/prompts.test.ts` | Prompt loading tests |
| `src/lib/admin-guard.ts` | Admin auth guard |
| `src/lib/stripe.ts` | Stripe SDK client |
| `src/lib/system-config.ts` | Config loader (serverless-safe, no cache) |
| `src/lib/session-enforcement.ts` | One-active-exam logic |
| `src/lib/browser-detect.ts` | Browser capability detection |
| `src/lib/__tests__/browser-detect.test.ts` | Browser detection tests |
| `src/app/api/stripe/webhook/route.ts` | Stripe webhooks |
| `src/app/api/stripe/checkout/route.ts` | Checkout session |
| `src/app/api/stripe/portal/route.ts` | Customer portal |
| `src/app/api/stripe/status/route.ts` | Entitlement check |
| `src/app/api/admin/dashboard/route.ts` | Admin dashboard |
| `src/app/api/admin/users/route.ts` | User list |
| `src/app/api/admin/users/[id]/route.ts` | User detail |
| `src/app/api/admin/users/[id]/actions/route.ts` | User actions |
| `src/app/api/admin/sessions/[id]/transcript/route.ts` | Transcript viewer |
| `src/app/api/admin/prompts/route.ts` | Prompt management |
| `src/app/api/admin/prompts/[id]/publish/route.ts` | Prompt publish |
| `src/app/api/admin/prompts/[id]/rollback/route.ts` | Prompt rollback |
| `src/app/api/admin/config/route.ts` | System config |
| `src/app/api/admin/moderation/route.ts` | Moderation queue (list) |
| `src/app/api/admin/moderation/[id]/route.ts` | Moderation item (resolve/dismiss) |
| `src/app/api/report/route.ts` | User report submission |
| `src/app/api/user/sessions/route.ts` | Active sessions |
| `src/app/(admin)/layout.tsx` | Admin layout |
| `src/app/(admin)/admin/page.tsx` | Admin dashboard page |
| `src/app/(admin)/admin/users/page.tsx` | User list page |
| `src/app/(admin)/admin/users/[id]/page.tsx` | User detail page |
| `src/app/(admin)/admin/prompts/page.tsx` | Prompt manager |
| `src/app/(admin)/admin/config/page.tsx` | Config page |
| `src/app/(admin)/admin/moderation/page.tsx` | Moderation queue |
| `src/app/pricing/page.tsx` | Pricing page |
| `src/app/banned/page.tsx` | Banned user page |
| `src/app/suspended/page.tsx` | Suspended user page |
| `src/app/(admin)/admin/login/page.tsx` | Admin login page |
| `src/lib/rate-limit.ts` | API rate limiting utility |

### Modified Files (12)

| File | Changes |
|------|---------|
| `src/types/database.ts` | Add types for all new tables |
| `src/app/(auth)/login/page.tsx` | Replace password with OTP + OAuth |
| `src/app/auth/callback/route.ts` | Handle OAuth callbacks |
| `src/app/page.tsx` | Update CTAs |
| `src/lib/supabase/middleware.ts` | Account status check |
| `src/app/api/exam/route.ts` | Kill switch + session enforcement + usage logging |
| `src/app/api/tts/route.ts` | Kill switch + usage logging |
| `src/app/api/stt/token/route.ts` | Kill switch |
| `src/app/(dashboard)/practice/page.tsx` | Report button + upgrade prompts + checkout handling |
| `src/app/(dashboard)/settings/page.tsx` | Active sessions + usage dashboard + feedback |
| `src/lib/exam-engine.ts` | Prompt versioning integration |
| `src/lib/exam-logic.ts` | Accept prompt content as parameter |

### Deleted Files (1)

| File | Reason |
|------|--------|
| `src/app/(auth)/signup/page.tsx` | Replaced by OTP auto-creation in login |

---

*Created: February 16, 2026*
*Companion document: `docs/plans/2026-02-16-pre-commercialization-tad.md`*
