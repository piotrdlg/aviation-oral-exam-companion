-- Add UPDATE policy for session_transcripts so assessments can be persisted.
-- Previously only SELECT and INSERT were allowed, causing assessment UPDATEs
-- to silently fail under RLS.
CREATE POLICY "transcripts_user_update" ON session_transcripts
  FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM exam_sessions WHERE id = session_id AND user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM exam_sessions WHERE id = session_id AND user_id = auth.uid()));
