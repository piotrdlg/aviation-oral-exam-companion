-- Phase 7: Instructor invite event log (rate limiting + audit)
CREATE TABLE IF NOT EXISTS instructor_invite_events (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  instructor_user_id UUID NOT NULL REFERENCES auth.users(id),
  event_type TEXT NOT NULL CHECK (event_type IN ('token_created', 'email_sent', 'claimed', 'revoked', 'rate_limited')),
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_invite_events_instructor_created
  ON instructor_invite_events (instructor_user_id, created_at);

CREATE INDEX idx_invite_events_type_created
  ON instructor_invite_events (event_type, created_at);

-- RLS: instructors can read their own events; service role bypasses
ALTER TABLE instructor_invite_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Instructors can read own invite events"
  ON instructor_invite_events FOR SELECT
  USING (auth.uid() = instructor_user_id);
