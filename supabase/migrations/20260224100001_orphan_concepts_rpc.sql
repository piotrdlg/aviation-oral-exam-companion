-- RPC to find concepts with zero edges (not in concept_relations as source or target)
CREATE OR REPLACE FUNCTION get_orphan_concepts_admin()
RETURNS TABLE (
  id UUID,
  name TEXT,
  slug TEXT,
  category TEXT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT c.id, c.name, c.slug, c.category
  FROM concepts c
  WHERE NOT EXISTS (
    SELECT 1 FROM concept_relations cr
    WHERE cr.source_id = c.id OR cr.target_id = c.id
  )
  ORDER BY c.category, c.name
  LIMIT 200;
$$;

-- Grant to authenticated (admin guard checks admin_users before calling)
GRANT EXECUTE ON FUNCTION get_orphan_concepts_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION get_orphan_concepts_admin() TO service_role;
