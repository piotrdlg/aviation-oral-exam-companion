-- Fix missing GRANTs on concept_chunk_evidence table and RPC functions.
-- PostgREST requires table/function grants to the API roles (anon, authenticated, service_role)
-- in addition to RLS policies for the table to appear in the schema cache.

-- Table grants
GRANT SELECT ON concept_chunk_evidence TO authenticated;
GRANT SELECT ON concept_chunk_evidence TO anon;
GRANT ALL ON concept_chunk_evidence TO service_role;

-- Function grants for the graph bundle RPCs
GRANT EXECUTE ON FUNCTION get_concept_bundle(TEXT, INT) TO authenticated;
GRANT EXECUTE ON FUNCTION get_concept_bundle(TEXT, INT) TO anon;
GRANT EXECUTE ON FUNCTION get_concept_bundle(TEXT, INT) TO service_role;

GRANT EXECUTE ON FUNCTION get_concept_bundle_reverse(TEXT, INT) TO authenticated;
GRANT EXECUTE ON FUNCTION get_concept_bundle_reverse(TEXT, INT) TO anon;
GRANT EXECUTE ON FUNCTION get_concept_bundle_reverse(TEXT, INT) TO service_role;

-- Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';
