'use client';

import React, { useEffect, useState, useCallback } from 'react';
import type { InstructorStatus } from '@/lib/instructor-access';

interface InstructorApplication {
  id: string;
  user_id: string;
  status: InstructorStatus;
  first_name: string | null;
  last_name: string | null;
  certificate_number: string | null;
  certificate_type: string | null;
  bio: string | null;
  submitted_at: string | null;
  approved_at: string | null;
  rejected_at: string | null;
  rejection_reason: string | null;
  suspended_at: string | null;
  suspension_reason: string | null;
  created_at: string;
  updated_at: string;
  user_email: string;
  verification_status: string;
  verification_confidence: string | null;
  verification_data: {
    candidates?: Array<{ faaUniqueId: string; firstName: string; lastName: string; city: string | null; state: string | null; certTypes: string[]; certLevels: string[] }>;
    reasonCodes?: string[];
    explanation?: string;
  } | null;
  verification_attempted_at: string | null;
  auto_approved: boolean;
}

interface InstructorsResponse {
  applications: InstructorApplication[];
  total: number;
  page: number;
  limit: number;
}

const PAGE_SIZE = 20;

const STATUS_OPTIONS: { value: InstructorStatus | 'all'; label: string }[] = [
  { value: 'pending', label: 'Pending' },
  { value: 'approved', label: 'Approved' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'suspended', label: 'Suspended' },
  { value: 'all', label: 'All' },
];

function StatusBadge({ status }: { status: InstructorStatus }) {
  const styles: Record<InstructorStatus, string> = {
    draft: 'bg-c-elevated text-c-muted border-c-border',
    pending: 'bg-c-amber-lo text-c-amber border-c-amber/20',
    approved: 'bg-c-green-lo text-c-green border-c-green/20',
    rejected: 'bg-c-red-dim text-c-red border-c-red/20',
    suspended: 'bg-c-red-dim text-c-red border-c-red/20',
  };
  return (
    <span className={`font-mono text-[10px] px-2 py-0.5 rounded border uppercase ${styles[status]}`}>
      {status}
    </span>
  );
}

function VerificationBadge({ status, confidence, autoApproved }: { status: string; confidence: string | null; autoApproved: boolean }) {
  if (!status || status === 'unverified') {
    return <span className="font-mono text-[9px] text-c-dim uppercase">unverified</span>;
  }

  const styles: Record<string, string> = {
    verified_auto: 'text-c-green',
    verified_admin: 'text-c-cyan',
    needs_manual_review: 'text-c-amber',
  };

  const labels: Record<string, string> = {
    verified_auto: 'AUTO-VERIFIED',
    verified_admin: 'ADMIN-VERIFIED',
    needs_manual_review: 'NEEDS REVIEW',
  };

  return (
    <div>
      <span className={`font-mono text-[9px] uppercase ${styles[status] || 'text-c-dim'}`}>
        {labels[status] || status}
      </span>
      {confidence && (
        <span className="font-mono text-[8px] text-c-dim ml-1">
          ({confidence.toUpperCase()})
        </span>
      )}
      {autoApproved && (
        <span className="font-mono text-[8px] text-c-green ml-1">FAST-PATH</span>
      )}
    </div>
  );
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '--';
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export default function InstructorsPage() {
  const [data, setData] = useState<InstructorsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<InstructorStatus | 'all'>('pending');
  const [page, setPage] = useState(1);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [reasonModal, setReasonModal] = useState<{
    profileId: string;
    action: 'reject' | 'suspend';
    name: string;
  } | null>(null);
  const [reasonText, setReasonText] = useState('');
  const [expandedApp, setExpandedApp] = useState<string | null>(null);

  const fetchInstructors = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        status: statusFilter,
        page: page.toString(),
        limit: PAGE_SIZE.toString(),
      });

      const res = await fetch(`/api/admin/instructors?${params}`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `HTTP ${res.status}`);
      }
      const result = await res.json();
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load instructors');
    } finally {
      setLoading(false);
    }
  }, [statusFilter, page]);

  useEffect(() => {
    fetchInstructors();
  }, [fetchInstructors]);

  async function performAction(profileId: string, action: string, reason?: string) {
    setActionLoading(profileId);
    try {
      const res = await fetch(`/api/admin/instructors/${profileId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, reason }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `HTTP ${res.status}`);
      }

      // Refresh the list
      await fetchInstructors();
    } catch (err) {
      setError(err instanceof Error ? err.message : `Failed to ${action}`);
    } finally {
      setActionLoading(null);
    }
  }

  function handleApprove(profileId: string) {
    performAction(profileId, 'approve');
  }

  function openRejectModal(profileId: string, name: string) {
    setReasonModal({ profileId, action: 'reject', name });
    setReasonText('');
  }

  function openSuspendModal(profileId: string, name: string) {
    setReasonModal({ profileId, action: 'suspend', name });
    setReasonText('');
  }

  function handleReinstate(profileId: string) {
    performAction(profileId, 'reinstate');
  }

  function submitReasonAction() {
    if (!reasonModal) return;
    performAction(reasonModal.profileId, reasonModal.action, reasonText || undefined);
    setReasonModal(null);
    setReasonText('');
  }

  const totalPages = data ? Math.ceil(data.total / PAGE_SIZE) : 0;

  function getName(app: InstructorApplication): string {
    const parts = [app.first_name, app.last_name].filter(Boolean);
    return parts.length > 0 ? parts.join(' ') : 'Unnamed';
  }

  return (
    <div>
      <div className="mb-6">
        <p className="font-mono text-xs text-c-cyan glow-c tracking-[0.3em] uppercase mb-2">// INSTRUCTOR PARTNERSHIP</p>
        <h1 className="text-2xl font-bold text-c-amber font-mono uppercase tracking-wider glow-a">Instructor Applications</h1>
        {data && (
          <p className="font-mono text-[10px] text-c-muted mt-1">
            {data.total.toLocaleString()} {statusFilter !== 'all' ? statusFilter.toUpperCase() : 'TOTAL'} APPLICATION{data.total !== 1 ? 'S' : ''}
          </p>
        )}
      </div>

      {/* Status filter buttons */}
      <div className="flex flex-wrap items-center gap-1.5 mb-4">
        {STATUS_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            onClick={() => {
              setStatusFilter(opt.value);
              setPage(1);
            }}
            className={`px-3 py-1.5 rounded-lg border font-mono text-[10px] uppercase transition-colors ${
              statusFilter === opt.value
                ? 'border-c-amber/50 bg-c-amber-lo/50 text-c-amber font-semibold'
                : 'border-c-border bg-c-bezel text-c-muted hover:border-c-border-hi'
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* Error */}
      {error && (
        <div className="bg-c-red-dim/40 border border-c-red/20 rounded-lg p-4 mb-4">
          <p className="text-c-red text-sm">{error}</p>
          <button onClick={fetchInstructors} className="font-mono text-[10px] text-c-red hover:text-c-text uppercase mt-1 transition-colors">
            Retry
          </button>
        </div>
      )}

      {/* Table */}
      <div className="bezel rounded-lg border border-c-border overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-c-panel border-b border-c-border text-left">
              <th className="px-4 py-3 font-mono text-[10px] font-medium text-c-muted uppercase tracking-wider">Name</th>
              <th className="px-4 py-3 font-mono text-[10px] font-medium text-c-muted uppercase tracking-wider">Email</th>
              <th className="px-4 py-3 font-mono text-[10px] font-medium text-c-muted uppercase tracking-wider">Certificate</th>
              <th className="px-4 py-3 font-mono text-[10px] font-medium text-c-muted uppercase tracking-wider">Status</th>
              <th className="px-4 py-3 font-mono text-[10px] font-medium text-c-muted uppercase tracking-wider">Verification</th>
              <th className="px-4 py-3 font-mono text-[10px] font-medium text-c-muted uppercase tracking-wider">Submitted</th>
              <th className="px-4 py-3 font-mono text-[10px] font-medium text-c-muted uppercase tracking-wider">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              [...Array(5)].map((_, i) => (
                <tr key={i} className="border-b border-c-border">
                  <td colSpan={7} className="px-4 py-3">
                    <div className="h-5 bg-c-bezel rounded animate-pulse" />
                  </td>
                </tr>
              ))
            ) : !data || data.applications.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-12 text-center text-c-dim font-mono text-xs">
                  No {statusFilter !== 'all' ? statusFilter : ''} applications found
                </td>
              </tr>
            ) : (
              data.applications.map((app) => (
                <React.Fragment key={app.id}>
                <tr className="hover:bg-c-elevated/50 transition-colors border-b border-c-border">
                  <td className="px-4 py-3 font-mono text-xs text-c-text">
                    {getName(app)}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-c-text truncate max-w-[180px]">
                    {app.user_email}
                  </td>
                  <td className="px-4 py-3">
                    <span className="font-mono text-[10px] text-c-text">
                      {app.certificate_type || '--'}{app.certificate_number ? ` #${app.certificate_number}` : ''}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={app.status} />
                  </td>
                  <td className="px-4 py-3 cursor-pointer" onClick={() => setExpandedApp(expandedApp === app.id ? null : app.id)}>
                    <VerificationBadge
                      status={app.verification_status}
                      confidence={app.verification_confidence}
                      autoApproved={app.auto_approved}
                    />
                  </td>
                  <td className="px-4 py-3 font-mono text-[10px] text-c-dim">
                    {formatDate(app.submitted_at)}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      {app.status === 'pending' && (
                        <>
                          <button
                            onClick={() => handleApprove(app.id)}
                            disabled={actionLoading === app.id}
                            className="px-2.5 py-1 rounded border border-c-green/30 bg-c-green-lo text-c-green font-mono text-[10px] uppercase hover:bg-c-green/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            {actionLoading === app.id ? '...' : 'Approve'}
                          </button>
                          <button
                            onClick={() => openRejectModal(app.id, getName(app))}
                            disabled={actionLoading === app.id}
                            className="px-2.5 py-1 rounded border border-c-red/30 bg-c-red-dim text-c-red font-mono text-[10px] uppercase hover:bg-c-red/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            Reject
                          </button>
                        </>
                      )}
                      {app.status === 'approved' && (
                        <button
                          onClick={() => openSuspendModal(app.id, getName(app))}
                          disabled={actionLoading === app.id}
                          className="px-2.5 py-1 rounded border border-c-amber/30 bg-c-amber-lo text-c-amber font-mono text-[10px] uppercase hover:bg-c-amber/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          Suspend
                        </button>
                      )}
                      {app.status === 'suspended' && (
                        <button
                          onClick={() => handleReinstate(app.id)}
                          disabled={actionLoading === app.id}
                          className="px-2.5 py-1 rounded border border-c-green/30 bg-c-green-lo text-c-green font-mono text-[10px] uppercase hover:bg-c-green/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {actionLoading === app.id ? '...' : 'Reinstate'}
                        </button>
                      )}
                      {(app.rejection_reason || app.suspension_reason) && (
                        <span className="font-mono text-[10px] text-c-dim italic truncate max-w-[150px]" title={app.rejection_reason || app.suspension_reason || ''}>
                          {app.rejection_reason || app.suspension_reason}
                        </span>
                      )}
                    </div>
                  </td>
                </tr>
                {expandedApp === app.id && app.verification_data && (
                  <tr className="bg-c-panel/50">
                    <td colSpan={7} className="px-6 py-3">
                      <div className="font-mono text-[10px] space-y-1.5">
                        {app.verification_data.explanation && (
                          <p className="text-c-text">{app.verification_data.explanation}</p>
                        )}
                        {app.verification_data.reasonCodes && app.verification_data.reasonCodes.length > 0 && (
                          <p className="text-c-dim">
                            Reason codes: {app.verification_data.reasonCodes.map((c: string) => c.replace(/_/g, ' ')).join(', ')}
                          </p>
                        )}
                        {app.verification_data.candidates && app.verification_data.candidates.length > 0 && (
                          <div>
                            <span className="text-c-muted">FAA Candidates:</span>
                            {app.verification_data.candidates.map((c, idx) => (
                              <span key={idx} className="text-c-text ml-2">
                                {c.firstName} {c.lastName}{c.city ? `, ${c.city}` : ''}{c.state ? ` ${c.state}` : ''} [{c.certTypes.join('/')}]
                              </span>
                            ))}
                          </div>
                        )}
                        {app.verification_attempted_at && (
                          <p className="text-c-dim">Verified: {new Date(app.verification_attempted_at).toLocaleString()}</p>
                        )}
                      </div>
                    </td>
                  </tr>
                )}
                </React.Fragment>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-4">
          <p className="font-mono text-[10px] text-c-muted">
            PAGE {page} OF {totalPages}
          </p>
          <div className="flex gap-1">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="px-3 py-1.5 text-xs rounded-md bg-c-bezel text-c-muted font-mono uppercase border border-c-border hover:border-c-border-hi disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Previous
            </button>
            {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
              let pageNum: number;
              if (totalPages <= 7) {
                pageNum = i + 1;
              } else if (page <= 4) {
                pageNum = i + 1;
              } else if (page >= totalPages - 3) {
                pageNum = totalPages - 6 + i;
              } else {
                pageNum = page - 3 + i;
              }
              return (
                <button
                  key={pageNum}
                  onClick={() => setPage(pageNum)}
                  className={`px-3 py-1.5 text-xs rounded-md font-mono font-semibold transition-colors ${
                    page === pageNum
                      ? 'bg-c-amber text-c-bg'
                      : 'bg-c-bezel text-c-muted border border-c-border hover:border-c-border-hi'
                  }`}
                >
                  {pageNum}
                </button>
              );
            })}
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className="px-3 py-1.5 text-xs rounded-md bg-c-bezel text-c-muted font-mono uppercase border border-c-border hover:border-c-border-hi disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Next
            </button>
          </div>
        </div>
      )}

      {/* Reason Modal */}
      {reasonModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="bezel rounded-lg border border-c-border p-6 w-full max-w-md">
            <p className="font-mono text-xs text-c-cyan glow-c tracking-[0.3em] uppercase mb-3">
              // {reasonModal.action === 'reject' ? 'REJECT' : 'SUSPEND'} INSTRUCTOR
            </p>
            <h2 className="font-mono text-sm font-bold text-c-amber uppercase tracking-wider mb-4">
              {reasonModal.action === 'reject' ? 'Reject' : 'Suspend'} {reasonModal.name}?
            </h2>

            <label className="block font-mono text-[10px] text-c-muted uppercase tracking-wider mb-2">
              Reason (optional)
            </label>
            <textarea
              value={reasonText}
              onChange={(e) => setReasonText(e.target.value)}
              placeholder={`Why are you ${reasonModal.action === 'reject' ? 'rejecting' : 'suspending'} this instructor?`}
              className="w-full px-3 py-2 bg-c-panel border border-c-border rounded-lg font-mono text-xs text-c-text placeholder-c-dim focus:outline-none focus:ring-1 focus:ring-c-amber focus:border-c-amber transition-colors resize-none"
              rows={3}
            />

            <div className="flex items-center justify-end gap-3 mt-4">
              <button
                onClick={() => setReasonModal(null)}
                className="px-4 py-2 rounded-lg border border-c-border bg-c-bezel text-c-muted font-mono text-[10px] uppercase hover:border-c-border-hi transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={submitReasonAction}
                className={`px-4 py-2 rounded-lg border font-mono text-[10px] uppercase transition-colors ${
                  reasonModal.action === 'reject'
                    ? 'border-c-red/30 bg-c-red-dim text-c-red hover:bg-c-red/20'
                    : 'border-c-amber/30 bg-c-amber-lo text-c-amber hover:bg-c-amber/20'
                }`}
              >
                {reasonModal.action === 'reject' ? 'Reject' : 'Suspend'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
