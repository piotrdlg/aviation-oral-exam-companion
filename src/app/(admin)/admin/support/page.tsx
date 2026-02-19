'use client';

import { useEffect, useState, useCallback } from 'react';

/* ------------------------------------------------------------------ */
/*  Interfaces                                                         */
/* ------------------------------------------------------------------ */

interface SupportTicket {
  id: string;
  resend_email_id: string | null;
  from_email: string;
  from_name: string | null;
  to_address: string;
  subject: string;
  body_text: string | null;
  body_html: string | null;
  ticket_type: 'support' | 'feedback';
  status: 'open' | 'in_progress' | 'resolved' | 'closed';
  priority: 'low' | 'normal' | 'high' | 'urgent';
  assigned_to: string | null;
  user_id: string | null;
  reply_count: number;
  last_reply_at: string | null;
  admin_notes: string | null;
  created_at: string;
  updated_at: string;
}

interface TicketReply {
  id: string;
  ticket_id: string;
  direction: 'inbound' | 'outbound';
  from_email: string;
  body_text: string | null;
  body_html: string | null;
  resend_email_id: string | null;
  created_at: string;
}

interface TicketCounts {
  open: number;
  in_progress: number;
  resolved: number;
  closed: number;
  total: number;
}

interface TicketListData {
  tickets: SupportTicket[];
  counts: TicketCounts;
}

interface TicketDetailData {
  ticket: SupportTicket;
  replies: TicketReply[];
}

type StatusFilter = 'all' | 'open' | 'in_progress' | 'resolved' | 'closed';

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

/* ------------------------------------------------------------------ */
/*  Page Component                                                     */
/* ------------------------------------------------------------------ */

export default function AdminSupportPage() {
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [counts, setCounts] = useState<TicketCounts>({ open: 0, in_progress: 0, resolved: 0, closed: 0, total: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);

  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);
  const [detail, setDetail] = useState<TicketDetailData | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  // Reply form state
  const [replyBody, setReplyBody] = useState('');
  const [replySending, setReplySending] = useState(false);
  const [replyError, setReplyError] = useState<string | null>(null);
  const [replyEmailWarning, setReplyEmailWarning] = useState(false);

  // Admin notes state
  const [notesValue, setNotesValue] = useState('');
  const [notesSaving, setNotesSaving] = useState(false);

  // Status/priority update state
  const [statusUpdating, setStatusUpdating] = useState(false);
  const [priorityUpdating, setPriorityUpdating] = useState(false);

  /* ---- Fetch ticket list ---- */

  const fetchTickets = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/support');
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      const data: TicketListData = await res.json();
      setTickets(data.tickets);
      setCounts(data.counts);
      setLastRefreshed(new Date());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load tickets');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTickets();
  }, [fetchTickets]);

  /* ---- Fetch ticket detail ---- */

  const fetchDetail = useCallback(async (ticketId: string) => {
    setDetailLoading(true);
    setDetailError(null);
    setReplyBody('');
    setReplyError(null);
    setReplyEmailWarning(false);
    try {
      const res = await fetch(`/api/admin/support?id=${ticketId}`);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      const data: TicketDetailData = await res.json();
      setDetail(data);
      setNotesValue(data.ticket.admin_notes || '');
    } catch (err) {
      setDetailError(err instanceof Error ? err.message : 'Failed to load ticket');
    } finally {
      setDetailLoading(false);
    }
  }, []);

  const handleSelectTicket = useCallback((ticketId: string) => {
    setSelectedTicketId(ticketId);
    fetchDetail(ticketId);
  }, [fetchDetail]);

  /* ---- Update status ---- */

  const handleStatusChange = useCallback(async (newStatus: string) => {
    if (!detail) return;
    setStatusUpdating(true);
    try {
      const res = await fetch('/api/admin/support', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: detail.ticket.id, status: newStatus }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      // Refresh both list and detail
      await Promise.all([fetchTickets(), fetchDetail(detail.ticket.id)]);
    } catch {
      // Silently handle — the UI will show stale data but user can retry
    } finally {
      setStatusUpdating(false);
    }
  }, [detail, fetchTickets, fetchDetail]);

  /* ---- Update priority ---- */

  const handlePriorityChange = useCallback(async (newPriority: string) => {
    if (!detail) return;
    setPriorityUpdating(true);
    try {
      const res = await fetch('/api/admin/support', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: detail.ticket.id, priority: newPriority }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      await fetchDetail(detail.ticket.id);
    } catch {
      // Silently handle
    } finally {
      setPriorityUpdating(false);
    }
  }, [detail, fetchDetail]);

  /* ---- Send reply ---- */

  const handleSendReply = useCallback(async () => {
    if (!detail || !replyBody.trim()) return;
    setReplySending(true);
    setReplyError(null);
    setReplyEmailWarning(false);
    try {
      const res = await fetch('/api/admin/support', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticketId: detail.ticket.id, body: replyBody.trim() }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      const data = await res.json();
      if (data.emailSent === false) {
        setReplyEmailWarning(true);
      }
      setReplyBody('');
      await fetchDetail(detail.ticket.id);
    } catch (err) {
      setReplyError(err instanceof Error ? err.message : 'Failed to send reply');
    } finally {
      setReplySending(false);
    }
  }, [detail, replyBody, fetchDetail]);

  /* ---- Save admin notes ---- */

  const handleSaveNotes = useCallback(async () => {
    if (!detail) return;
    setNotesSaving(true);
    try {
      const res = await fetch('/api/admin/support', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: detail.ticket.id, admin_notes: notesValue }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      await fetchDetail(detail.ticket.id);
    } catch {
      // Silently handle
    } finally {
      setNotesSaving(false);
    }
  }, [detail, notesValue, fetchDetail]);

  /* ---- Filter tickets ---- */

  const filteredTickets = statusFilter === 'all'
    ? tickets
    : tickets.filter((t) => t.status === statusFilter);

  /* ---- Render ---- */

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <div className="flex items-center gap-4">
            <h1 className="text-2xl font-bold text-c-amber font-mono uppercase tracking-wider glow-a">SUPPORT TICKETS</h1>
            {!loading && (
              <span className="font-mono text-[10px] text-c-muted uppercase">
                {counts.open} open &middot; {counts.total} total
              </span>
            )}
          </div>
          {lastRefreshed && !loading && (
            <p className="font-mono text-[10px] text-c-dim mt-1 uppercase">
              Updated {lastRefreshed.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
            </p>
          )}
        </div>
        <button
          onClick={fetchTickets}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 bg-c-bezel hover:bg-c-elevated border border-c-border hover:border-c-border-hi rounded-lg text-xs text-c-text font-mono uppercase tracking-wide transition-colors disabled:opacity-50"
        >
          <span className={loading ? 'animate-spin inline-block' : ''}>&#8634;</span>
          {loading ? 'REFRESHING...' : 'REFRESH'}
        </button>
      </div>

      {/* Error state */}
      {error && (
        <div className="bezel rounded-lg border border-c-red/30 border-l-2 p-5 mb-6">
          <div className="flex items-start gap-3">
            <span className="text-c-red text-lg flex-shrink-0">&#9888;</span>
            <div>
              <p className="font-mono text-xs text-c-red uppercase tracking-wider">FAILED TO LOAD TICKETS</p>
              <p className="text-xs text-c-muted mt-1">{error}</p>
              <button
                onClick={fetchTickets}
                className="mt-2 font-mono text-[10px] text-c-red hover:text-c-amber uppercase tracking-wider transition-colors"
              >
                &#8634; RETRY
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Status Filter Tabs */}
      <div className="flex items-center gap-1 mb-4">
        {(['all', 'open', 'in_progress', 'resolved', 'closed'] as StatusFilter[]).map((filter) => (
          <FilterTab
            key={filter}
            label={filter === 'all' ? 'All' : filter === 'in_progress' ? 'In Progress' : filter.charAt(0).toUpperCase() + filter.slice(1)}
            active={statusFilter === filter}
            count={filter === 'all' ? counts.total : counts[filter as keyof Omit<TicketCounts, 'total'>]}
            onClick={() => setStatusFilter(filter)}
          />
        ))}
      </div>

      {/* Split View */}
      <div className="flex gap-4 min-h-[600px]">
        {/* Left panel — Ticket List (40%) */}
        <div className="w-2/5 flex-shrink-0 bezel rounded-lg border border-c-border overflow-hidden flex flex-col">
          <div className="px-4 py-3 border-b border-c-border">
            <p className="font-mono text-[10px] text-c-dim uppercase tracking-wider">
              // {filteredTickets.length} ticket{filteredTickets.length !== 1 ? 's' : ''}
            </p>
          </div>
          <div className="flex-1 overflow-y-auto">
            {loading && tickets.length === 0 ? (
              <div className="p-4 space-y-3 animate-pulse">
                {[...Array(5)].map((_, i) => (
                  <div key={i} className="h-12 bg-c-bezel rounded" />
                ))}
              </div>
            ) : filteredTickets.length === 0 ? (
              <div className="p-8 text-center">
                <p className="font-mono text-xs text-c-dim uppercase">No tickets found</p>
              </div>
            ) : (
              <div className="divide-y divide-c-border">
                {filteredTickets.map((ticket) => (
                  <TicketRow
                    key={ticket.id}
                    ticket={ticket}
                    selected={selectedTicketId === ticket.id}
                    onClick={() => handleSelectTicket(ticket.id)}
                  />
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right panel — Ticket Detail (60%) */}
        <div className="flex-1 bezel rounded-lg border border-c-border overflow-hidden flex flex-col">
          {!selectedTicketId ? (
            <div className="flex-1 flex items-center justify-center">
              <p className="font-mono text-xs text-c-dim uppercase tracking-wider">Select a ticket</p>
            </div>
          ) : detailLoading ? (
            <div className="flex-1 p-6 space-y-4 animate-pulse">
              <div className="h-5 bg-c-bezel rounded w-48" />
              <div className="h-4 bg-c-bezel rounded w-64" />
              <div className="h-4 bg-c-bezel rounded w-32" />
              <div className="h-32 bg-c-bezel rounded" />
            </div>
          ) : detailError ? (
            <div className="flex-1 p-6">
              <div className="bezel rounded-lg border border-c-red/30 border-l-2 p-5">
                <div className="flex items-start gap-3">
                  <span className="text-c-red text-lg flex-shrink-0">&#9888;</span>
                  <div>
                    <p className="font-mono text-xs text-c-red uppercase tracking-wider">FAILED TO LOAD TICKET</p>
                    <p className="text-xs text-c-muted mt-1">{detailError}</p>
                  </div>
                </div>
              </div>
            </div>
          ) : detail ? (
            <TicketDetail
              detail={detail}
              onStatusChange={handleStatusChange}
              statusUpdating={statusUpdating}
              onPriorityChange={handlePriorityChange}
              priorityUpdating={priorityUpdating}
              replyBody={replyBody}
              onReplyBodyChange={setReplyBody}
              onSendReply={handleSendReply}
              replySending={replySending}
              replyError={replyError}
              replyEmailWarning={replyEmailWarning}
              notesValue={notesValue}
              onNotesChange={setNotesValue}
              onSaveNotes={handleSaveNotes}
              notesSaving={notesSaving}
            />
          ) : null}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Inline Components                                                  */
/* ------------------------------------------------------------------ */

function StatusDot({ status }: { status: string }) {
  const colors: Record<string, string> = {
    open: 'bg-c-amber',
    in_progress: 'bg-c-cyan',
    resolved: 'bg-c-green',
    closed: 'bg-c-dim',
  };

  return (
    <span className={`w-2 h-2 rounded-full flex-shrink-0 ${colors[status] || 'bg-c-dim'}`} />
  );
}

function FilterTab({ label, active, count, onClick }: {
  label: string;
  active: boolean;
  count: number;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1.5 rounded-lg font-mono text-[10px] uppercase tracking-wider transition-colors flex items-center gap-1.5 ${
        active
          ? 'bg-c-amber-lo text-c-amber border border-c-amber/20'
          : 'bg-c-bezel text-c-muted border border-c-border hover:text-c-text hover:border-c-border-hi'
      }`}
    >
      {label}
      <span className={`tabular-nums ${active ? 'text-c-amber' : 'text-c-dim'}`}>{count}</span>
    </button>
  );
}

function TicketRow({ ticket, selected, onClick }: {
  ticket: SupportTicket;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full text-left px-4 py-3 transition-colors flex items-start gap-2.5 ${
        selected
          ? 'bg-c-amber-lo/30 border-l-2 border-l-c-amber'
          : 'hover:bg-c-elevated/50'
      }`}
    >
      <StatusDot status={ticket.status} />
      <div className="flex-1 min-w-0">
        <p className={`font-mono text-xs truncate ${selected ? 'text-c-amber' : 'text-c-text'}`}>
          {ticket.subject}
        </p>
        <p className="font-mono text-[10px] text-c-dim truncate mt-0.5">
          {ticket.from_email} &middot; {relativeTime(ticket.created_at)}
        </p>
      </div>
      {ticket.priority === 'urgent' && (
        <span className="font-mono text-[10px] bg-c-red-dim/40 text-c-red px-1.5 py-0.5 rounded border border-c-red/20 flex-shrink-0 uppercase">
          urgent
        </span>
      )}
      {ticket.priority === 'high' && (
        <span className="font-mono text-[10px] bg-c-amber-lo text-c-amber px-1.5 py-0.5 rounded border border-c-amber/20 flex-shrink-0 uppercase">
          high
        </span>
      )}
    </button>
  );
}

function TicketDetail({ detail, onStatusChange, statusUpdating, onPriorityChange, priorityUpdating, replyBody, onReplyBodyChange, onSendReply, replySending, replyError, replyEmailWarning, notesValue, onNotesChange, onSaveNotes, notesSaving }: {
  detail: TicketDetailData;
  onStatusChange: (status: string) => void;
  statusUpdating: boolean;
  onPriorityChange: (priority: string) => void;
  priorityUpdating: boolean;
  replyBody: string;
  onReplyBodyChange: (v: string) => void;
  onSendReply: () => void;
  replySending: boolean;
  replyError: string | null;
  replyEmailWarning: boolean;
  notesValue: string;
  onNotesChange: (v: string) => void;
  onSaveNotes: () => void;
  notesSaving: boolean;
}) {
  const { ticket, replies } = detail;

  return (
    <div className="flex flex-col h-full">
      {/* Ticket header */}
      <div className="px-5 py-4 border-b border-c-border space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="font-mono text-sm text-c-text font-medium">{ticket.subject}</p>
            <p className="font-mono text-[10px] text-c-dim mt-1">
              From: {ticket.from_name ? `${ticket.from_name} <${ticket.from_email}>` : ticket.from_email} &middot; {relativeTime(ticket.created_at)}
            </p>
          </div>
        </div>

        {/* Status + Priority dropdowns */}
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <label className="font-mono text-[10px] text-c-dim uppercase tracking-wider">Status</label>
            <div className="relative">
              <select
                value={ticket.status}
                onChange={(e) => onStatusChange(e.target.value)}
                disabled={statusUpdating}
                className="appearance-none bg-c-panel border border-c-border rounded-lg px-3 py-1.5 font-mono text-[10px] text-c-text uppercase tracking-wider pr-6 cursor-pointer hover:border-c-border-hi transition-colors disabled:opacity-50"
              >
                <option value="open">Open</option>
                <option value="in_progress">In Progress</option>
                <option value="resolved">Resolved</option>
                <option value="closed">Closed</option>
              </select>
              <span className="absolute right-2 top-1/2 -translate-y-1/2 text-c-dim text-[8px] pointer-events-none">&#9660;</span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <label className="font-mono text-[10px] text-c-dim uppercase tracking-wider">Priority</label>
            <div className="relative">
              <select
                value={ticket.priority}
                onChange={(e) => onPriorityChange(e.target.value)}
                disabled={priorityUpdating}
                className="appearance-none bg-c-panel border border-c-border rounded-lg px-3 py-1.5 font-mono text-[10px] text-c-text uppercase tracking-wider pr-6 cursor-pointer hover:border-c-border-hi transition-colors disabled:opacity-50"
              >
                <option value="low">Low</option>
                <option value="normal">Normal</option>
                <option value="high">High</option>
                <option value="urgent">Urgent</option>
              </select>
              <span className="absolute right-2 top-1/2 -translate-y-1/2 text-c-dim text-[8px] pointer-events-none">&#9660;</span>
            </div>
          </div>
        </div>
      </div>

      {/* Conversation area */}
      <div className="flex-1 overflow-y-auto">
        {/* Original message */}
        <div className="px-5 py-4 border-b border-c-border">
          <p className="font-mono text-[10px] text-c-dim uppercase tracking-wider mb-2">// Conversation</p>
          <div className="iframe rounded-lg p-4 space-y-4">
            {/* Original ticket body */}
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="font-mono text-[10px] text-c-cyan uppercase tracking-wider font-medium">Customer</span>
                <span className="font-mono text-[10px] text-c-dim">{relativeTime(ticket.created_at)}</span>
              </div>
              <p className="text-xs text-c-text whitespace-pre-wrap leading-relaxed">{ticket.body_text || '(no body)'}</p>
            </div>

            {/* Replies */}
            {replies.map((reply) => (
              <div key={reply.id} className="space-y-1 border-t border-c-border/50 pt-4">
                <div className="flex items-center gap-2">
                  <span className={`font-mono text-[10px] uppercase tracking-wider font-medium ${
                    reply.direction === 'outbound' ? 'text-c-amber' : 'text-c-cyan'
                  }`}>
                    {reply.direction === 'outbound' ? 'Admin' : 'Customer'}
                  </span>
                  <span className="font-mono text-[10px] text-c-dim">{reply.from_email}</span>
                  <span className="font-mono text-[10px] text-c-dim">{relativeTime(reply.created_at)}</span>
                </div>
                <p className="text-xs text-c-text whitespace-pre-wrap leading-relaxed">{reply.body_text || ''}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Reply form */}
        <div className="px-5 py-4 border-b border-c-border">
          <p className="font-mono text-[10px] text-c-dim uppercase tracking-wider mb-2">// Reply</p>
          <textarea
            value={replyBody}
            onChange={(e) => onReplyBodyChange(e.target.value)}
            placeholder="Type your reply..."
            rows={3}
            className="w-full bg-c-panel border border-c-border rounded-lg px-3 py-2 text-xs text-c-text font-mono placeholder:text-c-dim resize-none focus:outline-none focus:border-c-amber/50 transition-colors"
          />
          <div className="flex items-center justify-between mt-2">
            <div>
              {replyError && (
                <p className="font-mono text-[10px] text-c-red">{replyError}</p>
              )}
              {replyEmailWarning && (
                <p className="font-mono text-[10px] text-c-amber">
                  &#9888; Reply saved but email notification failed to send
                </p>
              )}
            </div>
            <button
              onClick={onSendReply}
              disabled={replySending || !replyBody.trim()}
              className="px-4 py-1.5 bg-c-amber-lo text-c-amber border border-c-amber/20 rounded-lg font-mono text-[10px] uppercase tracking-wider hover:bg-c-amber-lo/80 transition-colors disabled:opacity-50"
            >
              {replySending ? 'SENDING...' : 'SEND REPLY'}
            </button>
          </div>
        </div>

        {/* Admin notes */}
        <div className="px-5 py-4">
          <p className="font-mono text-[10px] text-c-dim uppercase tracking-wider mb-2">// Internal Notes</p>
          <textarea
            value={notesValue}
            onChange={(e) => onNotesChange(e.target.value)}
            placeholder="Internal notes (not visible to customer)..."
            rows={3}
            className="w-full bg-c-panel border border-c-border rounded-lg px-3 py-2 text-xs text-c-text font-mono placeholder:text-c-dim resize-none focus:outline-none focus:border-c-amber/50 transition-colors"
          />
          <div className="flex justify-end mt-2">
            <button
              onClick={onSaveNotes}
              disabled={notesSaving}
              className="px-4 py-1.5 bg-c-bezel text-c-text border border-c-border rounded-lg font-mono text-[10px] uppercase tracking-wider hover:bg-c-elevated hover:border-c-border-hi transition-colors disabled:opacity-50"
            >
              {notesSaving ? 'SAVING...' : 'SAVE NOTES'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
