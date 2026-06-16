import { vi } from 'vitest';

// `server-only` throws when imported outside an RSC/server context. Several
// server modules (lib/supabase/auth.ts, lib/session-enforcement.ts, …) import it
// as a guard; stub it globally so route/unit tests can import those modules
// without each test re-declaring the mock. Test-only — never affects the build.
vi.mock('server-only', () => ({}));
