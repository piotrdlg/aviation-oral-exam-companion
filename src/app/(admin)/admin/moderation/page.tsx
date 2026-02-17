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
  inaccurate_answer: 'bg-amber-900/30 text-amber-300',
  safety_incident: 'bg-red-900/30 text-red-300',
  bug_report: 'bg-blue-900/30 text-blue-300',
  content_error: 'bg-purple-900/30 text-purple-300',
};

const STATUS_COLORS: Record<ModerationStatus, string> = {
  open: 'bg-amber-900/30 text-amber-400',
  reviewing: 'bg-blue-900/30 text-blue-400',
  resolved: 'bg-green-900/30 text-green-400',
  dismissed: 'bg-gray-700 text-gray-400',
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
          <h1 className="text-2xl font-bold text-white">Moderation Queue</h1>
          <p className="text-sm text-gray-500 mt-1">
            {items.length} item{items.length !== 1 ? 's' : ''}
            {statusFilter !== 'all' ? ` (${statusFilter})` : ''}
          </p>
        </div>
        <button
          onClick={fetchItems}
          className="text-sm text-gray-400 hover:text-white transition-colors"
        >
          Refresh
        </button>
      </div>

      {/* Status Filter Tabs */}
      <div className="flex gap-1 bg-gray-900 rounded-lg p-1 mb-6 w-fit border border-gray-800">
        {(['all', 'open', 'reviewing', 'resolved', 'dismissed'] as const).map((value) => (
          <button
            key={value}
            onClick={() => { setStatusFilter(value); setSelectedItem(null); }}
            className={`px-3 py-1.5 text-xs rounded-md transition-colors ${
              statusFilter === value
                ? 'bg-gray-800 text-white'
                : 'text-gray-400 hover:text-gray-300'
            }`}
          >
            {value === 'all' ? 'All' : value.charAt(0).toUpperCase() + value.slice(1)}
          </button>
        ))}
      </div>

      {error && (
        <div className="bg-red-900/20 border border-red-800/50 rounded-xl p-4 mb-4">
          <p className="text-red-300 text-sm">{error}</p>
          <button onClick={fetchItems} className="text-xs text-red-400 hover:text-red-300 underline mt-1">
            Retry
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* Queue List */}
        <div className="lg:col-span-2">
          {loading ? (
            <div className="space-y-2">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="bg-gray-900 rounded-lg border border-gray-800 p-4 animate-pulse">
                  <div className="h-4 bg-gray-800 rounded w-32 mb-2" />
                  <div className="h-3 bg-gray-800 rounded w-48" />
                </div>
              ))}
            </div>
          ) : items.length === 0 ? (
            <div className="bg-gray-900 rounded-xl border border-gray-800 p-8 text-center">
              <p className="text-gray-500">No items in queue</p>
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
                    className={`w-full text-left p-4 rounded-lg border transition-colors ${
                      isSelected
                        ? 'bg-gray-800 border-blue-500/50'
                        : 'bg-gray-900 border-gray-800 hover:bg-gray-800/50'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${REPORT_TYPE_COLORS[item.report_type]}`}>
                        {REPORT_TYPE_LABELS[item.report_type]}
                      </span>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_COLORS[item.status]}`}>
                        {item.status}
                      </span>
                    </div>
                    {typeof item.details?.comment === 'string' && item.details.comment && (
                      <p className="text-xs text-gray-300 truncate mb-1">
                        {item.details.comment}
                      </p>
                    )}
                    <p className="text-xs text-gray-500 truncate">
                      {item.reporter_email || 'System-generated'}
                    </p>
                    <p className="text-xs text-gray-600 mt-1">
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
            <div className="bg-gray-900 rounded-xl border border-gray-800 p-6">
              {/* Header */}
              <div className="flex items-start justify-between mb-4">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${REPORT_TYPE_COLORS[selectedItem.report_type]}`}>
                      {REPORT_TYPE_LABELS[selectedItem.report_type]}
                    </span>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_COLORS[selectedItem.status]}`}>
                      {selectedItem.status}
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 mt-1">
                    Reported by: {selectedItem.reporter_email || 'System'}
                  </p>
                  <p className="text-xs text-gray-600">
                    {new Date(selectedItem.created_at).toLocaleString('en-US', {
                      month: 'long',
                      day: 'numeric',
                      year: 'numeric',
                      hour: 'numeric',
                      minute: '2-digit',
                    })}
                  </p>
                </div>
                <p className="text-xs text-gray-600 font-mono">{selectedItem.id.slice(0, 8)}</p>
              </div>

              {/* Details */}
              <div className="mb-4">
                <h3 className="text-xs text-gray-500 uppercase tracking-wide mb-2">Details</h3>
                <div className="bg-gray-800/50 rounded-lg p-3">
                  {Object.entries(selectedItem.details).length === 0 ? (
                    <p className="text-xs text-gray-500">No details provided</p>
                  ) : (
                    <dl className="space-y-1.5">
                      {Object.entries(selectedItem.details).map(([key, value]) => (
                        <div key={key}>
                          <dt className="text-xs text-gray-500 mb-0.5">{key}</dt>
                          <dd className="text-xs text-gray-300">
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
                <div className="mb-4">
                  <h3 className="text-xs text-gray-500 uppercase tracking-wide mb-2">Session</h3>
                  <p className="text-xs text-gray-400 font-mono bg-gray-800/50 rounded-lg p-3">
                    {selectedItem.session_id}
                  </p>
                </div>
              )}

              {/* Transcript Context */}
              {selectedItem.transcript_context && selectedItem.transcript_context.length > 0 && (
                <div className="mb-4">
                  <h3 className="text-xs text-gray-500 uppercase tracking-wide mb-2">
                    Transcript Context
                  </h3>
                  <div className="bg-gray-800/50 rounded-lg p-3 space-y-2 max-h-64 overflow-y-auto">
                    {selectedItem.transcript_context.map((entry, i) => (
                      <div
                        key={i}
                        className={`text-xs p-2 rounded ${
                          entry.role === 'examiner'
                            ? 'bg-gray-800 text-gray-300'
                            : 'bg-blue-900/20 text-blue-200'
                        }`}
                      >
                        <span className="font-medium opacity-60 mr-1">
                          {entry.role === 'examiner' ? 'DPE:' : 'Student:'}
                        </span>
                        <span className="whitespace-pre-wrap">{entry.text}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Resolution info (for resolved/dismissed) */}
              {(selectedItem.status === 'resolved' || selectedItem.status === 'dismissed') && (
                <div className="mb-4">
                  <h3 className="text-xs text-gray-500 uppercase tracking-wide mb-2">Resolution</h3>
                  <div className="bg-gray-800/50 rounded-lg p-3">
                    <p className="text-xs text-gray-300">
                      {selectedItem.resolution_notes || 'No notes'}
                    </p>
                    <p className="text-xs text-gray-600 mt-1">
                      By {selectedItem.resolved_by_email || 'Unknown'} on{' '}
                      {selectedItem.resolved_at
                        ? new Date(selectedItem.resolved_at).toLocaleString()
                        : 'Unknown'}
                    </p>
                  </div>
                </div>
              )}

              {/* Action Error */}
              {actionError && (
                <div className="bg-red-900/20 border border-red-800/50 rounded-lg p-3 mb-4 text-red-300 text-sm">
                  {actionError}
                </div>
              )}

              {/* Action Buttons (only for open/reviewing items) */}
              {(selectedItem.status === 'open' || selectedItem.status === 'reviewing') && (
                <div className="border-t border-gray-800 pt-4">
                  <textarea
                    value={resolutionNotes}
                    onChange={(e) => setResolutionNotes(e.target.value)}
                    placeholder="Resolution notes (optional)..."
                    rows={2}
                    className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none mb-3"
                  />
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => performAction(selectedItem.id, 'resolve')}
                      disabled={actionLoading}
                      className="px-4 py-2 text-sm rounded-lg bg-green-600 text-white hover:bg-green-700 disabled:opacity-50 transition-colors"
                    >
                      {actionLoading ? 'Saving...' : 'Resolve'}
                    </button>
                    <button
                      onClick={() => performAction(selectedItem.id, 'dismiss')}
                      disabled={actionLoading}
                      className="px-4 py-2 text-sm rounded-lg bg-gray-700 text-gray-300 hover:bg-gray-600 disabled:opacity-50 transition-colors"
                    >
                      Dismiss
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="bg-gray-900 rounded-xl border border-gray-800 p-12 text-center">
              <svg className="w-8 h-8 text-gray-700 mx-auto mb-3" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75m-3-7.036A11.959 11.959 0 0 1 3.598 6 11.99 11.99 0 0 0 3 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285Z" />
              </svg>
              <p className="text-gray-500 text-sm">Select an item to view details</p>
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
