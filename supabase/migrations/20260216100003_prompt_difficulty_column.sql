-- Add difficulty dimension to prompt_versions table
-- This enables dedicated prompts per difficulty × study_mode combination.
-- Specificity scoring in loadPromptFromDB:
--   +1 for matching rating, +1 for matching study_mode, +1 for matching difficulty
--   NULL = wildcard (matches any), highest specificity wins.

-- 1. Add difficulty column (nullable = wildcard for all difficulties)
ALTER TABLE prompt_versions ADD COLUMN difficulty TEXT;

-- 2. Drop old unique index and recreate with difficulty dimension
DROP INDEX IF EXISTS idx_prompt_versions_unique;
CREATE UNIQUE INDEX idx_prompt_versions_unique
  ON prompt_versions (
    prompt_key,
    COALESCE(rating, '__all__'),
    COALESCE(study_mode, '__all__'),
    COALESCE(difficulty, '__all__'),
    version
  );
