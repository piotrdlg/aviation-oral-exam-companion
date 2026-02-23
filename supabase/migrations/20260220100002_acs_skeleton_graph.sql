-- ============================================================
-- Migration: 20260220100002_acs_skeleton_graph
--
-- Populates the concepts and concept_relations tables with the
-- ACS skeleton knowledge graph, consisting of three layers:
--
-- 1. ACS Area concepts (category='acs_area')
--    One concept per unique (rating, area) combination in acs_tasks.
--    Slug: 'acs_area:{rating}:{roman_numeral}' (e.g. 'acs_area:private:I')
--
-- 2. ACS Task concepts (category='acs_task')
--    One concept per row in acs_tasks.
--    Slug: 'acs_task:{id}' (e.g. 'acs_task:PA.I.A')
--
-- 3. ACS Element concepts (category='acs_element')
--    One concept per row in acs_elements (K/R/S elements extracted from
--    acs_tasks JSONB). acs_elements must be populated before this migration
--    runs (via the seed-elements.ts script or equivalent).
--    Slug: 'acs_element:{code}' (e.g. 'acs_element:PA.I.A.K1')
--
-- Relations (relation_type='is_component_of'):
--    element -> task: each element concept is a component of its parent task
--    task -> area: each task concept is a component of its parent area
--
-- All INSERTs are idempotent via ON CONFLICT DO NOTHING.
-- The acs_tasks.id column encodes the Roman numeral area as the second
-- dot-separated segment (e.g. 'PA.I.A' -> Roman numeral 'I').
-- ============================================================

-- ============================================================
-- STEP 1: Insert ACS Area concepts
-- One per unique (rating, area_text) combination in acs_tasks.
-- The Roman numeral is extracted from the task id's second segment
-- by picking any representative task for that (rating, area) pair.
-- ============================================================
INSERT INTO concepts (
  name,
  slug,
  name_normalized,
  aliases,
  acs_task_id,
  category,
  content,
  key_facts,
  common_misconceptions,
  embedding,
  validation_status
)
SELECT DISTINCT ON (t.rating, t.area)
  initcap(t.rating) || ' Pilot Area ' || split_part(t.id, '.', 2)        AS name,
  'acs_area:' || t.rating || ':' || split_part(t.id, '.', 2)             AS slug,
  lower(initcap(t.rating) || ' pilot area ' || split_part(t.id, '.', 2)) AS name_normalized,
  '{}'::TEXT[]                                                             AS aliases,
  NULL                                                                     AS acs_task_id,
  'acs_area'                                                               AS category,
  'ACS Area of Operation ' || split_part(t.id, '.', 2)
    || ' for ' || t.rating || ' rating'                                    AS content,
  jsonb_build_object(
    'rating', t.rating,
    'area',   split_part(t.id, '.', 2),
    'area_name', t.area
  )                                                                        AS key_facts,
  '[]'::JSONB                                                              AS common_misconceptions,
  NULL                                                                     AS embedding,
  'validated'                                                              AS validation_status
FROM acs_tasks t
ORDER BY t.rating, t.area, t.id
ON CONFLICT (slug) DO NOTHING;

-- ============================================================
-- STEP 2: Insert ACS Task concepts
-- One per row in acs_tasks.
-- ============================================================
INSERT INTO concepts (
  name,
  slug,
  name_normalized,
  aliases,
  acs_task_id,
  category,
  content,
  key_facts,
  common_misconceptions,
  embedding,
  validation_status
)
SELECT
  t.task                                   AS name,
  'acs_task:' || t.id                      AS slug,
  lower(t.task)                            AS name_normalized,
  '{}'::TEXT[]                             AS aliases,
  t.id                                     AS acs_task_id,
  'acs_task'                               AS category,
  'ACS Task ' || t.id || ': ' || t.task   AS content,
  jsonb_build_object(
    'task_id', t.id,
    'rating',  t.rating,
    'area',    t.area
  )                                        AS key_facts,
  '[]'::JSONB                              AS common_misconceptions,
  NULL                                     AS embedding,
  'validated'                              AS validation_status
FROM acs_tasks t
ON CONFLICT (slug) DO NOTHING;

-- ============================================================
-- STEP 3: Insert ACS Element concepts
-- One per row in acs_elements.
-- NOTE: acs_elements must already be populated before this step runs.
-- If acs_elements is empty this step will silently insert nothing.
-- ============================================================
INSERT INTO concepts (
  name,
  slug,
  name_normalized,
  aliases,
  acs_task_id,
  category,
  content,
  key_facts,
  common_misconceptions,
  embedding,
  validation_status
)
SELECT
  ae.description                                           AS name,
  'acs_element:' || ae.code                               AS slug,
  lower(ae.description)                                   AS name_normalized,
  '{}'::TEXT[]                                            AS aliases,
  ae.task_id                                              AS acs_task_id,
  'acs_element'                                           AS category,
  'ACS Element ' || ae.code || ': ' || ae.description    AS content,
  jsonb_build_object(
    'element_code',  ae.code,
    'task_id',       ae.task_id,
    'element_type',  ae.element_type,
    'short_code',    ae.short_code
  )                                                       AS key_facts,
  '[]'::JSONB                                             AS common_misconceptions,
  NULL                                                    AS embedding,
  'validated'                                             AS validation_status
FROM acs_elements ae
ON CONFLICT (slug) DO NOTHING;

-- ============================================================
-- STEP 4: Insert concept_relations
-- relation_type='is_component_of' for two edges:
--   (a) element concept -> task concept
--   (b) task concept -> area concept
--
-- IDs are looked up by slug to stay portable across environments.
-- ============================================================

-- 4a. Element -> Task (element is a component of its parent task)
INSERT INTO concept_relations (
  source_id,
  target_id,
  relation_type,
  weight,
  confidence
)
SELECT
  element_concept.id  AS source_id,
  task_concept.id     AS target_id,
  'is_component_of'   AS relation_type,
  1.0                 AS weight,
  1.0                 AS confidence
FROM acs_elements ae
JOIN concepts element_concept ON element_concept.slug = 'acs_element:' || ae.code
JOIN concepts task_concept    ON task_concept.slug    = 'acs_task:'    || ae.task_id
ON CONFLICT (source_id, target_id, relation_type) DO NOTHING;

-- 4b. Task -> Area (task is a component of its parent area)
INSERT INTO concept_relations (
  source_id,
  target_id,
  relation_type,
  weight,
  confidence
)
SELECT
  task_concept.id   AS source_id,
  area_concept.id   AS target_id,
  'is_component_of' AS relation_type,
  1.0               AS weight,
  1.0               AS confidence
FROM acs_tasks t
JOIN concepts task_concept ON task_concept.slug = 'acs_task:' || t.id
JOIN concepts area_concept ON area_concept.slug = 'acs_area:' || t.rating || ':' || split_part(t.id, '.', 2)
ON CONFLICT (source_id, target_id, relation_type) DO NOTHING;
