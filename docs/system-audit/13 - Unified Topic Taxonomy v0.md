---
title: "Unified Topic Taxonomy v0"
date: 2026-02-25
type: system-audit
tags: [heydpe, taxonomy, knowledge-graph, audit]
status: draft
evidence_level: medium
---

# 13 — Unified Topic Taxonomy v0

**Generated:** 2026-02-25
**Source:** PDF TOC extraction via PyMuPDF + 9 domain root anchors

---

## Stats

| Level | Count |
|-------|-------|
| L1 (Domain Roots) | 9 |
| L2 (Sections) | 701 |
| L3 (Subsections) | 990 |
| **Total** | **1700** |

## Document Contributions

| Document | Nodes Contributed |
|----------|-------------------|
| ac — Advisory Circulars | 1059 |
| awh — Aviation Weather Handbook (FAA-H-8083-28A) | 480 |
| acs — Airman Certification Standards | 271 |
| wbh — Weight & Balance Handbook (FAA-H-8083-1B) | 168 |
| rmh — Risk Management Handbook (FAA-H-8083-2A) | 121 |
| aim — Aeronautical Information Manual | 73 |
| phak — Pilot's Handbook of Aeronautical Knowledge (FAA-H-8083-25B) | 39 |
| afh — Airplane Flying Handbook (FAA-H-8083-3C) | 21 |
| iph — Instrument Procedures Handbook (FAA-H-8083-16B) | 14 |

## Domain Root Distribution

| Domain Root | L2 Children | L3 Children |
|-------------|-------------|-------------|
| National Airspace System | 430 | 361 |
| Aviation Weather | 115 | 226 |
| Aircraft Systems and Performance | 10 | 0 |
| Navigation and Flight Planning | 82 | 106 |
| Regulations and Compliance | 69 | 0 |
| Flight Operations and Procedures | 67 | 16 |
| Aerodynamics and Principles of Flight | 44 | 80 |
| Human Factors and ADM | 26 | 25 |
| Instrument Flying | 16 | 6 |

## Duplicate Clusters (same topic across multiple documents)

Found 2 topics appearing in multiple documents:

| Topic | Documents |
|-------|-----------|
| CHAPTER 1. GENERAL INFORMATION | ac, rmh |
| General | acs, aim |

## Missing Coverage ("Doesn't Fit" Bucket)

The following document groups had **zero TOC entries** extracted:

- **ifh**: PDF has no bookmarks/TOC. Will need manual chapter headings or LLM extraction.
- **cfr**: PDF has no bookmarks/TOC. Will need manual chapter headings or LLM extraction.

Topics that may not fit existing domain roots:
- Canadian airspace rules
- UAS/drone regulations (Part 107)
- Sport pilot / recreational pilot specifics
- Ground instructor topics

These should be added as the taxonomy is refined.

## Sample L2 Nodes

| Slug | Title | Parent |
|------|-------|--------|
| tax:1-1-purpose-of-this-advisory-circular-ac-this-ac-describes-how-to-use-a-continuo | 1.1 Purpose of This Advisory Circular (AC). This AC describes how to use a continuous descent final approach (CDFA) technique on a Nonprecision Approach (NPA), as well as recommended general procedures and training guidelines for implementing CDFA as | tax:national-airspace-system |
| tax:1-2-audience-the-information-in-this-ac-applies-to-all-operators-conducting-cdfa | 1.2 Audience. The information in this AC applies to all operators conducting CDFA operations under Title 14 of the Code of Federal Regulations (14 CFR) parts 91, 91 subpart K (part 91K), 121, 125, and 135 within the U.S. National Airspace System (NAS) | tax:national-airspace-system |
| tax:1-3-where-you-can-find-this-ac-you-can-find-this-ac-on-the-federal-aviation-admi | 1.3 Where You Can Find This AC. You can find this AC on the Federal Aviation Administration’s (FAA) website at https://www.faa.gov/regulations_policies/advisory_circulars and the Dynamic Regulatory System (DRS) at https://drs.faa.gov | tax:national-airspace-system |
| tax:1-4-what-this-ac-cancels-ac-120-108-continuous-descent-final-approach-dated-janu | 1.4 What This AC Cancels. AC 120-108, Continuous Descent Final Approach, dated January 20, 2011, is canceled | tax:national-airspace-system |
| tax:1-5-related-14-cfr-regulations | 1.5 Related 14 CFR Regulations | tax:national-airspace-system |
| tax:1-6-related-reading-material-current-editions-the-majority-of-the-document-refer | 1.6 Related Reading Material (current editions). The majority of the document references in this AC are from the most current version as designated by parentheses ( ) placed at the end of the document title. In some cases, a letter will indicate the a | tax:national-airspace-system |
| tax:1-7-ac-feedback-form-for-your-convenience-the-ac-feedback-form-is-the-last-page- | 1.7 AC Feedback Form. For your convenience, the AC Feedback Form is the last page of this AC. Note any deficiencies found, clarifications needed, or suggested improvements regarding the contents of this AC on the Feedback Form | tax:national-airspace-system |
| tax:2-1-npas-current-npas-are-designed-with-and-without-step-down-fixes-in-the-final | 2.1 NPAs. Current NPAs are designed with and without step-down fixes in the Final Approach Segment (FAS). NPAs designed without step-down fixes in the FAS allow for an immediate descent to the minimum descent altitude (MDA) after crossing the final ap | tax:national-airspace-system |
| tax:2-2-stabilized-approaches-a-stabilized-approach-is-a-key-feature-to-a-safe-appro | 2.2 Stabilized Approaches. A stabilized approach is a key feature to a safe approach and landing. Operators are encouraged to use the stabilized approach concept (refer to AC 91-79( )) to help eliminate controlled flights into terrain (CFIT). AC 91-79 | tax:national-airspace-system |
| tax:2-3-approach-designs-and-continuous-descent-a-precision-instrument-approach-proc | 2.3 Approach Designs and Continuous Descent. A precision instrument approach procedure (IAP) (e.g., instrument landing system (ILS) and Ground Based Augmentation System (GBAS) Landing System (GLS)) and some NPA Area Navigation (RNAV) Global Positionin | tax:national-airspace-system |
| tax:2-4-definition-of-cdfa-cdfa-is-a-technique-for-flying-the-fas-of-a-npa-as-a-cont | 2.4 Definition of CDFA. CDFA is a technique for flying the FAS of a NPA as a continuous descent. The technique is consistent with stabilized approach procedures and has no level off. A CDFA starts from an altitude/height at or above the FAF and procee | tax:national-airspace-system |
| tax:2-5-advantages-of-cdfa-the-following-is-a-list-of-benefits-that-operators-may-re | 2.5 Advantages of CDFA. The following is a list of benefits that operators may realize when using a CDFA technique versus not using it: | tax:national-airspace-system |
| tax:2-6-approved-npas-the-faa-recommends-accomplishing-a-cdfa-on-all-of-the-followin | 2.6 Approved NPAs. The FAA recommends accomplishing a CDFA on all of the following published NPAs: | tax:national-airspace-system |
| tax:3-1-equipment-requirements-a-cdfa-does-not-require-specific-aircraft-equipment-h | 3.1 Equipment Requirements. A CDFA does not require specific aircraft equipment; however, the aircraft must be equipped to accomplish the NPA procedure. Pilots can safely fly NPAs with a CDFA using basic piloting techniques, aircraft flight management | tax:national-airspace-system |
| tax:3-2-approach-requirements-a-cdfa-may-be-flown-on-any-npa-there-are-no-specific-a | 3.2 Approach Requirements. A CDFA may be flown on any NPA. There are no specific approach requirements nor any requirement for a vertical descent angle (VDA), glide path (GP), or visual descent point (VDP) to be published on an IAP in order to fly a C | tax:national-airspace-system |
| tax:3-3-vda-design-a-vda-is-calculated-from-the-faf-altitude-to-the-threshold-crossi | 3.3 VDA Design. A VDA is calculated from the FAF altitude to the threshold crossing height (TCH) altitude. It is published on the IAP with the VDA symbol . The optimum VDA is 3.0 . The minimum VDA is 2.75 . Table 3-1 below provides the maximum VDAs fo | tax:national-airspace-system |
| tax:3-4-rate-of-descent-discussion-u-s-government-and-private-flight-information-pub | 3.4 Rate of Descent Discussion. U.S. Government and private flight information publications offer a pilot a way to compute a rate of descent in feet per minute (fpm) from a descent angle (degrees) and/or a descent gradient (feet per nautical mile (NM) | tax:national-airspace-system |
| tax:3-5-calculating-a-descent-point-for-a-step-down-fix-associated-with-a-vda-publis | 3.5 Calculating a Descent Point for a Step-Down Fix Associated with a VDA Published Between the Step-Down Fix and Runway. When the charted VDA is between the step-down fix and the runway, beginning a normal CDFA descent at the FAF may result in the ai | tax:national-airspace-system |
| tax:3-6-timing-dependent-approaches-control-of-airspeed-and-rate-of-descent-is-parti | 3.6 Timing-Dependent Approaches. Control of airspeed and rate of descent is particularly important on approaches dependent on timing to identify the MAP. Pilots should cross the FAF at the final approach speed and be configured for landing | tax:national-airspace-system |
| tax:3-7-derived-da-dda-pilots-must-not-descend-below-the-mda-when-executing-a-missed | 3.7 Derived DA (DDA). Pilots must not descend below the MDA when executing a missed approach from a CDFA. Pilots must initiate a go-around at an altitude above the MDA (sometimes referred to as a DDA) to ensure the aircraft does not descend below the | tax:national-airspace-system |
| tax:3-8-decision-approaching-mda-flying-the-published-vda-will-have-the-aircraft-int | 3.8 Decision Approaching MDA. Flying the published VDA will have the aircraft intersect the MDA at a point before the MAP. Approaching the MDA, the pilot has two choices: continue the descent to land with required visual references, or execute a misse | tax:national-airspace-system |
| tax:3-9-executing-a-missed-approach-prior-to-map-when-executing-a-missed-approach-pr | 3.9 Executing a Missed Approach Prior to MAP. When executing a missed approach prior to the MAP and not cleared for an air traffic control (ATC) climbout instruction, fly the published missed approach procedure. Proceed on track to the MAP before acco | tax:national-airspace-system |
| tax:3-10-approaches-with-a-vdp-a-vdp-see-figure-3-6-below-is-shown-by-a-bold-letter- | 3.10 Approaches With a VDP. A VDP (see Figure 3-6 below) is shown by a bold letter “V” positioned above the procedure track. The VDP is a defined point on the final approach course of a nonprecision straight-in approach procedure from which a normal d | tax:national-airspace-system |
| tax:3-11-quick-reference-aircraft-height-distance-and-rate-of-descent-techniques-thi | 3.11 Quick-Reference Aircraft Height, Distance, and Rate of Descent Techniques. This paragraph discusses how to determine an aircraft’s height above the ground at a certain distance from the runway and at a desired rate of descent. This will help oper | tax:national-airspace-system |
| tax:4-1-use-of-cdfa-using-a-cdfa-on-a-suitable-npa-should-be-an-sop-operators-who-us | 4.1 Use of CDFA. Using a CDFA on a suitable NPA should be an SOP. Operators who use a CDFA technique on NPAs should incorporate CDFA training into their training programs where NPAs are performed and evaluated. This AC does not recommend one technique | tax:national-airspace-system |

---

*Generated by build_unified_taxonomy.ts*