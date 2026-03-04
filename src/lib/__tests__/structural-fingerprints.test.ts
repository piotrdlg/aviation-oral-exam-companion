/**
 * Tests for structural taxonomy fingerprints.
 * Phase 9 — Flow Coherence Activation
 */
import { describe, it, expect } from 'vitest';
import {
  parseElementCode,
  buildStructuralFingerprints,
  computeFingerprintStats,
} from '../structural-fingerprints';

// ================================================================
// parseElementCode
// ================================================================

describe('parseElementCode', () => {
  it('parses a private pilot knowledge element', () => {
    const result = parseElementCode('PA.I.A.K1');
    expect(result).toEqual({
      prefix: 'PA',
      rating: 'private',
      area: 'I',
      task: 'A',
      elementType: 'K',
      elementNum: 1,
    });
  });

  it('parses a commercial risk management element', () => {
    const result = parseElementCode('CA.III.B.R2');
    expect(result).toEqual({
      prefix: 'CA',
      rating: 'commercial',
      area: 'III',
      task: 'B',
      elementType: 'R',
      elementNum: 2,
    });
  });

  it('parses an instrument rating element', () => {
    const result = parseElementCode('IR.V.A.K3');
    expect(result).toEqual({
      prefix: 'IR',
      rating: 'instrument',
      area: 'V',
      task: 'A',
      elementType: 'K',
      elementNum: 3,
    });
  });

  it('parses a skill element', () => {
    const result = parseElementCode('PA.IV.A.S1');
    expect(result).toEqual({
      prefix: 'PA',
      rating: 'private',
      area: 'IV',
      task: 'A',
      elementType: 'S',
      elementNum: 1,
    });
  });

  it('returns null for invalid format', () => {
    expect(parseElementCode('PA.I.A')).toBeNull();
    expect(parseElementCode('PA.I.A.K1.extra')).toBeNull();
    expect(parseElementCode('')).toBeNull();
    expect(parseElementCode('XX.I.A.K1')).toBeNull();
    expect(parseElementCode('PA.I.A.X1')).toBeNull();
  });
});

// ================================================================
// buildStructuralFingerprints
// ================================================================

describe('buildStructuralFingerprints', () => {
  it('returns non-empty fingerprints for valid element codes', () => {
    const codes = ['PA.I.A.K1', 'PA.I.A.K2', 'PA.III.A.K1'];
    const fps = buildStructuralFingerprints(codes);

    expect(fps.size).toBe(3);
    expect(fps.get('PA.I.A.K1')!.size).toBeGreaterThan(0);
    expect(fps.get('PA.I.A.K2')!.size).toBeGreaterThan(0);
    expect(fps.get('PA.III.A.K1')!.size).toBeGreaterThan(0);
  });

  it('same-area elements share most fingerprint slugs', () => {
    const codes = ['PA.I.A.K1', 'PA.I.B.K1'];
    const fps = buildStructuralFingerprints(codes);

    const fp1 = fps.get('PA.I.A.K1')!;
    const fp2 = fps.get('PA.I.B.K1')!;

    // Count shared slugs (excluding task-specific tags)
    let shared = 0;
    for (const slug of fp1) {
      if (fp2.has(slug)) shared++;
    }

    // Should share topic: and area: slugs, not task: slugs
    expect(shared).toBeGreaterThan(5);
  });

  it('different-area elements share fewer slugs', () => {
    const codes = ['PA.I.A.K1', 'PA.IX.A.K1'];
    const fps = buildStructuralFingerprints(codes);

    const fp1 = fps.get('PA.I.A.K1')!;
    const fp2 = fps.get('PA.IX.A.K1')!;

    let shared = 0;
    for (const slug of fp1) {
      if (fp2.has(slug)) shared++;
    }
    const union = fp1.size + fp2.size - shared;
    const jaccard = union > 0 ? shared / union : 0;

    // Different areas should have lower similarity than same-area
    expect(jaccard).toBeLessThan(0.5);
  });

  it('cross-area keyword bridges exist (e.g. weather in Area I and VII)', () => {
    const codes = ['PA.I.A.K1', 'PA.VII.A.K1'];
    const fps = buildStructuralFingerprints(codes);

    const fp1 = fps.get('PA.I.A.K1')!;
    const fp7 = fps.get('PA.VII.A.K1')!;

    // Both areas should have "topic:weather"
    expect(fp1.has('topic:weather')).toBe(true);
    expect(fp7.has('topic:weather')).toBe(true);
  });

  it('includes area, task, and element type structural tags', () => {
    const fps = buildStructuralFingerprints(['PA.III.B.R2']);
    const fp = fps.get('PA.III.B.R2')!;

    expect(fp.has('area:III')).toBe(true);
    expect(fp.has('task:PA.III.B')).toBe(true);
    expect(fp.has('etype:risk')).toBe(true);
  });

  it('knowledge elements get etype:knowledge tag', () => {
    const fps = buildStructuralFingerprints(['PA.I.A.K1']);
    expect(fps.get('PA.I.A.K1')!.has('etype:knowledge')).toBe(true);
  });

  it('uses instrument-specific keywords for IR elements', () => {
    const codes = ['IR.V.A.K1'];
    const fps = buildStructuralFingerprints(codes);
    const fp = fps.get('IR.V.A.K1')!;

    // IR Area V = Navigation Systems (not VFR performance maneuvers)
    expect(fp.has('topic:vor')).toBe(true);
    expect(fp.has('topic:gps')).toBe(true);
    expect(fp.has('topic:rnav')).toBe(true);
  });

  it('PA Area V uses VFR maneuver keywords (not instrument nav)', () => {
    const codes = ['PA.VII.A.K1']; // PA Area VII = Slow Flight and Stalls
    const fps = buildStructuralFingerprints(codes);
    const fp = fps.get('PA.VII.A.K1')!;

    // PA Area VII = Emergency Operations with VFR keywords
    expect(fp.has('topic:emergency')).toBe(true);
  });

  it('skips unparseable element codes', () => {
    const codes = ['PA.I.A.K1', 'INVALID', 'PA.III.A.K1'];
    const fps = buildStructuralFingerprints(codes);

    expect(fps.size).toBe(2);
    expect(fps.has('PA.I.A.K1')).toBe(true);
    expect(fps.has('INVALID')).toBe(false);
    expect(fps.has('PA.III.A.K1')).toBe(true);
  });

  it('handles empty input', () => {
    const fps = buildStructuralFingerprints([]);
    expect(fps.size).toBe(0);
  });

  it('produces fingerprints for all three ratings', () => {
    const codes = ['PA.I.A.K1', 'CA.I.A.K1', 'IR.I.A.K1'];
    const fps = buildStructuralFingerprints(codes);

    expect(fps.size).toBe(3);
    // All should have area:I since they're all Area I
    expect(fps.get('PA.I.A.K1')!.has('area:I')).toBe(true);
    expect(fps.get('CA.I.A.K1')!.has('area:I')).toBe(true);
    expect(fps.get('IR.I.A.K1')!.has('area:I')).toBe(true);
  });
});

// ================================================================
// computeFingerprintStats
// ================================================================

describe('computeFingerprintStats', () => {
  it('computes correct coverage stats', () => {
    const codes = ['PA.I.A.K1', 'PA.III.A.K1', 'INVALID'];
    const fps = buildStructuralFingerprints(codes);
    const stats = computeFingerprintStats(codes, fps);

    expect(stats.totalElements).toBe(3);
    expect(stats.elementsWithFingerprints).toBe(2);
    expect(stats.elementsWithoutFingerprints).toBe(1);
    expect(stats.coveragePercent).toBeCloseTo(66.7, 0);
    expect(stats.avgFingerprintSize).toBeGreaterThan(0);
    expect(stats.uniqueSlugs).toBeGreaterThan(0);
    expect(stats.unparseable).toEqual(['INVALID']);
  });

  it('handles 100% coverage', () => {
    const codes = ['PA.I.A.K1', 'PA.III.A.K1'];
    const fps = buildStructuralFingerprints(codes);
    const stats = computeFingerprintStats(codes, fps);

    expect(stats.coveragePercent).toBe(100);
    expect(stats.unparseable).toEqual([]);
  });

  it('handles empty input', () => {
    const stats = computeFingerprintStats([], new Map());
    expect(stats.totalElements).toBe(0);
    expect(stats.coveragePercent).toBe(0);
  });
});
