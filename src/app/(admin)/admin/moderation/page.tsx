'use client';

import { useEffect, useState, useCallback } from 'react';
import type { ModerationStatus, ReportType } from '@/types/database';

interface ModerationItem {
  id: string;
  report_type: ReportType;
  reporter_email: string | null;
  session_id: string | null;
  transcript_id: string | null;
  details: Record<string, unknown>;
  status: ModerationStatus;
  resolution_notes: string | null;
  resolved_by_email: string | null;
  resolved_at: string | null;
  created_at: string;
  // Transcript context (populated for items with transcript_id)
  transcript_context?: TranscriptEntry[];
}

interface TranscriptEntry {
  role: 'examiner' | 'student';
  text: string;
  exchange_number: number;
}

const REPORT_TYPE_LABELS: Record<ReportType, string> = {
  inaccurate_answer: 'Inaccurate Answer',
  safety_incident: 'Safety Incident',
  bug_report: 'Bug Report',
  content_error: 'Content Error',
};

const REPORT_TYPE_COLORS: Record<ReportType, string> = {
  inaccurate_answer: 'bg-c-amber-lo text-c-amber border border-c-amber/20',
  safety_incident: 'bg-c-red-dim/40 text-c-red border border-c-red/20',
  bug_report: 'bg-c-cyan-lo text-c-cyan border border-c-cyan/20',
  content_error: 'bg-c-amber-lo text-c-amber border border-c-amber/20',
};

const STATUS_COLORS: Record<ModerationStatus, string> = {
  open: 'bg-c-amber-lo text-c-amber border border-c-amber/20',
  reviewing: 'bg-c-cyan-lo text-c-cyan border border-c-cyan/20',
  resolved: 'bg-c-green-lo text-c-green border border-c-green/20',
  dismissed: 'bg-c-elevated text-c-muted border border-c-border',
};

export default function ModerationPage() {
  const [items, setItems] = useState<ModerationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<ModerationStatus | 'all'>('open');
  const [selectedItem, setSelectedItem] = useState<ModerationItem | null>(null);
  const [resolutionNotes, setResolutionNotes] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const fetchItems = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (statusFilter !== 'all') params.set('status', statusFilter);

      const res = await fetch(`/api/admin/moderation?${params}`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `HTTP ${res.status}`);
      }
      const data = await res.json();
      setItems(data.items || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load moderation queue');
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  async function performAction(itemId: string, action: 'resolve' | 'dismiss') {
    setActionLoading(true);
    setActionError(null);
    try {
      const res = await fetch(`/api/admin/moderation/${itemId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action,
          resolution_notes: resolutionNotes || null,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `HTTP ${res.status}`);
      }
      setResolutionNotes('');
      setSelectedItem(null);
      await fetchItems();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Action failed');
    } finally {
      setActionLoading(false);
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <p className="font-mono text-xs text-c-cyan glow-c tracking-[0.3em] uppercase mb-2">// MODERATION QUEUE</p>
          <h1 className="text-2xl font-bold text-c-amber font-mono uppercase tracking-wider glow-a">MODERATION QUEUE</h1>
          <p className="font-mono text-[10px] text-c-dim mt-1">
            {items.length} item{items.length !== 1 ? 's' : ''}
            {statusFilter !== 'all' ? ` (${statusFilter})` : ''}
          </p>
        </div>
        <button
          onClick={fetchItems}
          className="font-mono text-xs text-c-muted hover:text-c-amber uppercase tracking-wider transition-colors"
        >
          &#8634; REFRESH
        </button>
      </div>

      {/* Status Filter Tabs */}
      <div className="flex gap-2 mb-6 flex-wrap">
        {(['all', 'open', 'reviewing', 'resolved', 'dismissed'] as const).map((value) => (
          <button
            key={value}
            onClick={() => { setStatusFilter(value); setSelectedItem(null); }}
            className={`px-3 py-1.5 rounded-lg font-mono text-[10px] uppercase transition-colors ${
              statusFilter === value
                ? 'border border-c-amber/50 bg-c-amber-lo/50 text-c-amber font-semibold'
                : 'border border-c-border bg-c-bezel text-c-muted hover:border-c-border-hi'
            }`}
          >
            {value === 'all' ? 'ALL' : value.toUpperCase()}
          </button>
        ))}
      </div>

      {error && (
        <div className="bg-c-red-dim/40 border border-c-red/20 rounded-lg p-4 mb-4">
          <p className="text-c-red text-sm font-mono">{error}</p>
          <button onClick={fetchItems} className="font-mono text-[10px] text-c-red hover:text-c-red/80 underline mt-1 transition-colors">
            RETRY
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* Queue List */}
        <div className="lg:col-span-2">
          {loading ? (
            <div className="space-y-2">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="iframe rounded-lg p-3 animate-pulse">
                  <div className="h-4 bg-c-bezel rounded w-32 mb-2" />
                  <div className="h-3 bg-c-bezel rounded w-48" />
                </div>
              ))}
            </div>
          ) : items.length === 0 ? (
            <div className="iframe rounded-lg p-12 text-center">
              <p className="font-mono text-c-muted text-xs uppercase tracking-wider">&#10003; No items in queue</p>
            </div>
          ) : (
            <div className="space-y-1.5 max-h-[calc(100vh-16rem)] overflow-y-auto">
              {items.map((item) => {
                const isSelected = selectedItem?.id === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => {
                      setSelectedItem(item);
                      setResolutionNotes('');
                      setActionError(null);
                    }}
                    className={`w-full text-left iframe rounded-lg p-3 transition-colors ${
                      isSelected
                        ? 'border-l-2 border-c-amber'
                        : 'hover:bg-c-elevated/50'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className={`font-mono text-[10px] px-2 py-0.5 rounded ${REPORT_TYPE_COLORS[item.report_type]}`}>
                        {REPORT_TYPE_LABELS[item.report_type].toUpperCase()}
                      </span>
                      <span className={`font-mono text-[10px] px-2 py-0.5 rounded ${STATUS_COLORS[item.status]}`}>
                        {item.status.toUpperCase()}
                      </span>
                    </div>
                    {typeof item.details?.comment === 'string' && item.details.comment && (
                      <p className="text-xs text-c-text truncate mb-1">
                        {item.details.comment}
                      </p>
                    )}
                    <p className="font-mono text-[10px] text-c-dim truncate">
                      {item.reporter_email || 'System-generated'}
                    </p>
                    <p className="font-mono text-[10px] text-c-dim mt-1">
                      {formatRelativeTime(item.created_at)}
                    </p>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Detail View */}
        <div className="lg:col-span-3">
          {selectedItem ? (
            <div className="bezel rounded-lg border border-c-border p-5">
              {/* Header */}
              <div className="flex items-start justify-between mb-4">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`font-mono text-[10px] px-2 py-0.5 rounded ${REPORT_TYPE_COLORS[selectedItem.report_type]}`}>
                      {REPORT_TYPE_LABELS[selectedItem.report_type].toUpperCase()}
                    </span>
                    <span className={`font-mono text-[10px] px-2 py-0.5 rounded ${STATUS_COLORS[selectedItem.status]}`}>
                      {selectedItem.status.toUpperCase()}
                    </span>
                  </div>
                  <p className="font-mono text-[10px] text-c-muted uppercase tracking-wider mt-2">
                    Reported by: {selectedItem.reporter_email || 'System'}
                  </p>
                  <p className="font-mono text-[10px] text-c-dim">
                    {new Date(selectedItem.created_at).toLocaleString('en-US', {
                      month: 'long',
                      day: 'numeric',
                      year: 'numeric',
                      hour: 'numeric',
                      minute: '2-digit',
                    })}
                  </p>
                </div>
                <p className="font-mono text-[10px] text-c-dim">{selectedItem.id.slice(0, 8)}</p>
              </div>

              {/* Details */}
              <div className="border-t border-c-border pt-4 mb-4">
                <h3 className="font-mono text-[10px] text-c-muted uppercase tracking-wider mb-2">DETAILS</h3>
                <div className="iframe rounded-lg p-3">
                  {Object.entries(selectedItem.details).length === 0 ? (
                    <p className="font-mono text-[10px] text-c-dim">No details provided</p>
                  ) : (
                    <dl className="space-y-1.5">
                      {Object.entries(selectedItem.details).map(([key, value]) => (
                        <div key={key}>
                          <dt className="font-mono text-[10px] text-c-muted uppercase tracking-wider mb-0.5">{key}</dt>
                          <dd className="text-xs text-c-text">
                            {typeof value === 'string' ? value : JSON.stringify(value)}
                          </dd>
                        </div>
                      ))}
                    </dl>
                  )}
                </div>
              </div>

              {/* Session reference */}
              {selectedItem.session_id && (
                <div className="border-t border-c-border pt-4 mb-4">
                  <h3 className="font-mono text-[10px] text-c-muted uppercase tracking-wider mb-2">SESSION</h3>
                  <p className="font-mono text-[10px] text-c-muted iframe rounded-lg p-3">
                    {selectedItem.session_id}
                  </p>
                </div>
              )}

              {/* Transcript Context */}
              {selectedItem.transcript_context && selectedItem.transcript_context.length > 0 && (
                <div className="border-t border-c-border pt-4 mb-4">
                  <h3 className="font-mono text-[10px] text-c-muted uppercase tracking-wider mb-2">
                    TRANSCRIPT CONTEXT
                  </h3>
                  <div className="iframe rounded-lg p-3 space-y-2 max-h-64 overflow-y-auto">
                    {selectedItem.transcript_context.map((entry, i) => (
                      <div
                        key={i}
                        className={`text-xs p-2 rounded ${
                          entry.role === 'examiner'
                            ? 'bg-c-bezel border-l-2 border-c-amber/50 text-c-text'
                            : 'bg-c-cyan-lo/40 border-r-2 border-c-cyan/50 text-c-text'
                        }`}
                      >
                        <span className={`font-mono text-[10px] uppercase tracking-wider mr-1 ${
                          entry.role === 'examiner' ? 'text-c-amber' : 'text-c-cyan'
                        }`}>
                          {entry.role === 'examiner' ? 'DPE:' : 'STUDENT:'}
                        </span>
                        <span className="whitespace-pre-wrap">{entry.text}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Resolution info (for resolved/dismissed) */}
              {(selectedItem.status === 'resolved' || selectedItem.status === 'dismissed') && (
                <div className="border-t border-c-border pt-4 mb-4">
                  <h3 className="font-mono text-[10px] text-c-muted uppercase tracking-wider mb-2">RESOLUTION</h3>
                  <div className="iframe rounded-lg p-3">
                    <p className="text-xs text-c-text">
                      {selectedItem.resolution_notes || 'No notes'}
                    </p>
                    <p className="font-mono text-[10px] text-c-dim mt-1">
                      By {selectedItem.resolved_by_email || 'Unknown'} &middot;{' '}
                      {selectedItem.resolved_at
                        ? new Date(selectedItem.resolved_at).toLocaleString()
                        : 'Unknown'}
                    </p>
                  </div>
                </div>
              )}

              {/* Action Error */}
              {actionError && (
                <div className="bg-c-red-dim/40 border border-c-red/20 rounded-lg p-3 mb-4 text-c-red font-mono text-xs">
                  {actionError}
                </div>
              )}

              {/* Action Buttons (only for open/reviewing items) */}
              {(selectedItem.status === 'open' || selectedItem.status === 'reviewing') && (
                <div className="border-t border-c-border pt-4">
                  <textarea
                    value={resolutionNotes}
                    onChange={(e) => setResolutionNotes(e.target.value)}
                    placeholder="Resolution notes (optional)..."
                    rows={2}
                    className="fb-textarea w-full px-3 py-2.5 bg-c-panel border border-c-border rounded-lg text-c-text font-mono text-xs focus:outline-none focus:border-c-amber placeholder-c-dim resize-none mb-3 transition-colors"
                  />
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => performAction(selectedItem.id, 'resolve')}
                      disabled={actionLoading}
                      className="px-4 py-2 text-xs rounded-lg bg-c-green/80 hover:bg-c-green text-c-bg font-mono font-semibold uppercase tracking-wide disabled:opacity-50 transition-colors"
                    >
                      {actionLoading ? 'SAVING...' : '&#10003; RESOLVE'}
                    </button>
                    <button
                      onClick={() => performAction(selectedItem.id, 'dismiss')}
                      disabled={actionLoading}
                      className="px-4 py-2 text-xs rounded-lg bg-c-red/80 hover:bg-c-red text-c-text font-mono font-semibold uppercase tracking-wide disabled:opacity-50 transition-colors"
                    >
                      DISMISS
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="bezel rounded-lg border border-c-border p-12 text-center">
              <p className="font-mono text-[10px] text-c-dim mb-1">&#9678;</p>
              <p className="font-mono text-c-muted text-xs uppercase tracking-wider">Select an item to view details</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function formatRelativeTime(dateStr: string): string {
  const now = Date.now();
  const date = new Date(dateStr).getTime();
  const diffMs = now - date;
  const diffMin = Math.floor(diffMs / 60000);
  const diffHr = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHr < 24) return `${diffHr}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
}
