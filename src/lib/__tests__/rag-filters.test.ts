import { describe, it, expect } from 'vitest';
import { inferRagFilters } from '../rag-filters';

describe('inferRagFilters', () => {
  // --- CFR / FAR / Part signals ---

  it('returns filterDocType cfr for "14 CFR" with section number', () => {
    expect(
      inferRagFilters({ examinerQuestion: 'What does 14 CFR 91.155 say about VFR minimums?' })
    ).toEqual({ filterDocType: 'cfr' });
  });

  it('does NOT force CFR for bare "14 CFR" without part/section', () => {
    // airspace-001 regression fix: casual "14 CFR" mention should not force CFR
    expect(
      inferRagFilters({ examinerQuestion: 'Under 14 CFR what are the airspace classifications?' })
    ).toBeNull();
  });

  it('returns filterDocType cfr for "14 CFR Part 91"', () => {
    expect(
      inferRagFilters({ examinerQuestion: 'What does 14 CFR Part 91 require for VFR flight?' })
    ).toEqual({ filterDocType: 'cfr' });
  });

  it('returns filterDocType cfr for bare section number "91.155"', () => {
    expect(
      inferRagFilters({ examinerQuestion: 'What are VFR minimums per 91.155?' })
    ).toEqual({ filterDocType: 'cfr' });
  });

  it('returns filterDocType cfr for bare section number "61.57"', () => {
    expect(
      inferRagFilters({ studentAnswer: 'According to 61.57 I need three takeoffs.' })
    ).toEqual({ filterDocType: 'cfr' });
  });

  it('returns filterDocType cfr for "FAR" reference', () => {
    expect(
      inferRagFilters({ examinerQuestion: 'FAR 91.213 inoperative equipment' })
    ).toEqual({ filterDocType: 'cfr' });
  });

  it('returns filterDocType cfr for Part reference with number', () => {
    expect(
      inferRagFilters({ examinerQuestion: 'What currency requirements under Part 61?' })
    ).toEqual({ filterDocType: 'cfr' });
  });

  it('returns filterDocType cfr for section symbol reference §', () => {
    expect(
      inferRagFilters({ studentAnswer: 'According to § 91.205 the aircraft must have...' })
    ).toEqual({ filterDocType: 'cfr' });
  });

  // --- AIM signals ---

  it('returns filterAbbreviation aim for "AIM" as word boundary', () => {
    expect(
      inferRagFilters({ examinerQuestion: 'According to the AIM, what is the definition of a NOTAM?' })
    ).toEqual({ filterAbbreviation: 'aim' });
  });

  it('returns filterAbbreviation aim for mixed case AIM usage', () => {
    expect(
      inferRagFilters({ examinerQuestion: 'AIM Chapter 7 covers wake turbulence safety' })
    ).toEqual({ filterAbbreviation: 'aim' });
  });

  // --- PHAK signals ---

  it('returns filterAbbreviation phak for "PHAK" reference', () => {
    expect(
      inferRagFilters({ studentAnswer: 'The PHAK discusses four forces of flight' })
    ).toEqual({ filterAbbreviation: 'phak' });
  });

  it('returns filterAbbreviation phak for "Pilot\'s Handbook" text', () => {
    expect(
      inferRagFilters({ examinerQuestion: "Refer to the Pilot's Handbook chapter on aerodynamics." })
    ).toEqual({ filterAbbreviation: 'phak' });
  });

  // --- AFH signals ---

  it('returns filterAbbreviation afh for "AFH" reference', () => {
    expect(
      inferRagFilters({ examinerQuestion: 'The AFH describes crosswind landing technique.' })
    ).toEqual({ filterAbbreviation: 'afh' });
  });

  it('returns filterAbbreviation afh for "Airplane Flying Handbook" text', () => {
    expect(
      inferRagFilters({ studentAnswer: 'The Airplane Flying Handbook covers ground reference maneuvers.' })
    ).toEqual({ filterAbbreviation: 'afh' });
  });

  // --- No filter cases ---

  it('returns null for generic question with no regulatory signals', () => {
    expect(
      inferRagFilters({ examinerQuestion: 'Tell me about stalls' })
    ).toBeNull();
  });

  it('returns null for completely empty context', () => {
    expect(inferRagFilters({})).toBeNull();
  });

  it('returns null for undefined/missing fields', () => {
    expect(
      inferRagFilters({ taskId: undefined, elementCode: undefined })
    ).toBeNull();
  });

  it('returns null for empty string inputs', () => {
    expect(
      inferRagFilters({ examinerQuestion: '', studentAnswer: '' })
    ).toBeNull();
  });

  it('returns null for whitespace-only text', () => {
    expect(
      inferRagFilters({ examinerQuestion: '   ', studentAnswer: '  ' })
    ).toBeNull();
  });

  it('returns null for casual flight question with no document signals', () => {
    expect(
      inferRagFilters({ examinerQuestion: 'Explain the effect of density altitude on performance.' })
    ).toBeNull();
  });

  // --- Precedence: PHAK/AFH/AIM take priority over generic CFR if both present ---

  it('returns filterAbbreviation phak even when CFR is also mentioned', () => {
    // PHAK is checked before CFR in the implementation
    expect(
      inferRagFilters({ examinerQuestion: 'PHAK section 3 references 14 CFR requirements.' })
    ).toEqual({ filterAbbreviation: 'phak' });
  });

  it('returns filterAbbreviation aim even when a Part number appears', () => {
    // AIM is checked before CFR in the implementation
    expect(
      inferRagFilters({ examinerQuestion: 'According to the AIM, Part 91 VFR cloud clearances...' })
    ).toEqual({ filterAbbreviation: 'aim' });
  });

  it('does not force CFR when AIM airspace content mentions "14 CFR" casually', () => {
    // AIM reference should take precedence; bare "14 CFR" no longer triggers CFR
    expect(
      inferRagFilters({ examinerQuestion: 'The AIM describes airspace under 14 CFR.' })
    ).toEqual({ filterAbbreviation: 'aim' });
  });

  // --- Multi-field combination ---

  it('matches across combined fields (taskId + examinerQuestion with Part number)', () => {
    expect(
      inferRagFilters({
        taskId: 'PA.I.A',
        examinerQuestion: 'What does 14 CFR Part 91 require for VFR flight?',
      })
    ).toEqual({ filterDocType: 'cfr' });
  });

  it('matches FAR in studentAnswer field', () => {
    expect(
      inferRagFilters({ studentAnswer: 'Under FAR 61.57 I need three takeoffs and landings.' })
    ).toEqual({ filterDocType: 'cfr' });
  });

  // --- Regulatory keyword signals ---

  it('returns filterDocType cfr for "currency" keyword', () => {
    expect(
      inferRagFilters({ examinerQuestion: 'What are the currency requirements to carry passengers?' })
    ).toEqual({ filterDocType: 'cfr' });
  });

  it('returns filterDocType cfr for "medical" keyword', () => {
    expect(
      inferRagFilters({ examinerQuestion: 'When does a medical certificate expire?' })
    ).toEqual({ filterDocType: 'cfr' });
  });

  it('returns filterDocType cfr for "logbook" keyword', () => {
    expect(
      inferRagFilters({ examinerQuestion: 'What logbook endorsements are required for a solo flight?' })
    ).toEqual({ filterDocType: 'cfr' });
  });

  // --- Compound "certificate" patterns (standalone removed to fix airspace false-positive) ---

  it('returns filterDocType cfr for "airworthiness certificate"', () => {
    expect(
      inferRagFilters({ examinerQuestion: 'An airworthiness certificate must be displayed in the aircraft.' })
    ).toEqual({ filterDocType: 'cfr' });
  });

  it('returns filterDocType cfr for "registration certificate"', () => {
    expect(
      inferRagFilters({ examinerQuestion: 'Registration certificates must be renewed every 3 years.' })
    ).toEqual({ filterDocType: 'cfr' });
  });

  it('does NOT force CFR for "private pilot certificate" alone (airspace-001 fix)', () => {
    // "certificate" as qualifier in airspace context should not trigger CFR
    expect(
      inferRagFilters({
        examinerQuestion: 'Class B airspace requires a private pilot certificate or student pilot endorsement',
      })
    ).toBeNull();
  });

  // --- "AIM" must be word boundary, not substring ---

  it('does not match "claim" as AIM', () => {
    expect(
      inferRagFilters({ examinerQuestion: 'The pilot can claim exemption under the old rule.' })
    ).toBeNull();
  });
});
