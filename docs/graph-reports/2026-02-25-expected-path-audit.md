---
title: "Expected Path Audit — 2026-02-25"
date: 2026-02-25
type: graph-audit
tags: [heydpe, knowledge-graph, audit, paths]
---

# Expected Path Audit — 2026-02-25

## Summary

| Metric | Count | Rate |
|--------|-------|------|
| Airspace → NAS path exists | 8/8 | 100% |
| Claims → correct airspace concept | 55/120 | 45.8% |
| Claims → any topic/def/proc | 120/120 | 100.0% |
| Claims → NAS root directly | 120/120 | 100.0% |

## Airspace → NAS Path Check

| Airspace | Concept Found | Path to NAS | Depth | Details |
|----------|---------------|-------------|-------|---------|
| Class A | Yes | PASS | 1 | definition:class-a-airspace-definition-and-requirements |
| Class B | Yes | PASS | 1 | definition:vfr-flyway-vs-vfr-corridor-vs-class-b-vfr-transition-route |
| Class C | Yes | PASS | 1 | definition:class-c-airspace-primary-vs-satellite-airport-operations |
| Class D | Yes | PASS | 1 | topic:class-d-airspace-top-500-feet-release-to-radar-controllers |
| Class E | Yes | PASS | 1 | definition:class-e-airspace-definition-and-vertical-limits |
| Class G | Yes | PASS | 1 | definition:class-g-airspace-definition |
| Special Use Airspace | Yes | PASS | 1 | definition:special-use-airspace-definition-and-chart-depiction |
| Controlled Airspace | Yes | PASS | 2 | definition:controlled-airspace-definition-and-classifications |

## Regulatory Claim → Airspace Concept Linkage

### Aggregate by airspace class

| Airspace Class | Claims Sampled | Linked to Airspace Concept | Linked to Any Topic | Linked to NAS |
|----------------|----------------|---------------------------|---------------------|---------------|
| Class A | 20 | 13 (65%) | 20 (100%) | 20 |
| Class B | 20 | 0 (0%) | 20 (100%) | 20 |
| Class C | 20 | 10 (50%) | 20 (100%) | 20 |
| Class D | 20 | 0 (0%) | 20 (100%) | 20 |
| Class E | 20 | 13 (65%) | 20 (100%) | 20 |
| Class G | 20 | 19 (95%) | 20 (100%) | 20 |

### Missing Edge Examples (claims NOT linked to expected airspace concept)

| Claim | Expected Airspace | Actual Targets |
|-------|-------------------|----------------|
| Aircraft must be equipped with an operable Mode C transponder and ADS-B Out when... | Class A | is_component_of→topic:national-airspace-system, applies_in_scenario→artifact:ac, applies_in_scenario→definition:class-c-airspace-primary-vs-satellite-a, applies_in_scenario→acs_element:PA.VI.B.K4, applies_in_scenario→topic:transponder-altitude-accuracy-14-cfr-part-91, applies_in_scenario→artifact:cfr, applies_in_scenario→topic:ads-b-concept-and-operation, applies_in_scenario→acs_element:CA.III.A.K4, applies_in_scenario→acs_element:CA.VI.B.K4 |
| A recreational pilot may not act as PIC in Class A, B, C, and D airspace, at an ... | Class A | is_component_of→topic:national-airspace-system, applies_in_scenario→acs_element:CA.I.A.S1, applies_in_scenario→acs_element:IR.I.A.S1, applies_in_scenario→artifact:ac, applies_in_scenario→artifact:cfr, applies_in_scenario→acs_element:PA.I.A.S1 |
| For single-place aircraft, pre-solo flight training must be provided in an aircr... | Class A | is_component_of→topic:national-airspace-system, applies_in_scenario→acs_element:IR.II.A.S2, applies_in_scenario→acs_element:PA.VII.A.S4, applies_in_scenario→acs_element:CA.VII.A.S4 |
| Class G airspace is airspace that is not designated in 14 CFR part 71 as Class A... | Class A | applies_in_scenario→definition:class-g-airspace-definition, is_component_of→topic:national-airspace-system, applies_in_scenario→acs_element:PA.I.E.R1, applies_in_scenario→acs_element:CA.I.E.K3, applies_in_scenario→definition:controlled-airspace-definition-and-clas, applies_in_scenario→acs_element:CA.I.E.R1 |
| Airspace that is not designated in 14 CFR part 71 as Class A, Class B, Class C, ... | Class A | is_component_of→topic:national-airspace-system, applies_in_scenario→acs_element:PA.I.E.K1, applies_in_scenario→acs_element:CA.I.E.K1, applies_in_scenario→acs_element:CA.I.E.K3, applies_in_scenario→definition:controlled-airspace-definition-and-clas |
| For domestic, en route, and terminal IFR operations, pilots may use GPS via TSO-... | Class A | is_component_of→topic:national-airspace-system, applies_in_scenario→acs_element:IR.VI.A.K3, applies_in_scenario→acs_element:IR.II.B.K2, applies_in_scenario→acs_element:CA.VI.B.K1 |
| Class G airspace is that portion of airspace that has not been designated as Cla... | Class A | applies_in_scenario→definition:class-g-airspace-definition, is_component_of→topic:national-airspace-system, applies_in_scenario→acs_element:PA.I.E.R1, applies_in_scenario→acs_element:PA.I.E.K1, applies_in_scenario→acs_element:CA.I.E.R1, applies_in_scenario→definition:class-e-airspace-definition-and-vertica |
| Aircraft must be equipped with an operable Mode C transponder and ADS-B Out when... | Class B | is_component_of→topic:national-airspace-system, applies_in_scenario→artifact:ac, applies_in_scenario→definition:class-c-airspace-primary-vs-satellite-a, applies_in_scenario→acs_element:PA.VI.B.K4, applies_in_scenario→topic:transponder-altitude-accuracy-14-cfr-part-91, applies_in_scenario→artifact:cfr, applies_in_scenario→topic:ads-b-concept-and-operation, applies_in_scenario→acs_element:CA.III.A.K4, applies_in_scenario→acs_element:CA.VI.B.K4 |
| Aircraft must be equipped with an operable Mode C transponder and ADS-B Out when... | Class B | is_component_of→topic:national-airspace-system, applies_in_scenario→artifact:ac, applies_in_scenario→definition:class-c-airspace-primary-vs-satellite-a, applies_in_scenario→acs_element:PA.VI.B.K4, applies_in_scenario→topic:transponder-altitude-accuracy-14-cfr-part-91, applies_in_scenario→artifact:cfr, applies_in_scenario→topic:ads-b-concept-and-operation, applies_in_scenario→acs_element:CA.III.A.K4, applies_in_scenario→acs_element:CA.VI.B.K4 |
| When operating to an airport not within a Class B, Class C, or Class D surface a... | Class B | is_component_of→topic:national-airspace-system, applies_in_scenario→acs_element:IR.VI.B.K1, applies_in_scenario→acs_element:IR.VI.B.S10, applies_in_scenario→artifact:ac, applies_in_scenario→acs_element:IR.II.B.K2 |
| Controller responsibility for separation of VFR aircraft practicing instrument a... | Class B | is_component_of→topic:national-airspace-system, applies_in_scenario→acs_element:IR.VII.C.S6, applies_in_scenario→acs_element:IR.III.A.K1, applies_in_scenario→artifact:ac, applies_in_scenario→acs_element:IR.VII.A.S4 |
| The absence of ATC radar does not negate the requirement for an ATC clearance to... | Class B | is_component_of→topic:national-airspace-system, applies_in_scenario→artifact:ac, applies_in_scenario→acs_element:IR.VI.B.S4, applies_in_scenario→acs_element:IR.III.A.R3, applies_in_scenario→acs_element:IR.VI.B.S6 |
| An ATC clearance must be obtained prior to operating within a Class B, Class C, ... | Class B | applies_in_scenario→acs_element:PA.I.E.S1, is_component_of→topic:national-airspace-system, applies_in_scenario→acs_element:IR.III.A.K1, applies_in_scenario→artifact:ac, applies_in_scenario→acs_element:CA.I.E.S1 |
| Special VFR operations by fixed-wing aircraft are prohibited in certain Class B ... | Class B | is_component_of→topic:national-airspace-system, applies_in_scenario→artifact:ac, applies_in_scenario→artifact:cfr, applies_in_scenario→acs_element:PA.I.E.K3, applies_in_scenario→acs_element:CA.I.E.K3, applies_in_scenario→acs_element:CA.I.E.K4 |
| A student pilot seeking a sport pilot certificate may not act as pilot in comman... | Class B | is_component_of→topic:national-airspace-system, applies_in_scenario→acs_element:CA.I.A.S1, applies_in_scenario→artifact:ac, applies_in_scenario→acs_element:PA.I.A.K4, applies_in_scenario→artifact:cfr, applies_in_scenario→acs_element:PA.I.A.S1 |
| During VFR-on-top or VFR conditions clearance operations outside Class B airspac... | Class B | is_component_of→topic:national-airspace-system, applies_in_scenario→acs_element:IR.III.A.K1, applies_in_scenario→artifact:ac, applies_in_scenario→acs_element:IR.VI.B.S4, applies_in_scenario→acs_element:CA.V.B.S5 |
| ATC will provide separation between all aircraft operating on IFR flight plans, ... | Class B | is_component_of→topic:national-airspace-system, applies_in_scenario→acs_element:IR.III.A.K1, applies_in_scenario→acs_element:IR.III.A.R4, applies_in_scenario→artifact:ac, applies_in_scenario→acs_element:IR.III.A.R3 |
| In airspace underlying a Class B airspace area designated for an airport, or in ... | Class B | is_component_of→topic:national-airspace-system, applies_in_scenario→acs_element:CA.V.B.R7, applies_in_scenario→artifact:ac, applies_in_scenario→acs_element:PA.IX.A.K3, applies_in_scenario→artifact:cfr, applies_in_scenario→acs_element:CA.III.B.S5 |
| A student pilot must receive ground and flight training for the specific Class B... | Class B | is_component_of→topic:national-airspace-system, applies_in_scenario→acs_element:PA.I.E.K1, applies_in_scenario→artifact:ac, applies_in_scenario→artifact:cfr, applies_in_scenario→acs_element:CA.I.E.K1, applies_in_scenario→acs_element:PA.I.E.K3 |
| A student pilot seeking a sport or recreational pilot certificate must receive a... | Class B | applies_in_scenario→acs_element:CA.I.A.K4, is_component_of→topic:national-airspace-system, applies_in_scenario→artifact:ac, applies_in_scenario→artifact:cfr, applies_in_scenario→acs_element:CA.I.B.K1, applies_in_scenario→acs_element:PA.I.B.K1 |

## Suggested Auto-Fix Strategy

The core problem: **regulatory claims link to ACS elements and the NAS root, but NOT to the specific airspace class topic/definition nodes they reference.**

### Fix pattern 1: Claim → Airspace concept (deterministic)
For each regulatory claim whose name mentions "Class X airspace":
- Find the definition/topic node for that airspace class
- Create `applies_in_scenario` edge from claim → airspace concept
- Confidence: 0.95 (keyword match on claim text)

### Fix pattern 2: Taxonomy-based attachment
Classify source chunks into a topic taxonomy, then attach concepts to taxonomy nodes based on their evidence chunks.

### Fix pattern 3: LLM edge inference with focused batches
Re-run `infer-edges.ts --strategy llm` with batches organized by topic (all airspace concepts together) instead of random sampling.

*Generated by `npm run graph:audit:paths`*