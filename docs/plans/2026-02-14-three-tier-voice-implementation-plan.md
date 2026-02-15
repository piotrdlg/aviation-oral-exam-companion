# Three-Tier Voice Quality System — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement Ground School (Tier 1, current stack), Checkride Prep (Tier 2, Deepgram STT+TTS), and DPE Live (Tier 3, Deepgram STT + Cartesia TTS) voice quality tiers with Stripe billing, usage quotas, and progressive audio playback.

**Architecture:** Provider abstraction layer (`src/lib/voice/`) wraps OpenAI, Deepgram, and Cartesia behind a unified `TTSProvider` interface. All TTS goes through server-side `/api/tts`. STT for Tier 2/3 connects client-direct to Deepgram via temporary tokens. Stripe webhooks manage tier assignment. AudioWorklet ring buffer handles streaming playback.

**Tech Stack:** Next.js 16 (App Router), Supabase (PostgreSQL + Auth + RLS), OpenAI TTS-1, Deepgram Nova-3 STT + Aura-2 TTS, Cartesia Sonic-3 TTS, Stripe (subscriptions + webhooks), AudioWorklet API, Vitest.

**Design Document:** `docs/plans/2026-02-14-three-tier-voice-system-design.md` (approved by GPT-5.2, Round 4)

---

## Phase 1: Foundation

### Task 1: Database Migration — `user_profiles` and `usage_logs` Tables

**Files:**
- Create: `supabase/migrations/20260214000008_voice_tiers.sql`

**Step 1: Write the migration**

```sql
-- Voice Tier System: user_profiles + usage_logs + auto-create trigger + backfill

-- 1. user_profiles table
CREATE TABLE user_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tier TEXT NOT NULL DEFAULT 'ground_school'
    CHECK (tier IN ('ground_school', 'checkride_prep', 'dpe_live')),
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  stripe_price_id TEXT,
  stripe_product_id TEXT,
  stripe_subscription_item_id TEXT,
  subscription_status TEXT NOT NULL DEFAULT 'active'
    CHECK (subscription_status IN ('active', 'past_due', 'canceled', 'trialing', 'incomplete')),
  cancel_at_period_end BOOLEAN NOT NULL DEFAULT FALSE,
  trial_end TIMESTAMPTZ,
  current_period_start TIMESTAMPTZ,
  current_period_end TIMESTAMPTZ,
  last_webhook_event_id TEXT,
  last_webhook_event_ts TIMESTAMPTZ,
  latest_invoice_status TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id)
);

ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own profile"
  ON user_profiles FOR SELECT
  USING (auth.uid() = user_id);

-- No INSERT/UPDATE policies for authenticated users = prevents tier self-promotion

-- 2. usage_logs table
CREATE TABLE usage_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  session_id UUID REFERENCES exam_sessions(id),
  request_id TEXT,
  event_type TEXT NOT NULL
    CHECK (event_type IN ('tts_request', 'stt_session', 'llm_request', 'token_issued')),
  provider TEXT NOT NULL,
  tier TEXT NOT NULL,
  quantity NUMERIC NOT NULL,
  latency_ms INTEGER,
  status TEXT DEFAULT 'ok'
    CHECK (status IN ('ok', 'error', 'timeout')),
  error_code TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_usage_logs_user_date ON usage_logs (user_id, created_at);
CREATE INDEX idx_usage_logs_session ON usage_logs (session_id) WHERE session_id IS NOT NULL;

ALTER TABLE usage_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own usage"
  ON usage_logs FOR SELECT
  USING (auth.uid() = user_id);

-- 3. Auto-create profile on signup
CREATE OR REPLACE FUNCTION create_user_profile()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO user_profiles (user_id, tier, subscription_status)
  VALUES (NEW.id, 'ground_school', 'active');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION create_user_profile();

-- 4. Backfill existing users
INSERT INTO user_profiles (user_id, tier, subscription_status)
SELECT id, 'ground_school', 'active'
FROM auth.users
WHERE id NOT IN (SELECT user_id FROM user_profiles);
```

**Step 2: Apply the migration**

Run: `npx supabase db push` (or apply via Supabase dashboard)
Expected: Tables created, existing users backfilled.

**Step 3: Commit**

```bash
git add supabase/migrations/20260214000008_voice_tiers.sql
git commit -m "feat: add user_profiles and usage_logs tables for voice tier system"
```

---

### Task 2: Type System — Voice Tier Types

**Files:**
- Modify: `src/types/database.ts`
- Create: `src/lib/voice/types.ts`

**Step 1: Add tier types to `src/types/database.ts`**

Add after the existing `AircraftClass` type:

```typescript
export type VoiceTier = 'ground_school' | 'checkride_prep' | 'dpe_live';

export interface UserProfile {
  id: string;
  user_id: string;
  tier: VoiceTier;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  stripe_price_id: string | null;
  stripe_product_id: string | null;
  stripe_subscription_item_id: string | null;
  subscription_status: 'active' | 'past_due' | 'canceled' | 'trialing' | 'incomplete';
  cancel_at_period_end: boolean;
  trial_end: string | null;
  current_period_start: string | null;
  current_period_end: string | null;
  last_webhook_event_id: string | null;
  last_webhook_event_ts: string | null;
  latest_invoice_status: string | null;
  created_at: string;
  updated_at: string;
}

export interface UsageLog {
  id: string;
  user_id: string;
  session_id: string | null;
  request_id: string | null;
  event_type: 'tts_request' | 'stt_session' | 'llm_request' | 'token_issued';
  provider: string;
  tier: string;
  quantity: number;
  latency_ms: number | null;
  status: 'ok' | 'error' | 'timeout';
  error_code: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}
```

**Step 2: Create voice provider types at `src/lib/voice/types.ts`**

```typescript
export type VoiceTier = 'ground_school' | 'checkride_prep' | 'dpe_live';

export interface TTSProvider {
  readonly name: string;
  readonly supportsStreaming: boolean;
  synthesize(text: string, options?: TTSOptions): Promise<TTSResult>;
}

export interface TTSOptions {
  voice?: string;
  sampleRate?: 24000 | 44100 | 48000;
}

export interface TTSResult {
  audio: ReadableStream<Uint8Array>;
  contentType: string;
  encoding: 'mp3' | 'linear16' | 'pcm_f32le';
  sampleRate: number;
  channels: 1 | 2;
  ttfbMs: number;
}

export interface TierFeatures {
  sttProvider: 'browser' | 'deepgram';
  ttsProvider: 'openai' | 'deepgram' | 'cartesia';
  supportsAllBrowsers: boolean;
  customVocabulary: boolean;
  maxSessionsPerMonth: number;
  maxExchangesPerSession: number;
  maxTtsCharsPerMonth: number;
}

export const TIER_FEATURES: Record<VoiceTier, TierFeatures> = {
  ground_school: {
    sttProvider: 'browser',
    ttsProvider: 'openai',
    supportsAllBrowsers: false,
    customVocabulary: false,
    maxSessionsPerMonth: 30,
    maxExchangesPerSession: 20,
    maxTtsCharsPerMonth: 200_000,
  },
  checkride_prep: {
    sttProvider: 'deepgram',
    ttsProvider: 'deepgram',
    supportsAllBrowsers: true,
    customVocabulary: true,
    maxSessionsPerMonth: 60,
    maxExchangesPerSession: 30,
    maxTtsCharsPerMonth: 500_000,
  },
  dpe_live: {
    sttProvider: 'deepgram',
    ttsProvider: 'cartesia',
    supportsAllBrowsers: true,
    customVocabulary: true,
    maxSessionsPerMonth: Infinity,
    maxExchangesPerSession: 50,
    maxTtsCharsPerMonth: 1_000_000,
  },
};
```

**Step 3: Run type check**

Run: `npx tsc --noEmit`
Expected: No errors.

**Step 4: Commit**

```bash
git add src/types/database.ts src/lib/voice/types.ts
git commit -m "feat: add VoiceTier types and TTS provider interfaces"
```

---

### Task 3: Usage Quota Utility

**Files:**
- Create: `src/lib/voice/usage.ts`
- Create: `src/lib/__tests__/voice-usage.test.ts`

**Step 1: Write the failing test**

```typescript
// src/lib/__tests__/voice-usage.test.ts
import { describe, it, expect } from 'vitest';
import { checkQuota, type UsageSummary } from '../voice/usage';

const emptyUsage: UsageSummary = {
  sessionsThisMonth: 0,
  ttsCharsThisMonth: 0,
  sttSecondsThisMonth: 0,
  exchangesThisSession: 0,
};

describe('checkQuota', () => {
  it('allows ground_school user under all limits', () => {
    const result = checkQuota('ground_school', emptyUsage);
    expect(result.allowed).toBe(true);
    expect(result.reason).toBeNull();
  });

  it('blocks ground_school user at session limit', () => {
    const result = checkQuota('ground_school', {
      ...emptyUsage,
      sessionsThisMonth: 30,
    });
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('session');
  });

  it('blocks at TTS char limit', () => {
    const result = checkQuota('ground_school', {
      ...emptyUsage,
      ttsCharsThisMonth: 200_001,
    });
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('TTS');
  });

  it('blocks at exchange limit', () => {
    const result = checkQuota('ground_school', {
      ...emptyUsage,
      exchangesThisSession: 20,
    });
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('exchange');
  });

  it('allows dpe_live unlimited sessions', () => {
    const result = checkQuota('dpe_live', {
      ...emptyUsage,
      sessionsThisMonth: 999,
    });
    expect(result.allowed).toBe(true);
  });

  it('blocks dpe_live at exchange limit', () => {
    const result = checkQuota('dpe_live', {
      ...emptyUsage,
      exchangesThisSession: 50,
    });
    expect(result.allowed).toBe(false);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/__tests__/voice-usage.test.ts`
Expected: FAIL — module not found.

**Step 3: Write implementation**

```typescript
// src/lib/voice/usage.ts
import { TIER_FEATURES, type VoiceTier } from './types';

export interface UsageSummary {
  sessionsThisMonth: number;
  ttsCharsThisMonth: number;
  sttSecondsThisMonth: number;
  exchangesThisSession: number;
}

export interface QuotaCheckResult {
  allowed: boolean;
  reason: string | null;
  limit?: string;
}

export function checkQuota(
  tier: VoiceTier,
  usage: UsageSummary,
  quotaType?: 'session' | 'exchange' | 'tts'
): QuotaCheckResult {
  const features = TIER_FEATURES[tier];

  // Session limit (skip if checking a specific other quota)
  if (!quotaType || quotaType === 'session') {
    if (usage.sessionsThisMonth >= features.maxSessionsPerMonth) {
      return {
        allowed: false,
        reason: `Monthly session limit reached (${features.maxSessionsPerMonth} sessions).`,
        limit: 'sessions_per_month',
      };
    }
  }

  // Exchange limit
  if (!quotaType || quotaType === 'exchange') {
    if (usage.exchangesThisSession >= features.maxExchangesPerSession) {
      return {
        allowed: false,
        reason: `Per-session exchange limit reached (${features.maxExchangesPerSession} exchanges).`,
        limit: 'exchanges_per_session',
      };
    }
  }

  // TTS character limit
  if (!quotaType || quotaType === 'tts') {
    if (usage.ttsCharsThisMonth > features.maxTtsCharsPerMonth) {
      return {
        allowed: false,
        reason: `Monthly TTS character limit reached (${features.maxTtsCharsPerMonth.toLocaleString()} chars).`,
        limit: 'tts_chars_per_month',
      };
    }
  }

  return { allowed: true, reason: null };
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/__tests__/voice-usage.test.ts`
Expected: All 6 tests PASS.

**Step 5: Commit**

```bash
git add src/lib/voice/usage.ts src/lib/__tests__/voice-usage.test.ts
git commit -m "feat: add usage quota checking utility with tests"
```

---

### Task 4: OpenAI TTS Provider Wrapper

**Files:**
- Create: `src/lib/voice/tts/openai-tts.ts`

**Step 1: Write the provider**

```typescript
// src/lib/voice/tts/openai-tts.ts
import OpenAI from 'openai';
import type { TTSProvider, TTSResult, TTSOptions } from '../types';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

export class OpenAITTSProvider implements TTSProvider {
  readonly name = 'openai';
  readonly supportsStreaming = false;

  async synthesize(text: string, options?: TTSOptions): Promise<TTSResult> {
    const start = Date.now();
    const truncated = text.slice(0, 2000);

    const response = await openai.audio.speech.create({
      model: 'tts-1',
      voice: (options?.voice as 'onyx') || 'onyx',
      input: truncated,
      response_format: 'mp3',
    });

    const ttfbMs = Date.now() - start;
    const arrayBuffer = await response.arrayBuffer();
    const uint8 = new Uint8Array(arrayBuffer);

    // Wrap buffer in a single-chunk ReadableStream for uniform handling
    const audio = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(uint8);
        controller.close();
      },
    });

    return {
      audio,
      contentType: 'audio/mpeg',
      encoding: 'mp3',
      sampleRate: 24000,
      channels: 1,
      ttfbMs,
    };
  }
}
```

**Step 2: Run type check**

Run: `npx tsc --noEmit`
Expected: No errors.

**Step 3: Commit**

```bash
git add src/lib/voice/tts/openai-tts.ts
git commit -m "feat: wrap OpenAI TTS in TTSProvider interface"
```

---

### Task 5: Provider Factory

**Files:**
- Create: `src/lib/voice/provider-factory.ts`
- Create: `src/lib/__tests__/provider-factory.test.ts`

**Step 1: Write the failing test**

```typescript
// src/lib/__tests__/provider-factory.test.ts
import { describe, it, expect } from 'vitest';
import { getTTSProviderName } from '../voice/provider-factory';

describe('getTTSProviderName', () => {
  it('returns openai for ground_school', () => {
    expect(getTTSProviderName('ground_school')).toBe('openai');
  });

  it('returns deepgram for checkride_prep', () => {
    expect(getTTSProviderName('checkride_prep')).toBe('deepgram');
  });

  it('returns cartesia for dpe_live', () => {
    expect(getTTSProviderName('dpe_live')).toBe('cartesia');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/__tests__/provider-factory.test.ts`
Expected: FAIL — module not found.

**Step 3: Write implementation**

```typescript
// src/lib/voice/provider-factory.ts
import type { TTSProvider, VoiceTier } from './types';
import { TIER_FEATURES } from './types';

/** Returns the provider name for a given tier (pure function, no SDK imports). */
export function getTTSProviderName(tier: VoiceTier): string {
  return TIER_FEATURES[tier].ttsProvider;
}

/**
 * Creates the TTS provider instance for a given tier.
 * Lazy-imports SDK modules to avoid bundling unused providers.
 * Includes fallback chain: Cartesia → Deepgram → OpenAI → throw.
 */
export async function createTTSProvider(tier: VoiceTier): Promise<TTSProvider> {
  const primary = TIER_FEATURES[tier].ttsProvider;

  try {
    return await importProvider(primary);
  } catch (err) {
    console.error(`Primary TTS provider ${primary} failed to initialize:`, err);
    // Fallback chain
    const fallbacks = getFallbackChain(primary);
    for (const fallback of fallbacks) {
      try {
        console.warn(`Falling back to TTS provider: ${fallback}`);
        return await importProvider(fallback);
      } catch {
        continue;
      }
    }
    throw new Error('All TTS providers failed to initialize');
  }
}

function getFallbackChain(primary: string): string[] {
  switch (primary) {
    case 'cartesia': return ['deepgram', 'openai'];
    case 'deepgram': return ['openai'];
    case 'openai': return [];
    default: return ['openai'];
  }
}

async function importProvider(name: string): Promise<TTSProvider> {
  switch (name) {
    case 'openai': {
      const { OpenAITTSProvider } = await import('./tts/openai-tts');
      return new OpenAITTSProvider();
    }
    case 'deepgram': {
      const { DeepgramTTSProvider } = await import('./tts/deepgram-tts');
      return new DeepgramTTSProvider();
    }
    case 'cartesia': {
      const { CartesiaTTSProvider } = await import('./tts/cartesia-tts');
      return new CartesiaTTSProvider();
    }
    default:
      throw new Error(`Unknown TTS provider: ${name}`);
  }
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/__tests__/provider-factory.test.ts`
Expected: All 3 tests PASS (only tests the pure function, not the async factory).

**Step 5: Commit**

```bash
git add src/lib/voice/provider-factory.ts src/lib/__tests__/provider-factory.test.ts
git commit -m "feat: add TTS provider factory with fallback chain"
```

---

### Task 6: Tier Lookup Utility

**Files:**
- Create: `src/lib/voice/tier-lookup.ts`

**Step 1: Write the utility**

```typescript
// src/lib/voice/tier-lookup.ts
import type { VoiceTier } from './types';

/**
 * Look up a user's tier from the user_profiles table.
 * Uses the service-role Supabase client (server-side only).
 * Falls back to 'ground_school' if profile not found.
 */
export async function getUserTier(
  supabase: { from: (table: string) => { select: (cols: string) => { eq: (col: string, val: string) => { single: () => Promise<{ data: { tier: string } | null; error: unknown }> } } } },
  userId: string
): Promise<VoiceTier> {
  const { data, error } = await supabase
    .from('user_profiles')
    .select('tier')
    .eq('user_id', userId)
    .single();

  if (error || !data) {
    return 'ground_school';
  }

  return data.tier as VoiceTier;
}
```

**Step 2: Run type check**

Run: `npx tsc --noEmit`
Expected: No errors.

**Step 3: Commit**

```bash
git add src/lib/voice/tier-lookup.ts
git commit -m "feat: add getUserTier utility for server-side tier lookup"
```

---

### Task 7: Update `/api/tts` Route for Tier-Aware Provider Selection

**Files:**
- Modify: `src/app/api/tts/route.ts`

**Step 1: Rewrite the TTS route**

Replace the entire file:

```typescript
// src/app/api/tts/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getUserTier } from '@/lib/voice/tier-lookup';
import { createTTSProvider } from '@/lib/voice/provider-factory';

// Service-role client for usage logging (bypasses RLS)
import { createClient as createServiceClient } from '@supabase/supabase-js';

const serviceSupabase = createServiceClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { text } = await request.json();
    if (!text || typeof text !== 'string') {
      return NextResponse.json({ error: 'Missing text' }, { status: 400 });
    }

    // Enforce max text length
    const truncated = text.slice(0, 2000);

    // Look up user's tier
    const tier = await getUserTier(serviceSupabase, user.id);

    // Check TTS quota
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const { count: ttsCharsThisMonth } = await serviceSupabase
      .from('usage_logs')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('event_type', 'tts_request')
      .eq('status', 'ok')
      .gte('created_at', monthStart);

    // Import quota check
    const { checkQuota } = await import('@/lib/voice/usage');
    const quotaResult = checkQuota(tier, {
      sessionsThisMonth: 0, // Not checked here
      ttsCharsThisMonth: ttsCharsThisMonth || 0,
      sttSecondsThisMonth: 0,
      exchangesThisSession: 0,
    }, 'tts');

    if (!quotaResult.allowed) {
      return NextResponse.json(
        { error: 'quota_exceeded', limit: quotaResult.limit, upgrade_url: '/pricing' },
        { status: 429 }
      );
    }

    // Create provider for user's tier
    const start = Date.now();
    const provider = await createTTSProvider(tier);
    const result = await provider.synthesize(truncated);

    // Log usage (non-blocking)
    serviceSupabase
      .from('usage_logs')
      .insert({
        user_id: user.id,
        event_type: 'tts_request',
        provider: provider.name,
        tier,
        quantity: truncated.length,
        latency_ms: result.ttfbMs,
        status: 'ok',
        metadata: { encoding: result.encoding, sample_rate: result.sampleRate },
      })
      .then(({ error }) => {
        if (error) console.error('Usage log error:', error.message);
      });

    // Stream the response
    return new Response(result.audio, {
      headers: {
        'Content-Type': result.contentType,
        'X-Audio-Encoding': result.encoding,
        'X-Audio-Sample-Rate': String(result.sampleRate),
        'X-Audio-Channels': String(result.channels),
        'X-TTS-Provider': provider.name,
        'Cache-Control': 'no-cache',
      },
    });
  } catch (error) {
    console.error('TTS error:', error);
    return NextResponse.json(
      { error: 'TTS generation failed' },
      { status: 500 }
    );
  }
}
```

**Step 2: Run build check**

Run: `npx tsc --noEmit`
Expected: No errors.

**Step 3: Commit**

```bash
git add src/app/api/tts/route.ts
git commit -m "feat: update /api/tts with tier-aware provider selection and usage logging"
```

---

### Task 8: Tier Lookup API Route

**Files:**
- Create: `src/app/api/user/tier/route.ts`

**Step 1: Write the route**

```typescript
// src/app/api/user/tier/route.ts
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { TIER_FEATURES } from '@/lib/voice/types';
import type { VoiceTier } from '@/lib/voice/types';

const serviceSupabase = createServiceClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get user's tier
    const { data: profile } = await serviceSupabase
      .from('user_profiles')
      .select('tier, subscription_status, cancel_at_period_end, current_period_end')
      .eq('user_id', user.id)
      .single();

    const tier: VoiceTier = (profile?.tier as VoiceTier) || 'ground_school';
    const features = TIER_FEATURES[tier];

    // Get usage for current month
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

    const [sessionsResult, ttsResult, sttResult] = await Promise.all([
      serviceSupabase
        .from('exam_sessions')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .gte('created_at', monthStart),
      serviceSupabase
        .from('usage_logs')
        .select('quantity')
        .eq('user_id', user.id)
        .eq('event_type', 'tts_request')
        .eq('status', 'ok')
        .gte('created_at', monthStart),
      serviceSupabase
        .from('usage_logs')
        .select('quantity')
        .eq('user_id', user.id)
        .eq('event_type', 'stt_session')
        .gte('created_at', monthStart),
    ]);

    const ttsChars = (ttsResult.data || []).reduce((sum, r) => sum + Number(r.quantity), 0);
    const sttSeconds = (sttResult.data || []).reduce((sum, r) => sum + Number(r.quantity), 0);

    return NextResponse.json({
      tier,
      subscriptionStatus: profile?.subscription_status || 'active',
      cancelAtPeriodEnd: profile?.cancel_at_period_end || false,
      currentPeriodEnd: profile?.current_period_end || null,
      features,
      usage: {
        sessionsThisMonth: sessionsResult.count || 0,
        ttsCharsThisMonth: ttsChars,
        sttSecondsThisMonth: sttSeconds,
      },
    });
  } catch (error) {
    console.error('Tier lookup error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
```

**Step 2: Run type check**

Run: `npx tsc --noEmit`
Expected: No errors.

**Step 3: Commit**

```bash
git add src/app/api/user/tier/route.ts
git commit -m "feat: add /api/user/tier endpoint for tier and usage lookup"
```

---

### Task 9: Run All Tests & Build Check

**Step 1: Run all tests**

Run: `npx vitest run`
Expected: All tests pass (existing 17 + new 9).

**Step 2: Run build**

Run: `npm run build`
Expected: Build succeeds.

**Step 3: Commit (if any fixes needed)**

---

## Phase 2: Deepgram Integration (Tier 2)

### Task 10: Install Deepgram SDK

**Step 1: Install dependency**

Run: `npm install @deepgram/sdk`

**Step 2: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add @deepgram/sdk dependency"
```

---

### Task 11: Deepgram TTS Provider

**Files:**
- Create: `src/lib/voice/tts/deepgram-tts.ts`

**Step 1: Write the provider**

```typescript
// src/lib/voice/tts/deepgram-tts.ts
import { createClient } from '@deepgram/sdk';
import type { TTSProvider, TTSResult, TTSOptions } from '../types';

export class DeepgramTTSProvider implements TTSProvider {
  readonly name = 'deepgram';
  readonly supportsStreaming = true;
  private client: ReturnType<typeof createClient>;

  constructor() {
    this.client = createClient(process.env.DEEPGRAM_API_KEY!);
  }

  async synthesize(text: string, options?: TTSOptions): Promise<TTSResult> {
    const start = Date.now();
    const truncated = text.slice(0, 2000);

    const response = await this.client.speak.request(
      { text: truncated },
      {
        model: options?.voice || 'aura-2-thalia-en',
        encoding: 'linear16',
        sample_rate: options?.sampleRate || 48000,
        container: 'none',
      }
    );

    const ttfbMs = Date.now() - start;
    const stream = await response.getStream();

    if (!stream) {
      throw new Error('Deepgram TTS returned no stream');
    }

    return {
      audio: stream as ReadableStream<Uint8Array>,
      contentType: 'audio/l16',
      encoding: 'linear16',
      sampleRate: options?.sampleRate || 48000,
      channels: 1,
      ttfbMs,
    };
  }
}
```

**Step 2: Run type check**

Run: `npx tsc --noEmit`
Expected: No errors.

**Step 3: Commit**

```bash
git add src/lib/voice/tts/deepgram-tts.ts
git commit -m "feat: add Deepgram Aura-2 TTS provider"
```

---

### Task 12: STT Token Endpoint

**Files:**
- Create: `src/app/api/stt/token/route.ts`

**Step 1: Write the route**

```typescript
// src/app/api/stt/token/route.ts
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { getUserTier } from '@/lib/voice/tier-lookup';

const serviceSupabase = createServiceClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Verify tier allows Deepgram STT
    const tier = await getUserTier(serviceSupabase, user.id);
    if (tier === 'ground_school') {
      return NextResponse.json(
        { error: 'STT tokens require Checkride Prep or DPE Live tier' },
        { status: 403 }
      );
    }

    // Rate limit: max 4 tokens per minute
    const oneMinuteAgo = new Date(Date.now() - 60_000).toISOString();
    const { count } = await serviceSupabase
      .from('usage_logs')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('event_type', 'token_issued')
      .gte('created_at', oneMinuteAgo);

    if ((count || 0) >= 4) {
      return NextResponse.json(
        { error: 'Token rate limit exceeded. Max 4 per minute.' },
        { status: 429 }
      );
    }

    // Request temporary token from Deepgram
    const response = await fetch('https://api.deepgram.com/v1/auth/token', {
      method: 'POST',
      headers: {
        'Authorization': `Token ${process.env.DEEPGRAM_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ ttl: 30 }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('Deepgram token error:', errText);
      return NextResponse.json({ error: 'Failed to generate STT token' }, { status: 502 });
    }

    const tokenData = await response.json();

    // Log token issuance (non-blocking)
    serviceSupabase
      .from('usage_logs')
      .insert({
        user_id: user.id,
        event_type: 'token_issued',
        provider: 'deepgram',
        tier,
        quantity: 1,
        status: 'ok',
      })
      .then(({ error }) => {
        if (error) console.error('Token usage log error:', error.message);
      });

    return NextResponse.json({
      token: tokenData.key || tokenData.token,
      url: 'wss://api.deepgram.com/v1/listen',
      expiresAt: Date.now() + 30_000,
    });
  } catch (error) {
    console.error('STT token error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
```

**Step 2: Run type check**

Run: `npx tsc --noEmit`
Expected: No errors.

**Step 3: Commit**

```bash
git add src/app/api/stt/token/route.ts
git commit -m "feat: add /api/stt/token endpoint for Deepgram temporary tokens"
```

---

### Task 13: STT Usage Tracking Endpoint

**Files:**
- Create: `src/app/api/stt/usage/route.ts`

**Step 1: Write the route**

```typescript
// src/app/api/stt/usage/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { getUserTier } from '@/lib/voice/tier-lookup';

const serviceSupabase = createServiceClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const CONCURRENT_CAPS: Record<string, number> = {
  checkride_prep: 1,
  dpe_live: 2,
};

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { sessionId, action, durationSeconds } = await request.json() as {
      sessionId: string;
      action: 'start' | 'end';
      durationSeconds?: number;
    };

    const tier = await getUserTier(serviceSupabase, user.id);

    if (action === 'start') {
      // Check concurrent session cap
      const cap = CONCURRENT_CAPS[tier] || 0;
      if (cap > 0) {
        const { count } = await serviceSupabase
          .from('usage_logs')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', user.id)
          .eq('event_type', 'stt_session')
          .eq('status', 'ok')
          .is('metadata->ended_at', null);

        if ((count || 0) >= cap) {
          return NextResponse.json(
            { error: 'Concurrent STT session limit reached' },
            { status: 429 }
          );
        }
      }

      // Create usage log entry
      await serviceSupabase.from('usage_logs').insert({
        user_id: user.id,
        session_id: sessionId,
        event_type: 'stt_session',
        provider: 'deepgram',
        tier,
        quantity: 0,
        status: 'ok',
        metadata: { started_at: new Date().toISOString() },
      });

      return NextResponse.json({ ok: true });
    }

    if (action === 'end') {
      // Update the existing usage log entry with final duration
      const { data: logs } = await serviceSupabase
        .from('usage_logs')
        .select('id')
        .eq('user_id', user.id)
        .eq('session_id', sessionId)
        .eq('event_type', 'stt_session')
        .is('metadata->ended_at', null)
        .order('created_at', { ascending: false })
        .limit(1);

      if (logs && logs.length > 0) {
        await serviceSupabase
          .from('usage_logs')
          .update({
            quantity: durationSeconds || 0,
            metadata: {
              started_at: null, // Will be merged
              ended_at: new Date().toISOString(),
            },
          })
          .eq('id', logs[0].id);
      }

      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error) {
    console.error('STT usage error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
```

**Step 2: Commit**

```bash
git add src/app/api/stt/usage/route.ts
git commit -m "feat: add /api/stt/usage endpoint for STT session tracking"
```

---

### Task 14: AudioWorklet PCM Playback Processor

**Files:**
- Create: `public/audio-worklet/pcm-playback-processor.js`

**Step 1: Write the AudioWorklet processor**

```javascript
// public/audio-worklet/pcm-playback-processor.js
// Runs in the audio thread — no imports, no DOM access.
class PCMPlaybackProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.capacity = 48000 * 2; // 2 seconds at 48kHz
    this.buffer = new Float32Array(this.capacity);
    this.writePos = 0;
    this.readPos = 0;

    this.port.onmessage = (e) => {
      // Handle flush command (barge-in)
      if (e.data && e.data.type === 'flush') {
        this.writePos = 0;
        this.readPos = 0;
        this.buffer.fill(0);
        return;
      }
      // Handle PCM samples
      const samples = e.data;
      if (samples instanceof Float32Array) {
        for (let i = 0; i < samples.length; i++) {
          // Overflow: drop oldest
          if (this.writePos - this.readPos >= this.capacity) {
            this.readPos = this.writePos - this.capacity + 1;
          }
          this.buffer[this.writePos % this.capacity] = samples[i];
          this.writePos++;
        }
      }
    };
  }

  process(_inputs, outputs) {
    const output = outputs[0][0];
    if (!output) return true;

    for (let i = 0; i < output.length; i++) {
      if (this.readPos < this.writePos) {
        output[i] = this.buffer[this.readPos % this.capacity];
        this.readPos++;
      } else {
        output[i] = 0; // Underrun: silence
      }
    }
    return true;
  }
}

registerProcessor('pcm-playback-processor', PCMPlaybackProcessor);
```

**Step 2: Commit**

```bash
git add public/audio-worklet/pcm-playback-processor.js
git commit -m "feat: add AudioWorklet PCM playback processor with ring buffer"
```

---

### Task 15: Client-Side Deepgram STT Hook

**Files:**
- Create: `src/hooks/useDeepgramSTT.ts`

**Step 1: Write the hook**

```typescript
// src/hooks/useDeepgramSTT.ts
'use client';

import { useState, useRef, useCallback, useEffect } from 'react';

const AVIATION_VOCABULARY = [
  'METAR', 'TAF', 'NOTAM', 'PIREP', 'SIGMET', 'AIRMET',
  'VOR', 'NDB', 'ILS', 'RNAV', 'GPS', 'DME',
  'ACS', 'DPE', 'ASEL', 'AMEL', 'ASES', 'AMES',
  'Cessna', 'Piper', 'Beechcraft', 'Cirrus',
  'V1', 'Vr', 'Vy', 'Vx', 'Va', 'Vne', 'Vno', 'Vfe', 'Vso', 'Vs1',
  'CTAF', 'ATIS', 'AWOS', 'ASOS',
  'FAR', 'AIM', 'POH', 'AFM',
  'ADM', 'CRM', 'SRM', 'IMSAFE', 'PAVE', 'DECIDE',
  'sectional', 'checkride', 'logbook', 'endorsement',
];

interface UseDeepgramSTTReturn {
  startListening: () => Promise<void>;
  stopListening: () => void;
  transcript: string;
  interimTranscript: string;
  isListening: boolean;
  error: string | null;
}

export function useDeepgramSTT(sessionId?: string): UseDeepgramSTTReturn {
  const [transcript, setTranscript] = useState('');
  const [interimTranscript, setInterimTranscript] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const stopListening = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    mediaRecorderRef.current = null;

    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }

    setIsListening(false);

    // Report STT usage
    if (sessionId) {
      fetch('/api/stt/usage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, action: 'end', durationSeconds: 0 }),
      }).catch(() => {});
    }
  }, [sessionId]);

  const startListening = useCallback(async () => {
    setError(null);
    setTranscript('');
    setInterimTranscript('');

    try {
      // 1. Get temporary token
      const tokenRes = await fetch('/api/stt/token');
      if (!tokenRes.ok) {
        const err = await tokenRes.json();
        throw new Error(err.error || 'Failed to get STT token');
      }
      const { token, url } = await tokenRes.json();

      // 2. Report session start
      if (sessionId) {
        await fetch('/api/stt/usage', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId, action: 'start' }),
        });
      }

      // 3. Get microphone access
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      // 4. Determine encoding based on browser
      const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
      const encoding = isSafari ? 'linear16' : 'opus';
      const container = isSafari ? undefined : 'webm';
      const sampleRate = isSafari ? 16000 : 48000;

      // 5. Build WebSocket URL with params
      const keywords = AVIATION_VOCABULARY.map(w => `keywords=${encodeURIComponent(w)}`).join('&');
      const params = [
        'model=nova-3',
        `encoding=${encoding}`,
        container ? `container=${container}` : '',
        `sample_rate=${sampleRate}`,
        'channels=1',
        'interim_results=true',
        'punctuate=true',
        'smart_format=true',
        keywords,
      ].filter(Boolean).join('&');

      const wsUrl = `${url}?${params}`;

      // 6. Open WebSocket
      const ws = new WebSocket(wsUrl, ['token', token]);
      wsRef.current = ws;

      ws.onopen = () => {
        setIsListening(true);

        // 7. Start MediaRecorder
        if (!isSafari) {
          const mediaRecorder = new MediaRecorder(stream, {
            mimeType: 'audio/webm;codecs=opus',
          });
          mediaRecorderRef.current = mediaRecorder;

          mediaRecorder.ondataavailable = (event) => {
            if (event.data.size > 0 && ws.readyState === WebSocket.OPEN) {
              ws.send(event.data);
            }
          };

          mediaRecorder.start(250); // Send chunks every 250ms
        }
        // TODO: Safari AudioWorklet PCM fallback (Phase 5)
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'Results' && data.channel?.alternatives?.[0]) {
            const alt = data.channel.alternatives[0];
            if (data.is_final) {
              setTranscript(prev => (prev ? prev + ' ' : '') + alt.transcript);
              setInterimTranscript('');
            } else {
              setInterimTranscript(alt.transcript);
            }
          }
        } catch {
          // Ignore non-JSON messages
        }
      };

      ws.onerror = () => {
        setError('STT connection error. Please try again.');
        stopListening();
      };

      ws.onclose = () => {
        setIsListening(false);
      };
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start STT');
      stopListening();
    }
  }, [sessionId, stopListening]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopListening();
    };
  }, [stopListening]);

  return {
    startListening,
    stopListening,
    transcript,
    interimTranscript,
    isListening,
    error,
  };
}
```

**Step 2: Run type check**

Run: `npx tsc --noEmit`
Expected: No errors.

**Step 3: Commit**

```bash
git add src/hooks/useDeepgramSTT.ts
git commit -m "feat: add useDeepgramSTT hook with aviation vocabulary and temporary tokens"
```

---

### Task 16: Client-Side Streaming Audio Player Hook

**Files:**
- Create: `src/hooks/useStreamingPlayer.ts`

**Step 1: Write the hook**

```typescript
// src/hooks/useStreamingPlayer.ts
'use client';

import { useState, useRef, useCallback, useEffect } from 'react';

interface UseStreamingPlayerReturn {
  playStream: (response: Response) => Promise<void>;
  stopPlayback: () => void;
  isSpeaking: boolean;
  isReady: boolean;
  error: string | null;
}

/**
 * Converts Int16 PCM (linear16) buffer to Float32 for AudioWorklet.
 */
function int16ToFloat32(int16: Int16Array): Float32Array {
  const float32 = new Float32Array(int16.length);
  for (let i = 0; i < int16.length; i++) {
    float32[i] = int16[i] / 32768;
  }
  return float32;
}

export function useStreamingPlayer(): UseStreamingPlayerReturn {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const audioContextRef = useRef<AudioContext | null>(null);
  const playerNodeRef = useRef<AudioWorkletNode | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Initialize AudioContext and worklet on first user interaction
  const ensureReady = useCallback(async () => {
    if (audioContextRef.current) {
      if (audioContextRef.current.state === 'suspended') {
        await audioContextRef.current.resume();
      }
      return;
    }

    try {
      const ctx = new AudioContext({ sampleRate: 48000 });
      await ctx.audioWorklet.addModule('/audio-worklet/pcm-playback-processor.js');
      const node = new AudioWorkletNode(ctx, 'pcm-playback-processor');
      node.connect(ctx.destination);

      audioContextRef.current = ctx;
      playerNodeRef.current = node;
      setIsReady(true);
    } catch (err) {
      setError('Audio playback not supported in this browser.');
      console.error('AudioWorklet init error:', err);
    }
  }, []);

  const stopPlayback = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
    if (playerNodeRef.current) {
      playerNodeRef.current.port.postMessage({ type: 'flush' });
    }
    setIsSpeaking(false);
  }, []);

  const playStream = useCallback(async (response: Response) => {
    await ensureReady();
    if (!playerNodeRef.current || !response.body) {
      throw new Error('Audio player not initialized');
    }

    const encoding = response.headers.get('X-Audio-Encoding') || 'linear16';
    const abort = new AbortController();
    abortRef.current = abort;
    setIsSpeaking(true);

    try {
      const reader = response.body.getReader();

      while (true) {
        if (abort.signal.aborted) break;
        const { done, value } = await reader.read();
        if (done) break;

        let float32: Float32Array;
        if (encoding === 'linear16') {
          const int16 = new Int16Array(value.buffer, value.byteOffset, value.byteLength / 2);
          float32 = int16ToFloat32(int16);
        } else if (encoding === 'pcm_f32le') {
          float32 = new Float32Array(value.buffer, value.byteOffset, value.byteLength / 4);
        } else {
          // MP3 — decode via AudioContext (for OpenAI TTS fallback in streaming player)
          // This path shouldn't normally be hit for streaming; OpenAI uses Audio() element
          continue;
        }

        playerNodeRef.current!.port.postMessage(float32);
      }

      // Wait for buffer to drain (approximate)
      await new Promise(resolve => setTimeout(resolve, 500));
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        console.error('Stream playback error:', err);
      }
    } finally {
      setIsSpeaking(false);
    }
  }, [ensureReady]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopPlayback();
      if (audioContextRef.current) {
        audioContextRef.current.close();
        audioContextRef.current = null;
      }
    };
  }, [stopPlayback]);

  return { playStream, stopPlayback, isSpeaking, isReady, error };
}
```

**Step 2: Commit**

```bash
git add src/hooks/useStreamingPlayer.ts
git commit -m "feat: add useStreamingPlayer hook with AudioWorklet ring buffer playback"
```

---

### Task 17: Voice Provider Hook (Unified Interface)

**Files:**
- Create: `src/hooks/useVoiceProvider.ts`

**Step 1: Write the unified hook**

```typescript
// src/hooks/useVoiceProvider.ts
'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import type { VoiceTier, TierFeatures } from '@/lib/voice/types';
import { TIER_FEATURES } from '@/lib/voice/types';
import { useDeepgramSTT } from './useDeepgramSTT';
import { useStreamingPlayer } from './useStreamingPlayer';

interface UseVoiceProviderReturn {
  // STT
  startListening: () => void;
  stopListening: () => void;
  transcript: string;
  interimTranscript: string;
  isListening: boolean;

  // TTS
  speak: (text: string) => Promise<void>;
  stopSpeaking: () => void;
  isSpeaking: boolean;

  // Meta
  tier: VoiceTier;
  features: TierFeatures;
  isReady: boolean;
  error: string | null;
}

export function useVoiceProvider(
  tier: VoiceTier,
  sessionId?: string
): UseVoiceProviderReturn {
  const features = TIER_FEATURES[tier];
  const [error, setError] = useState<string | null>(null);

  // Deepgram STT (Tier 2/3)
  const deepgramSTT = useDeepgramSTT(sessionId);

  // Streaming PCM player (Tier 2/3)
  const streamingPlayer = useStreamingPlayer();

  // Browser STT state (Tier 1)
  const [browserTranscript, setBrowserTranscript] = useState('');
  const [browserInterim, setBrowserInterim] = useState('');
  const [browserListening, setBrowserListening] = useState(false);
  const recognitionRef = useRef<SpeechRecognition | null>(null);

  // Browser TTS state (Tier 1)
  const [browserSpeaking, setBrowserSpeaking] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // === STT ===
  const startListening = useCallback(() => {
    if (features.sttProvider === 'deepgram') {
      deepgramSTT.startListening();
    } else {
      // Browser Web Speech API
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (!SpeechRecognition) {
        setError('Speech recognition not supported. Use Chrome.');
        return;
      }

      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = 'en-US';

      recognition.onstart = () => setBrowserListening(true);
      recognition.onresult = (event: SpeechRecognitionEvent) => {
        if (recognitionRef.current !== recognition) return;
        let interim = '';
        let final = '';
        for (let i = 0; i < event.results.length; i++) {
          if (event.results[i].isFinal) {
            final += event.results[i][0].transcript;
          } else {
            interim += event.results[i][0].transcript;
          }
        }
        setBrowserTranscript(final);
        setBrowserInterim(interim);
      };
      recognition.onend = () => {
        if (recognitionRef.current === recognition) {
          try { recognition.start(); } catch { setBrowserListening(false); }
        } else {
          setBrowserListening(false);
        }
      };
      recognition.onerror = (e: SpeechRecognitionErrorEvent) => {
        if (e.error === 'aborted' || e.error === 'no-speech') return;
        setError(`Speech recognition error: ${e.error}`);
        recognitionRef.current = null;
        setBrowserListening(false);
      };

      recognitionRef.current = recognition;
      recognition.start();
    }
  }, [features.sttProvider, deepgramSTT]);

  const stopListening = useCallback(() => {
    if (features.sttProvider === 'deepgram') {
      deepgramSTT.stopListening();
    } else {
      const rec = recognitionRef.current;
      recognitionRef.current = null;
      rec?.stop();
      setBrowserListening(false);
    }
  }, [features.sttProvider, deepgramSTT]);

  // === TTS ===
  const speak = useCallback(async (text: string) => {
    if (features.ttsProvider === 'openai') {
      // Tier 1: fetch MP3 → play via Audio element
      setBrowserSpeaking(true);
      try {
        const res = await fetch('/api/tts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text }),
        });
        if (!res.ok) throw new Error(`TTS failed: ${res.status}`);
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const audio = new Audio(url);
        audioRef.current = audio;
        audio.onended = () => {
          setBrowserSpeaking(false);
          URL.revokeObjectURL(url);
        };
        audio.onerror = () => {
          setBrowserSpeaking(false);
          URL.revokeObjectURL(url);
        };
        await audio.play();
      } catch (err) {
        console.error('TTS playback error:', err);
        setBrowserSpeaking(false);
      }
    } else {
      // Tier 2/3: fetch streaming PCM → play via AudioWorklet
      try {
        const res = await fetch('/api/tts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text }),
        });
        if (!res.ok) throw new Error(`TTS failed: ${res.status}`);
        await streamingPlayer.playStream(res);
      } catch (err) {
        console.error('Streaming TTS error:', err);
      }
    }
  }, [features.ttsProvider, streamingPlayer]);

  const stopSpeaking = useCallback(() => {
    if (features.ttsProvider === 'openai') {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
      setBrowserSpeaking(false);
    } else {
      streamingPlayer.stopPlayback();
    }
  }, [features.ttsProvider, streamingPlayer]);

  // Compute unified state
  const isListening = features.sttProvider === 'deepgram'
    ? deepgramSTT.isListening
    : browserListening;

  const transcript = features.sttProvider === 'deepgram'
    ? deepgramSTT.transcript
    : browserTranscript;

  const interimTranscript = features.sttProvider === 'deepgram'
    ? deepgramSTT.interimTranscript
    : browserInterim;

  const isSpeaking = features.ttsProvider === 'openai'
    ? browserSpeaking
    : streamingPlayer.isSpeaking;

  const combinedError = error || deepgramSTT.error || streamingPlayer.error;

  return {
    startListening,
    stopListening,
    transcript,
    interimTranscript,
    isListening,
    speak,
    stopSpeaking,
    isSpeaking,
    tier,
    features,
    isReady: true,
    error: combinedError,
  };
}
```

**Step 2: Run type check**

Run: `npx tsc --noEmit`
Expected: No errors.

**Step 3: Commit**

```bash
git add src/hooks/useVoiceProvider.ts
git commit -m "feat: add unified useVoiceProvider hook supporting all three tiers"
```

---

### Task 18: Integrate Voice Provider into Practice Page

**Files:**
- Modify: `src/app/(dashboard)/practice/page.tsx`

**Step 1: Update the practice page**

This is a large file. The key changes:

1. Import `useVoiceProvider` and tier state
2. Fetch user tier on mount via `/api/user/tier`
3. Replace inline STT/TTS code with `useVoiceProvider` calls
4. Wire transcript into the input field
5. Keep existing exam logic unchanged

The specific edits needed (apply as targeted edits to the existing file):

**a) Add imports at the top:**

```typescript
import { useVoiceProvider } from '@/hooks/useVoiceProvider';
import type { VoiceTier } from '@/lib/voice/types';
```

**b) Add tier state and fetch:**

```typescript
const [userTier, setUserTier] = useState<VoiceTier>('ground_school');

useEffect(() => {
  fetch('/api/user/tier')
    .then(res => res.json())
    .then(data => {
      if (data.tier) setUserTier(data.tier);
    })
    .catch(() => {}); // Fallback to ground_school
}, []);
```

**c) Initialize the voice provider:**

```typescript
const voice = useVoiceProvider(userTier, sessionId);
```

**d) Replace the existing `speakText`, `startListening`, `stopListening`, STT/TTS state with `voice.*` properties:**

- `speakText(text)` → `voice.speak(text)`
- `startListening()` → `voice.startListening()`
- `stopListening()` → `voice.stopListening()`
- `isListening` → `voice.isListening`
- `isSpeaking` → `voice.isSpeaking`
- Wire `voice.transcript` and `voice.interimTranscript` into `setInput`

**e) Remove the old inline `recognitionRef`, `audioRef`, `voiceEnabledRef`, `speakText`, `startListening`, `stopListening` implementations.**

**Detailed implementation:** Given the practice page is large (~700 lines), apply the refactor carefully, removing old voice code and replacing with voice provider hook calls. Keep all exam logic, session management, and UI structure intact.

**Step 2: Run build**

Run: `npm run build`
Expected: Build succeeds.

**Step 3: Commit**

```bash
git add src/app/(dashboard)/practice/page.tsx
git commit -m "refactor: integrate useVoiceProvider hook into practice page"
```

---

### Task 19: Phase 2 Build & Test

**Step 1: Run all tests**

Run: `npx vitest run`
Expected: All tests pass.

**Step 2: Run build**

Run: `npm run build`
Expected: Build succeeds.

**Step 3: Manual test**

- Open app in Chrome
- Verify Tier 1 (Ground School) still works: voice toggle, mic, TTS playback
- Check `/api/user/tier` returns correct data
- Verify `/api/tts` returns `X-TTS-Provider: openai` header

---

## Phase 3: Cartesia Integration (Tier 3)

### Task 20: Install Cartesia SDK

**Step 1: Install dependency**

Run: `npm install @cartesia/cartesia-js`

**Step 2: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add @cartesia/cartesia-js dependency"
```

---

### Task 21: Cartesia TTS Provider

**Files:**
- Create: `src/lib/voice/tts/cartesia-tts.ts`

**Step 1: Write the provider**

```typescript
// src/lib/voice/tts/cartesia-tts.ts
import Cartesia from '@cartesia/cartesia-js';
import type { TTSProvider, TTSResult, TTSOptions } from '../types';

export class CartesiaTTSProvider implements TTSProvider {
  readonly name = 'cartesia';
  readonly supportsStreaming = true;
  private client: Cartesia;

  constructor() {
    this.client = new Cartesia({ apiKey: process.env.CARTESIA_API_KEY! });
  }

  async synthesize(text: string, options?: TTSOptions): Promise<TTSResult> {
    const start = Date.now();
    const truncated = text.slice(0, 2000);

    const response = await this.client.tts.bytes({
      modelId: 'sonic-3',
      transcript: truncated,
      voice: {
        mode: 'id',
        id: options?.voice || process.env.CARTESIA_VOICE_ID || 'a0e99841-438c-4a64-b679-ae501e7d6091',
      },
      outputFormat: {
        container: 'raw',
        encoding: 'pcm_f32le',
        sampleRate: options?.sampleRate || 44100,
      },
    });

    const ttfbMs = Date.now() - start;

    // Wrap Uint8Array in a ReadableStream
    const audio = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(response));
        controller.close();
      },
    });

    return {
      audio,
      contentType: 'audio/pcm',
      encoding: 'pcm_f32le',
      sampleRate: options?.sampleRate || 44100,
      channels: 1,
      ttfbMs,
    };
  }
}
```

> **Note:** The initial implementation uses `tts.bytes()` (non-streaming). For true streaming, switch to Cartesia's streaming API once the sentence pipelining is working. The provider interface abstracts this — the client always gets a ReadableStream.

**Step 2: Run type check**

Run: `npx tsc --noEmit`
Expected: No errors.

**Step 3: Commit**

```bash
git add src/lib/voice/tts/cartesia-tts.ts
git commit -m "feat: add Cartesia Sonic-3 TTS provider (server-side only)"
```

---

### Task 22: Sentence Boundary Detection

**Files:**
- Create: `src/lib/voice/sentence-boundary.ts`
- Create: `src/lib/__tests__/sentence-boundary.test.ts`

**Step 1: Write the failing tests**

```typescript
// src/lib/__tests__/sentence-boundary.test.ts
import { describe, it, expect } from 'vitest';
import { detectSentenceBoundary } from '../voice/sentence-boundary';

describe('detectSentenceBoundary', () => {
  it('splits on period followed by space', () => {
    const result = detectSentenceBoundary('This is a complete sentence. And more text follows.');
    expect(result).not.toBeNull();
    expect(result!.sentence).toBe('This is a complete sentence.');
    expect(result!.remainder).toBe('And more text follows.');
  });

  it('splits on question mark', () => {
    const result = detectSentenceBoundary('What is the minimum fuel required? You should know this.');
    expect(result).not.toBeNull();
    expect(result!.sentence).toBe('What is the minimum fuel required?');
  });

  it('does not split on abbreviation e.g.', () => {
    const result = detectSentenceBoundary('For example, e.g. weather briefings are important. Next topic.');
    expect(result).not.toBeNull();
    expect(result!.sentence).toContain('e.g.');
  });

  it('does not split on FAA reference 91.205', () => {
    const result = detectSentenceBoundary('Per 14 CFR 91.205 you need certain instruments. What are they?');
    expect(result).not.toBeNull();
    // Should NOT split at "91.205 " — should split at "instruments. "
    expect(result!.sentence).toContain('91.205');
    expect(result!.sentence).toContain('instruments.');
  });

  it('does not split on decimal number', () => {
    const result = detectSentenceBoundary('The frequency is 122.8 MHz for CTAF. What else do you need?');
    expect(result).not.toBeNull();
    expect(result!.sentence).toContain('122.8');
  });

  it('does not split on list marker', () => {
    const result = detectSentenceBoundary('First 1). Check the weather. Then continue planning.');
    expect(result).not.toBeNull();
    // Should split after "weather.", not after "1)."
    expect(result!.sentence).toContain('weather.');
  });

  it('returns null when no boundary found', () => {
    const result = detectSentenceBoundary('This text has no ending punctuation');
    expect(result).toBeNull();
  });

  it('returns null when sentence too short', () => {
    const result = detectSentenceBoundary('Hi. Next.');
    // "Hi." is too short (< MIN_SENTENCE_LENGTH)
    expect(result).toBeNull();
  });

  it('force flushes at max buffer length', () => {
    const longText = 'A'.repeat(250);
    const result = detectSentenceBoundary(longText);
    expect(result).toBeNull(); // No space to split at
  });

  it('splits on colon when buffer is long enough', () => {
    const buffer = 'Here are the requirements you need to know for your checkride preparation: first is weather briefing.';
    const result = detectSentenceBoundary(buffer);
    expect(result).not.toBeNull();
    expect(result!.sentence).toContain(':');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/__tests__/sentence-boundary.test.ts`
Expected: FAIL — module not found.

**Step 3: Write implementation**

```typescript
// src/lib/voice/sentence-boundary.ts

const AVIATION_ABBREVIATIONS = new Set([
  'e.g.', 'i.e.', 'vs.', 'approx.', 'min.', 'max.', 'alt.', 'hdg.',
  'mr.', 'dr.', 'jr.', 'sr.', 'inc.', 'ltd.', 'etc.',
]);

const FAA_REF_PATTERN = /\d+\s*CFR\s*\d+\.\d+|\bAIM\s+\d+-\d+-\d+|\bAC\s+\d+-\d+/;
const DECIMAL_PATTERN = /\d+\.\d/;
const LIST_MARKER_PATTERN = /(?:\(\d+\)|\d+\)|\([a-zA-Z]\)|[a-zA-Z]\))\.\s*$/;

const MIN_SENTENCE_LENGTH = 20;
const MAX_BUFFER_CHARS = 200;

export interface BoundaryResult {
  sentence: string;
  remainder: string;
}

export function detectSentenceBoundary(buffer: string): BoundaryResult | null {
  // Force flush at max length
  if (buffer.length > MAX_BUFFER_CHARS) {
    const cutPoint = buffer.lastIndexOf(' ', MAX_BUFFER_CHARS);
    if (cutPoint > MIN_SENTENCE_LENGTH) {
      return { sentence: buffer.slice(0, cutPoint).trim(), remainder: buffer.slice(cutPoint) };
    }
  }

  // Look for sentence-ending punctuation followed by space
  const candidates = [...buffer.matchAll(/[.?!]\s+/g)];

  for (const match of candidates) {
    const endPos = match.index! + match[0].length;
    const candidate = buffer.slice(0, endPos).trim();

    if (candidate.length < MIN_SENTENCE_LENGTH) continue;

    // Abbreviation check
    const lastWord = candidate.match(/\S+\.$/)?.[0];
    if (lastWord && AVIATION_ABBREVIATIONS.has(lastWord.toLowerCase())) continue;

    // FAA reference check
    const beforePeriod = buffer.slice(Math.max(0, match.index! - 20), match.index! + 2);
    if (FAA_REF_PATTERN.test(beforePeriod)) continue;

    // Decimal check
    if (DECIMAL_PATTERN.test(buffer.slice(match.index! - 2, match.index! + 3))) continue;

    // List marker check
    if (LIST_MARKER_PATTERN.test(candidate)) continue;

    return { sentence: candidate, remainder: buffer.slice(endPos) };
  }

  // Colon soft boundary for long buffers
  if (buffer.length > 80) {
    const colonMatch = buffer.match(/:\s+/);
    if (colonMatch && colonMatch.index! > MIN_SENTENCE_LENGTH) {
      const endPos = colonMatch.index! + colonMatch[0].length;
      return { sentence: buffer.slice(0, endPos).trim(), remainder: buffer.slice(endPos) };
    }
  }

  return null;
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/__tests__/sentence-boundary.test.ts`
Expected: All 10 tests PASS.

**Step 5: Commit**

```bash
git add src/lib/voice/sentence-boundary.ts src/lib/__tests__/sentence-boundary.test.ts
git commit -m "feat: add aviation-aware sentence boundary detection with tests"
```

---

### Task 23: Phase 3 Build & Test

**Step 1: Run all tests**

Run: `npx vitest run`
Expected: All tests pass.

**Step 2: Run build**

Run: `npm run build`
Expected: Build succeeds.

---

## Phase 4: Stripe Billing

### Task 24: Install Stripe SDK

**Step 1: Install dependency**

Run: `npm install stripe`

**Step 2: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add stripe dependency"
```

---

### Task 25: Stripe Webhook Handler

**Files:**
- Create: `src/app/api/webhooks/stripe/route.ts`

**Step 1: Write the webhook handler**

```typescript
// src/app/api/webhooks/stripe/route.ts
import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET!;

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const PRICE_TO_TIER: Record<string, string> = {
  [process.env.STRIPE_PRICE_GROUND_SCHOOL!]: 'ground_school',
  [process.env.STRIPE_PRICE_CHECKRIDE_PREP!]: 'checkride_prep',
  [process.env.STRIPE_PRICE_DPE_LIVE!]: 'dpe_live',
};

export async function POST(request: NextRequest) {
  const body = await request.text();
  const signature = request.headers.get('stripe-signature');

  if (!signature) {
    return NextResponse.json({ error: 'No signature' }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
  } catch (err) {
    console.error('Webhook signature verification failed:', err);
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        const userId = session.metadata?.user_id;
        if (!userId || !session.subscription) break;

        // Fetch authoritative state from Stripe
        const subscription = await stripe.subscriptions.retrieve(
          session.subscription as string
        );
        const priceId = subscription.items.data[0]?.price.id;
        const tier = PRICE_TO_TIER[priceId] || 'ground_school';

        await supabase
          .from('user_profiles')
          .update({
            tier,
            stripe_customer_id: session.customer as string,
            stripe_subscription_id: subscription.id,
            stripe_price_id: priceId,
            stripe_product_id: subscription.items.data[0]?.price.product as string,
            stripe_subscription_item_id: subscription.items.data[0]?.id,
            subscription_status: subscription.status,
            current_period_start: new Date(subscription.current_period_start * 1000).toISOString(),
            current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
            last_webhook_event_id: event.id,
            last_webhook_event_ts: new Date(event.created * 1000).toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq('user_id', userId);
        break;
      }

      case 'customer.subscription.updated': {
        const subscription = event.data.object as Stripe.Subscription;
        const customerId = subscription.customer as string;

        // Find user by Stripe customer ID
        const { data: profile } = await supabase
          .from('user_profiles')
          .select('user_id, last_webhook_event_ts')
          .eq('stripe_customer_id', customerId)
          .single();

        if (!profile) break;

        // Check for out-of-order event
        if (profile.last_webhook_event_ts) {
          const lastTs = new Date(profile.last_webhook_event_ts).getTime();
          if (event.created * 1000 < lastTs) break; // Skip stale event
        }

        // Fetch authoritative state
        const freshSub = await stripe.subscriptions.retrieve(subscription.id);
        const priceId = freshSub.items.data[0]?.price.id;
        const tier = PRICE_TO_TIER[priceId] || 'ground_school';

        await supabase
          .from('user_profiles')
          .update({
            tier,
            stripe_price_id: priceId,
            subscription_status: freshSub.status,
            cancel_at_period_end: freshSub.cancel_at_period_end,
            current_period_start: new Date(freshSub.current_period_start * 1000).toISOString(),
            current_period_end: new Date(freshSub.current_period_end * 1000).toISOString(),
            last_webhook_event_id: event.id,
            last_webhook_event_ts: new Date(event.created * 1000).toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq('user_id', profile.user_id);
        break;
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription;
        const customerId = subscription.customer as string;

        await supabase
          .from('user_profiles')
          .update({
            tier: 'ground_school',
            subscription_status: 'canceled',
            last_webhook_event_id: event.id,
            last_webhook_event_ts: new Date(event.created * 1000).toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq('stripe_customer_id', customerId);
        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice;
        const customerId = invoice.customer as string;

        await supabase
          .from('user_profiles')
          .update({
            subscription_status: 'past_due',
            latest_invoice_status: 'payment_failed',
            updated_at: new Date().toISOString(),
          })
          .eq('stripe_customer_id', customerId);
        break;
      }

      case 'invoice.paid': {
        const invoice = event.data.object as Stripe.Invoice;
        const customerId = invoice.customer as string;

        await supabase
          .from('user_profiles')
          .update({
            subscription_status: 'active',
            latest_invoice_status: 'paid',
            updated_at: new Date().toISOString(),
          })
          .eq('stripe_customer_id', customerId);
        break;
      }
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error('Webhook processing error:', error);
    return NextResponse.json({ error: 'Webhook processing failed' }, { status: 500 });
  }
}
```

**Step 2: Run type check**

Run: `npx tsc --noEmit`
Expected: No errors.

**Step 3: Commit**

```bash
git add src/app/api/webhooks/stripe/route.ts
git commit -m "feat: add Stripe webhook handler with idempotency and authoritative state fetch"
```

---

### Task 26: Stripe Checkout API Route

**Files:**
- Create: `src/app/api/checkout/route.ts`

**Step 1: Write the checkout route**

```typescript
// src/app/api/checkout/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

const TIER_PRICES: Record<string, string> = {
  ground_school: process.env.STRIPE_PRICE_GROUND_SCHOOL!,
  checkride_prep: process.env.STRIPE_PRICE_CHECKRIDE_PREP!,
  dpe_live: process.env.STRIPE_PRICE_DPE_LIVE!,
};

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { tier } = await request.json() as { tier: string };
    const priceId = TIER_PRICES[tier];
    if (!priceId) {
      return NextResponse.json({ error: 'Invalid tier' }, { status: 400 });
    }

    const origin = request.headers.get('origin') || 'https://aviation-oral-exam-companion.vercel.app';

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      payment_method_types: ['card'],
      customer_email: user.email,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${origin}/practice?checkout=success`,
      cancel_url: `${origin}/pricing?checkout=canceled`,
      metadata: { user_id: user.id },
    });

    return NextResponse.json({ url: session.url });
  } catch (error) {
    console.error('Checkout error:', error);
    return NextResponse.json({ error: 'Checkout failed' }, { status: 500 });
  }
}
```

**Step 2: Commit**

```bash
git add src/app/api/checkout/route.ts
git commit -m "feat: add Stripe Checkout session creation endpoint"
```

---

### Task 27: Pricing Page

**Files:**
- Create: `src/app/pricing/page.tsx`

**Step 1: Write the pricing page**

```typescript
// src/app/pricing/page.tsx
'use client';

import { useState } from 'react';

const TIERS = [
  {
    name: 'Ground School',
    slug: 'ground_school',
    price: '$9.99',
    description: 'Get started with AI oral exam practice',
    features: [
      'AI DPE examiner (Claude Sonnet)',
      'Voice mode (Chrome only)',
      'OpenAI TTS voice',
      '30 sessions/month',
      '20 exchanges/session',
    ],
    cta: 'Start Studying',
  },
  {
    name: 'Checkride Prep',
    slug: 'checkride_prep',
    price: '$24.99',
    description: 'Professional-grade voice with all browsers',
    features: [
      'Everything in Ground School',
      'Deepgram Nova-3 STT (all browsers)',
      'Deepgram Aura-2 streaming TTS',
      'Aviation vocabulary recognition',
      '60 sessions/month',
      '30 exchanges/session',
    ],
    popular: true,
    cta: 'Upgrade Now',
  },
  {
    name: 'DPE Live',
    slug: 'dpe_live',
    price: '$49.99',
    description: 'Ultra-realistic DPE simulation',
    features: [
      'Everything in Checkride Prep',
      'Cartesia Sonic-3 ultra-low-latency TTS',
      'Sub-second voice response',
      'Natural speech with emotion',
      'Unlimited sessions',
      '50 exchanges/session',
    ],
    cta: 'Go Premium',
  },
];

export default function PricingPage() {
  const [loading, setLoading] = useState<string | null>(null);

  async function handleSubscribe(tier: string) {
    setLoading(tier);
    try {
      const res = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tier }),
      });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      }
    } catch {
      setLoading(null);
    }
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white py-16 px-4">
      <div className="max-w-5xl mx-auto">
        <h1 className="text-4xl font-bold text-center mb-4">Choose Your Plan</h1>
        <p className="text-gray-400 text-center mb-12 max-w-2xl mx-auto">
          Practice your Private Pilot oral exam with AI. Each tier offers
          progressively better voice quality and more realistic DPE simulation.
        </p>

        <div className="grid md:grid-cols-3 gap-8">
          {TIERS.map((tier) => (
            <div
              key={tier.slug}
              className={`rounded-2xl border p-8 flex flex-col ${
                tier.popular
                  ? 'border-blue-500 bg-gray-900 ring-2 ring-blue-500/50'
                  : 'border-gray-800 bg-gray-900/50'
              }`}
            >
              {tier.popular && (
                <span className="bg-blue-600 text-white text-xs font-bold px-3 py-1 rounded-full self-start mb-4">
                  MOST POPULAR
                </span>
              )}
              <h2 className="text-2xl font-bold mb-1">{tier.name}</h2>
              <p className="text-gray-400 text-sm mb-4">{tier.description}</p>
              <div className="mb-6">
                <span className="text-4xl font-bold">{tier.price}</span>
                <span className="text-gray-500">/month</span>
              </div>

              <ul className="space-y-3 mb-8 flex-1">
                {tier.features.map((feature) => (
                  <li key={feature} className="flex items-start gap-2 text-sm text-gray-300">
                    <span className="text-green-400 mt-0.5">&#10003;</span>
                    {feature}
                  </li>
                ))}
              </ul>

              <button
                onClick={() => handleSubscribe(tier.slug)}
                disabled={loading === tier.slug}
                className={`w-full py-3 rounded-xl font-medium transition-colors ${
                  tier.popular
                    ? 'bg-blue-600 hover:bg-blue-700 text-white'
                    : 'bg-gray-800 hover:bg-gray-700 text-gray-200'
                } disabled:opacity-50`}
              >
                {loading === tier.slug ? 'Redirecting...' : tier.cta}
              </button>
            </div>
          ))}
        </div>

        <p className="text-center text-gray-500 text-sm mt-12">
          This is a study tool and does not replace actual FAA examination. Results are not certified.
        </p>
      </div>
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add src/app/pricing/page.tsx
git commit -m "feat: add pricing page with three-tier comparison"
```

---

### Task 28: Add Tier Display to SessionConfig

**Files:**
- Modify: `src/app/(dashboard)/practice/components/SessionConfig.tsx`

**Step 1: Add tier display**

Add a tier info section above the voice toggle. The tier is read-only (set via subscription).

Add `tier` prop to the component and display the current plan name, provider info, and an upgrade link to `/pricing`.

**Step 2: Update voice toggle label**

- Tier 1: "Voice mode (Chrome only)"
- Tier 2/3: "Voice mode (all browsers)"

**Step 3: Commit**

```bash
git add src/app/(dashboard)/practice/components/SessionConfig.tsx
git commit -m "feat: add tier display and tier-aware voice toggle to SessionConfig"
```

---

### Task 29: Phase 4 Build & Test

**Step 1: Run all tests**

Run: `npx vitest run`
Expected: All tests pass.

**Step 2: Run build**

Run: `npm run build`
Expected: Build succeeds.

---

## Phase 5: Polish & Hardening

### Task 30: Rollback/Fallback Testing

**Files:**
- Modify: `src/lib/voice/provider-factory.ts` (if needed)

**Step 1: Test fallback chain manually**

- Set `DEEPGRAM_API_KEY` to invalid value → verify Tier 2 falls back to OpenAI
- Set `CARTESIA_API_KEY` to invalid value → verify Tier 3 falls back to Deepgram, then OpenAI
- Verify toast notifications appear on fallback

**Step 2: Add fallback logging**

Ensure `usage_logs` captures fallback events with `status: 'error'` and `error_code`.

---

### Task 31: Voice Diagnostics Update

**Files:**
- Modify: `src/app/(dashboard)/settings/page.tsx`

**Step 1: Update diagnostics for tier awareness**

- Show current tier in diagnostics
- For Tier 2/3: test Deepgram STT connection instead of Web Speech API
- For Tier 2/3: test streaming TTS playback instead of MP3 playback
- Show provider names in test results

**Step 2: Commit**

```bash
git add src/app/(dashboard)/settings/page.tsx
git commit -m "feat: update voice diagnostics for tier-aware testing"
```

---

### Task 32: Environment Variables Documentation

**Files:**
- Modify: `.env.example`

**Step 1: Add new environment variables**

```bash
# New — Deepgram (Tier 2/3)
DEEPGRAM_API_KEY=

# New — Cartesia (Tier 3)
CARTESIA_API_KEY=
CARTESIA_VOICE_ID=

# New — Stripe (Billing)
STRIPE_SECRET_KEY=
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=
STRIPE_WEBHOOK_SECRET=

# New — Stripe Price IDs
STRIPE_PRICE_GROUND_SCHOOL=price_xxx
STRIPE_PRICE_CHECKRIDE_PREP=price_xxx
STRIPE_PRICE_DPE_LIVE=price_xxx
```

**Step 2: Commit**

```bash
git add .env.example
git commit -m "docs: add new environment variables for voice tiers and Stripe"
```

---

### Task 33: Final Build & Test

**Step 1: Run all tests**

Run: `npx vitest run`
Expected: All tests pass.

**Step 2: Run full build**

Run: `npm run build`
Expected: Build succeeds with no warnings.

**Step 3: Run lint**

Run: `npm run lint`
Expected: No lint errors.

---

### Task 34: Final Commit & Summary

**Step 1: Review all changes**

Run: `git log --oneline` to see all commits in this branch.

**Step 2: Verify file structure**

Expected new files:
```
src/lib/voice/
├── types.ts
├── usage.ts
├── tier-lookup.ts
├── provider-factory.ts
├── sentence-boundary.ts
└── tts/
    ├── openai-tts.ts
    ├── deepgram-tts.ts
    └── cartesia-tts.ts

src/hooks/
├── useDeepgramSTT.ts
├── useStreamingPlayer.ts
└── useVoiceProvider.ts

src/app/api/
├── stt/
│   ├── token/route.ts
│   └── usage/route.ts
├── user/
│   └── tier/route.ts
├── checkout/route.ts
└── webhooks/
    └── stripe/route.ts

src/app/pricing/page.tsx

public/audio-worklet/
└── pcm-playback-processor.js

supabase/migrations/
└── 20260214000008_voice_tiers.sql

src/lib/__tests__/
├── voice-usage.test.ts
├── provider-factory.test.ts
└── sentence-boundary.test.ts
```

---

*Plan complete. 34 tasks across 5 phases. Each phase builds on the previous one. TDD where applicable. Frequent commits.*
