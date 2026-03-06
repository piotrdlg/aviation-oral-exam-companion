import { describe, it, expect } from 'vitest';
import { existsSync } from 'fs';
import { resolve } from 'path';

/**
 * Voice stack contract tests — Phase 2 regression guards.
 *
 * These tests verify the structural invariants of the voice fix:
 * 1. Dead code (voice-integration.ts) is removed
 * 2. Retry constants are within safe bounds
 * 3. CSP report endpoint exists
 * 4. Voice telemetry module exports expected interface
 * 5. useDeepgramSTT exports isRetrying field
 */

describe('dead code removal', () => {
  it('voice-integration.ts no longer exists', () => {
    const filePath = resolve(__dirname, '../../lib/voice-integration.ts');
    expect(existsSync(filePath)).toBe(false);
  });

  it('voice-integration.ts is not re-exported from any barrel', () => {
    // If someone re-creates the file or re-exports it, this catches it
    expect(() => require('../voice-integration')).toThrow();
  });
});

describe('STT retry contract', () => {
  // Read the source file to verify constants without importing the hook
  // (hook requires browser APIs that aren't available in node)
  it('MAX_ATTEMPTS is exactly 2 (initial + 1 retry)', async () => {
    const fs = await import('fs');
    const source = fs.readFileSync(
      resolve(__dirname, '../../hooks/useDeepgramSTT.ts'),
      'utf-8',
    );
    const match = source.match(/const MAX_ATTEMPTS\s*=\s*(\d+)/);
    expect(match).not.toBeNull();
    expect(parseInt(match![1], 10)).toBe(2);
  });

  it('RETRY_DELAY_MS is between 1000 and 5000', async () => {
    const fs = await import('fs');
    const source = fs.readFileSync(
      resolve(__dirname, '../../hooks/useDeepgramSTT.ts'),
      'utf-8',
    );
    const match = source.match(/const RETRY_DELAY_MS\s*=\s*(\d+)/);
    expect(match).not.toBeNull();
    const delay = parseInt(match![1], 10);
    expect(delay).toBeGreaterThanOrEqual(1000);
    expect(delay).toBeLessThanOrEqual(5000);
  });

  it('hook tracks userStopped to prevent retry after deliberate stop', async () => {
    const fs = await import('fs');
    const source = fs.readFileSync(
      resolve(__dirname, '../../hooks/useDeepgramSTT.ts'),
      'utf-8',
    );
    expect(source).toContain('userStoppedRef');
    expect(source).toContain('userStoppedRef.current = true');
  });

  it('retry loop checks userStopped before each attempt', async () => {
    const fs = await import('fs');
    const source = fs.readFileSync(
      resolve(__dirname, '../../hooks/useDeepgramSTT.ts'),
      'utf-8',
    );
    // The retry loop should check userStoppedRef inside the for loop body
    const forLoopMatch = source.match(
      /for \(let attempt[\s\S]*?if \(userStoppedRef\.current\) return/,
    );
    expect(forLoopMatch).not.toBeNull();
  });

  it('exports isRetrying field for UI consumption', async () => {
    const fs = await import('fs');
    const source = fs.readFileSync(
      resolve(__dirname, '../../hooks/useDeepgramSTT.ts'),
      'utf-8',
    );
    // Check the return object includes isRetrying
    expect(source).toContain('isRetrying');
    // Check it's in the return statement
    const returnBlock = source.slice(source.lastIndexOf('return {'));
    expect(returnBlock).toContain('isRetrying');
  });
});

describe('CSP report endpoint exists', () => {
  it('csp-report route.ts file exists', () => {
    const filePath = resolve(__dirname, '../../app/api/csp-report/route.ts');
    expect(existsSync(filePath)).toBe(true);
  });

  it('csp-report route exports POST handler', async () => {
    const fs = await import('fs');
    const source = fs.readFileSync(
      resolve(__dirname, '../../app/api/csp-report/route.ts'),
      'utf-8',
    );
    expect(source).toContain('export async function POST');
  });

  it('csp-report returns 204 (no content)', async () => {
    const fs = await import('fs');
    const source = fs.readFileSync(
      resolve(__dirname, '../../app/api/csp-report/route.ts'),
      'utf-8',
    );
    expect(source).toContain('204');
  });
});

describe('voice telemetry module interface', () => {
  it('exports captureVoiceEvent function', async () => {
    // Dynamic import to avoid 'use client' issues
    const mod = await import('../voice-telemetry');
    expect(typeof mod.captureVoiceEvent).toBe('function');
  });
});

describe('voice provider passes through isRetrying', () => {
  it('useVoiceProvider.ts references isRetrying from deepgramSTT', async () => {
    const fs = await import('fs');
    const source = fs.readFileSync(
      resolve(__dirname, '../../hooks/useVoiceProvider.ts'),
      'utf-8',
    );
    expect(source).toContain('deepgramSTT.isRetrying');
    expect(source).toContain('isRetrying');
  });
});
