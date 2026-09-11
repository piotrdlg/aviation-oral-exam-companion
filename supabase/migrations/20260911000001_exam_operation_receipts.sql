-- Opt-in mobile JSON mutations: durable receipts prevent a timeout from replaying work.
create table public.exam_operation_receipts (
  user_id uuid not null references auth.users(id) on delete cascade,
  operation_id uuid not null,
  session_id uuid not null references public.exam_sessions(id) on delete cascade,
  action text not null check (action in ('start', 'respond', 'next-task')),
  request_hash text not null,
  state text not null default 'pending' check (state in ('pending', 'completed')),
  response_status integer,
  response_body jsonb,
  created_at timestamptz not null default now(),
  primary key (user_id, operation_id)
);
-- Never expire/reclaim a pending operation: it may have committed partial work.
create unique index exam_operation_one_pending_per_session
  on public.exam_operation_receipts(session_id) where state = 'pending';
alter table public.exam_operation_receipts enable row level security;
create policy "Owners read operation receipts" on public.exam_operation_receipts
  for select to authenticated using (user_id = auth.uid());
-- All writes use the service role after checking ownership through the caller's RLS client.
revoke all on public.exam_operation_receipts from anon, authenticated;
grant select on public.exam_operation_receipts to authenticated;
grant all on public.exam_operation_receipts to service_role;
