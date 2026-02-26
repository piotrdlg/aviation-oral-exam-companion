-- Graph feature flags: Controls for GraphRAG runtime integration.
-- graph.enhanced_retrieval: Merge graph concept bundle into RAG context
-- graph.shadow_mode: Log graph retrieval in parallel without affecting output

INSERT INTO system_config (key, value, description) VALUES
  ('graph.enhanced_retrieval', '{"enabled": false}', 'Merge graph concept bundle into RAG context'),
  ('graph.shadow_mode', '{"enabled": false}', 'Log graph retrieval in parallel without affecting output')
ON CONFLICT (key) DO NOTHING;
