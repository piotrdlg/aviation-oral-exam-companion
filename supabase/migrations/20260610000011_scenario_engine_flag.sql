-- ============================================================
-- Migration: Scenario Engine flag (W5.4)
-- ============================================================
-- Tri-state per design §7 Gate 2: off | ab | on. Stays 'off' until the
-- W5.5 offline gate PASSES; 'ab' drives the W5.6 production A/B.
INSERT INTO system_config (key, value, description)
VALUES ('exam.scenario_engine', '{"mode": "off"}',
        'Scenario Engine (design 2026-06-09). off = linear exams (today); ab = 50/50 assignment (W5.6); on = all sessions. DO NOT enable before Gate 1 passes (docs/reviews/2026-06-09-comprehensive-review/15-scenario-gate1-report.md).')
ON CONFLICT (key) DO NOTHING;
