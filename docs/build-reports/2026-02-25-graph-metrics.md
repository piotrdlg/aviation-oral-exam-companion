---
title: "Knowledge Graph Metrics — 2026-02-25"
date: 2026-02-25
type: graph-metrics
tags: [heydpe, knowledge-graph, metrics, audit]
environment: production
---

# Knowledge Graph Metrics — 2026-02-25

> Generated: 2026-02-25T21:18:40.320Z
> Environment: production

---

## 1. Counts

### Concepts by Category
| Category | Count | % |
|----------|-------|---|
| regulatory_claim | 8,417 | 38.1% |
| topic | 5,001 | 22.6% |
| procedure | 3,350 | 15.2% |
| definition | 2,850 | 12.9% |
| acs_element | 2,174 | 9.8% |
| acs_task | 143 | 0.6% |
| artifact | 118 | 0.5% |
| acs_area | 31 | 0.1% |
| **TOTAL** | **22,084** | |

### Relations by Type
| Type | Count | % |
|------|-------|---|
| applies_in_scenario | 26,997 | 53.6% |
| leads_to_discussion_of | 20,461 | 40.6% |
| is_component_of | 2,953 | 5.9% |
| **TOTAL** | **50,411** | |

### Evidence Coverage
| Metric | Value |
|--------|-------|
| Total evidence links | 30,689 |
| Concepts with evidence | 21,783 |
| Coverage ratio | 98.64% |

---

## 2. Orphan Analysis

> [!risk] 196 orphan concepts (0.9% of total)

### Orphans by Category
| Category | Orphan Count |
|----------|-------------|
| topic | 81 |
| definition | 69 |
| procedure | 42 |
| artifact | 4 |

### Sample Orphans (first 50)
| Category | Name |
|----------|------|
| artifact | Chart Supplement SE |
| artifact | FAA-S-ACS-7B Commercial Pilot ACS |
| artifact | PHAK 22 phak index |
| artifact | Seaplane Handbook FAA-H-8083-23-4 Ch7-9 |
| definition | Abeam Fix — Definition and Positional Reference |
| definition | Air as a Fluid — Properties and Definition |
| definition | Aircraft Owner/Information Manual — Limitations and Purpose |
| definition | Airplane Upset — Definition and Parameters |
| definition | Automation Management (AM) — Component of SRM |
| definition | AWOS Ownership: Federal vs. Non-Federal |
| definition | Back Taxi — Definition and Purpose |
| definition | Can Buoys vs. Nun Buoys — Shape and Meaning |
| definition | Cardinal Compass Directions — Wind Reporting |
| definition | Collision Course Detection — No Relative Motion Rule |
| definition | Coordination — Definition as a Flight Skill |
| definition | Course to an Intercept (CI) Leg — ARINC 424 Leg Type |
| definition | Cupola — Function in Angular Motion Detection |
| definition | Dryline — Definition and Location |
| definition | Energy State Matrix — Translating Altitude-Speed Deviations to Energy Errors |
| definition | Environmental Systems: Aircraft Life Support Systems |
| definition | Flap Types: Four Basic Trailing Edge Flap Designs |
| definition | Flight Director: Autopilot Coupling vs. Pilot Following |
| definition | Float Deck — Access and Features |
| definition | FRAT Risk Color Coding — Red, Yellow, Green, White |
| definition | Friction — Effect on Airflow Over Surfaces |
| definition | From a Fix to Manual Termination (FM) Leg — ARINC 424 Leg Type |
| definition | Fuel Tanks — Location and Construction |
| definition | General Aviation Airports — Largest Airport Category |
| definition | Groundwater Flow — Underground Water Movement |
| definition | Gyroscope Mounting Types — Freely Mounted vs. Restricted |
| definition | Hydrologic Cycle — Definition and Overview |
| definition | Ignition Switch — Five Positions and Function |
| definition | Inbound Direction Convention for Coastal Waterways |
| definition | Infiltration — Water Movement into the Ground |
| definition | Information Signs — Appearance and Purpose |
| definition | Jet Fuel Truck Markings — Identification Standard |
| definition | Kinetic Energy — Definition and Formula |
| definition | Location Signs — Appearance and Purpose |
| definition | Mandatory Instruction Signs — Appearance and Purpose |
| definition | Marker Beacon Receiver: Fixed Frequency Operation |
| definition | Mid-Channel Buoys — Black and White Vertical Stripes |
| definition | Minimum Sink Speed — Definition and Use |
| definition | Nighttime Buoy Light Colors and Significance |
| definition | Nosewheel Types — Steerable vs. Castering |
| definition | Planetary Boundary Layer: Definition and Role |
| definition | Plant Uptake — Groundwater Absorption by Vegetation |
| definition | Potential Energy — Definition and Formula |
| definition | Pulse Oximeter — Function and Operation |
| definition | Reliever Airports — Purpose and Ownership |
| definition | Rhodopsin — Role in Photopic and Scotopic Vision |

---

## 3. Connected Components

| Metric | Value |
|--------|-------|
| Total components | 1484 |
| Largest component | 16,395 nodes |
| Largest component % | 74.24% |

### Top Component Sizes
| Rank | Size |
|------|------|
| 1 | 16,395 |
| 2 | 111 |
| 3 | 53 |
| 4 | 53 |
| 5 | 48 |
| 6 | 45 |
| 7 | 45 |
| 8 | 37 |
| 9 | 34 |
| 10 | 33 |

---

## 4. Root Reachability

| Root | Reachable | % of Graph | Max Hops |
|------|-----------|-----------|----------|
| National Airspace System (NAS) Plan — Origin and Goals | 2 | 0.01% | 6 |
| Private Pilot Area I | 12,759 | 57.77% | 6 |
| Private Pilot Area II | 11,322 | 51.27% | 6 |
| Commercial Pilot Area I | 12,488 | 56.55% | 6 |
| Instrument Pilot Area I | 12,237 | 55.41% | 6 |
| AIM aim 01 ch1 | 12 | 0.05% | 6 |

---

## 5. Edge Sanity

| Check | Count | Status |
|-------|-------|--------|
| Dangling edges | 0 | PASS |
| Self-loops | 0 | PASS |
| Duplicate edges | 0 | PASS |

---

*Generated by `npm run graph:metrics` at 2026-02-25T21:18:40.320Z*