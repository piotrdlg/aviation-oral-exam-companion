-- Support tickets from inbound email
CREATE TABLE support_tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  resend_email_id TEXT UNIQUE,
  from_email TEXT NOT NULL,
  from_name TEXT,
  to_address TEXT NOT NULL,
  subject TEXT NOT NULL,
  body_text TEXT,
  body_html TEXT,
  ticket_type TEXT NOT NULL DEFAULT 'support'
    CHECK (ticket_type IN ('support', 'feedback')),
  status TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'in_progress', 'resolved', 'closed')),
  priority TEXT NOT NULL DEFAULT 'normal'
    CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  assigned_to UUID,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  reply_count INT NOT NULL DEFAULT 0,
  last_reply_at TIMESTAMPTZ,
  admin_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Ticket conversation thread
CREATE TABLE ticket_replies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
  direction TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  from_email TEXT NOT NULL,
  body_text TEXT,
  body_html TEXT,
  resend_email_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX idx_tickets_status ON support_tickets(status);
CREATE INDEX idx_tickets_created ON support_tickets(created_at DESC);
CREATE INDEX idx_tickets_from_email ON support_tickets(from_email);
CREATE INDEX idx_tickets_user ON support_tickets(user_id);
CREATE INDEX idx_replies_ticket ON ticket_replies(ticket_id, created_at);

-- RLS
ALTER TABLE support_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE ticket_replies ENABLE ROW LEVEL SECURITY;

-- Admin-only access (same pattern as existing admin_users table)
CREATE POLICY "admin_tickets_all" ON support_tickets
  FOR ALL TO authenticated
  USING (auth.uid() IN (SELECT user_id FROM admin_users));

CREATE POLICY "admin_replies_all" ON ticket_replies
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM support_tickets t
    WHERE t.id = ticket_replies.ticket_id
    AND auth.uid() IN (SELECT user_id FROM admin_users)
  ));

-- Updated_at trigger
-- Check if the function already exists before creating
DO $$ BEGIN
  CREATE OR REPLACE FUNCTION update_support_ticket_updated_at()
  RETURNS TRIGGER AS $fn$
  BEGIN
    NEW.updated_at = now();
    RETURN NEW;
  END;
  $fn$ LANGUAGE plpgsql;
END $$;

CREATE TRIGGER set_tickets_updated_at
  BEFORE UPDATE ON support_tickets
  FOR EACH ROW EXECUTE FUNCTION update_support_ticket_updated_at();
