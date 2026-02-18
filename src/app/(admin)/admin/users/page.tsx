'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import type { VoiceTier, AccountStatus } from '@/types/database';

interface UserRow {
  id: string;
  email: string;
  tier: VoiceTier;
  account_status: AccountStatus;
  subscription_status: string;
  last_login_at: string | null;
  created_at: string;
  session_count: number;
  total_exchanges: number;
}

interface UsersResponse {
  users: UserRow[];
  total: number;
  page: number;
  pageSize: number;
}

const TIER_LABELS: Record<VoiceTier, string> = {
  ground_school: 'Ground School',
  checkride_prep: 'Checkride Prep',
  dpe_live: 'DPE Live',
};

const PAGE_SIZE = 25;

function TierBadge({ tier }: { tier: VoiceTier }) {
  const styles: Record<VoiceTier, string> = {
    ground_school: 'bg-c-elevated text-c-muted border-c-border',
    checkride_prep: 'bg-c-amber-lo text-c-amber border-c-amber/20',
    dpe_live: 'bg-c-green-lo text-c-green border-c-green/20',
  };
  return (
    <span className={`font-mono text-[10px] px-2 py-0.5 rounded border uppercase ${styles[tier]}`}>
      {TIER_LABELS[tier]}
    </span>
  );
}

function StatusBadge({ status }: { status: AccountStatus }) {
  const styles: Record<AccountStatus, string> = {
    active: 'bg-c-green-lo text-c-green border-c-green/20',
    suspended: 'bg-c-amber-lo text-c-amber border-c-amber/20',
    banned: 'bg-c-red-dim text-c-red border-c-red/20',
  };
  return (
    <span className={`font-mono text-[10px] px-2 py-0.5 rounded border uppercase ${styles[status]}`}>
      {status}
    </span>
  );
}

export default function UsersPage() {
  const [data, setData] = useState<UsersResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [page, setPage] = useState(1);
  const [tierFilter, setTierFilter] = useState<VoiceTier | 'all'>('all');
  const [statusFilter, setStatusFilter] = useState<AccountStatus | 'all'>('all');

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        page: page.toString(),
        pageSize: PAGE_SIZE.toString(),
      });
      if (search) params.set('search', search);
      if (tierFilter !== 'all') params.set('tier', tierFilter);
      if (statusFilter !== 'all') params.set('status', statusFilter);

      const res = await fetch(`/api/admin/users?${params}`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `HTTP ${res.status}`);
      }
      const result = await res.json();
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load users');
    } finally {
      setLoading(false);
    }
  }, [page, search, tierFilter, statusFilter]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    setPage(1);
    setSearch(searchInput);
  }

  const totalPages = data ? Math.ceil(data.total / PAGE_SIZE) : 0;

  const tierOptions: { value: VoiceTier | 'all'; label: string }[] = [
    { value: 'all', label: 'All Tiers' },
    { value: 'ground_school', label: 'Ground School' },
    { value: 'checkride_prep', label: 'Checkride Prep' },
    { value: 'dpe_live', label: 'DPE Live' },
  ];

  const statusOptions: { value: AccountStatus | 'all'; label: string }[] = [
    { value: 'all', label: 'All Statuses' },
    { value: 'active', label: 'Active' },
    { value: 'suspended', label: 'Suspended' },
    { value: 'banned', label: 'Banned' },
  ];

  return (
    <div>
      <div className="mb-6">
        <p className="font-mono text-xs text-c-cyan glow-c tracking-[0.3em] uppercase mb-2">// USER DIRECTORY</p>
        <h1 className="text-2xl font-bold text-c-amber font-mono uppercase tracking-wider glow-a">Users</h1>
        {data && (
          <p className="font-mono text-[10px] text-c-muted mt-1">
            {data.total.toLocaleString()} TOTAL USER{data.total !== 1 ? 'S' : ''}
          </p>
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <form onSubmit={handleSearch} className="flex-1 max-w-sm">
          <input
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search by email..."
            className="w-full px-3 py-2 bg-c-panel border border-c-border rounded-lg font-mono text-xs text-c-text placeholder-c-dim focus:outline-none focus:ring-1 focus:ring-c-amber focus:border-c-amber transition-colors"
          />
        </form>

        {/* Tier filter buttons */}
        <div className="flex gap-1.5">
          {tierOptions.map((opt) => (
            <button
              key={opt.value}
              onClick={() => {
                setTierFilter(opt.value);
                setPage(1);
              }}
              className={`px-3 py-1.5 rounded-lg border font-mono text-[10px] uppercase transition-colors ${
                tierFilter === opt.value
                  ? 'border-c-amber/50 bg-c-amber-lo/50 text-c-amber font-semibold'
                  : 'border-c-border bg-c-bezel text-c-muted hover:border-c-border-hi'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {/* Status filter buttons */}
        <div className="flex gap-1.5">
          {statusOptions.map((opt) => (
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

        {(search || tierFilter !== 'all' || statusFilter !== 'all') && (
          <button
            onClick={() => {
              setSearch('');
              setSearchInput('');
              setTierFilter('all');
              setStatusFilter('all');
              setPage(1);
            }}
            className="font-mono text-[10px] text-c-muted hover:text-c-amber uppercase transition-colors"
          >
            Clear filters
          </button>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="bg-c-red-dim/40 border border-c-red/20 rounded-lg p-4 mb-4">
          <p className="text-c-red text-sm">{error}</p>
          <button onClick={fetchUsers} className="font-mono text-[10px] text-c-red hover:text-c-text uppercase mt-1 transition-colors">
            Retry
          </button>
        </div>
      )}

      {/* Table */}
      <div className="bezel rounded-lg border border-c-border overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-c-panel border-b border-c-border text-left">
              <th className="px-4 py-3 font-mono text-[10px] font-medium text-c-muted uppercase tracking-wider">Email</th>
              <th className="px-4 py-3 font-mono text-[10px] font-medium text-c-muted uppercase tracking-wider">Tier</th>
              <th className="px-4 py-3 font-mono text-[10px] font-medium text-c-muted uppercase tracking-wider">Status</th>
              <th className="px-4 py-3 font-mono text-[10px] font-medium text-c-muted uppercase tracking-wider">Sessions</th>
              <th className="px-4 py-3 font-mono text-[10px] font-medium text-c-muted uppercase tracking-wider">Exchanges</th>
              <th className="px-4 py-3 font-mono text-[10px] font-medium text-c-muted uppercase tracking-wider">Last Login</th>
              <th className="px-4 py-3 font-mono text-[10px] font-medium text-c-muted uppercase tracking-wider">Joined</th>
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
            ) : !data || data.users.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-12 text-center text-c-dim font-mono text-xs">
                  {search ? `No users matching "${search}"` : 'No users found'}
                </td>
              </tr>
            ) : (
              data.users.map((user) => (
                <tr key={user.id} className="hover:bg-c-elevated/50 transition-colors border-b border-c-border">
                  <td className="px-4 py-3">
                    <Link
                      href={`/admin/users/${user.id}`}
                      className="text-c-text font-mono text-xs hover:text-c-amber transition-colors truncate max-w-[200px] block"
                    >
                      {user.email}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <TierBadge tier={user.tier} />
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={user.account_status} />
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-c-text tabular-nums">{user.session_count}</td>
                  <td className="px-4 py-3 font-mono text-xs text-c-text tabular-nums">{user.total_exchanges}</td>
                  <td className="px-4 py-3 font-mono text-[10px] text-c-dim">
                    {user.last_login_at
                      ? formatDate(user.last_login_at)
                      : 'Never'}
                  </td>
                  <td className="px-4 py-3 font-mono text-[10px] text-c-dim">
                    {formatDate(user.created_at)}
                  </td>
                </tr>
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
    </div>
  );
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}
