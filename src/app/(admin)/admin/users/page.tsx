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

const TIER_COLORS: Record<VoiceTier, string> = {
  ground_school: 'bg-gray-700 text-gray-300',
  checkride_prep: 'bg-blue-900/40 text-blue-300',
  dpe_live: 'bg-purple-900/40 text-purple-300',
};

const TIER_LABELS: Record<VoiceTier, string> = {
  ground_school: 'Ground School',
  checkride_prep: 'Checkride Prep',
  dpe_live: 'DPE Live',
};

const STATUS_COLORS: Record<AccountStatus, string> = {
  active: 'bg-green-900/30 text-green-400',
  suspended: 'bg-yellow-900/30 text-yellow-400',
  banned: 'bg-red-900/30 text-red-400',
};

const PAGE_SIZE = 25;

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

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Users</h1>
          {data && (
            <p className="text-sm text-gray-500 mt-1">
              {data.total.toLocaleString()} total user{data.total !== 1 ? 's' : ''}
            </p>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 mb-4">
        <form onSubmit={handleSearch} className="flex-1 max-w-sm">
          <input
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search by email..."
            className="w-full px-3 py-2 bg-gray-900 border border-gray-800 rounded-lg text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </form>

        <select
          value={tierFilter}
          onChange={(e) => {
            setTierFilter(e.target.value as VoiceTier | 'all');
            setPage(1);
          }}
          className="px-3 py-2 bg-gray-900 border border-gray-800 rounded-lg text-sm text-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="all">All Tiers</option>
          <option value="ground_school">Ground School</option>
          <option value="checkride_prep">Checkride Prep</option>
          <option value="dpe_live">DPE Live</option>
        </select>

        <select
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value as AccountStatus | 'all');
            setPage(1);
          }}
          className="px-3 py-2 bg-gray-900 border border-gray-800 rounded-lg text-sm text-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="all">All Statuses</option>
          <option value="active">Active</option>
          <option value="suspended">Suspended</option>
          <option value="banned">Banned</option>
        </select>

        {(search || tierFilter !== 'all' || statusFilter !== 'all') && (
          <button
            onClick={() => {
              setSearch('');
              setSearchInput('');
              setTierFilter('all');
              setStatusFilter('all');
              setPage(1);
            }}
            className="text-xs text-gray-400 hover:text-white transition-colors"
          >
            Clear filters
          </button>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-900/20 border border-red-800/50 rounded-xl p-4 mb-4">
          <p className="text-red-300 text-sm">{error}</p>
          <button onClick={fetchUsers} className="text-xs text-red-400 hover:text-red-300 underline mt-1">
            Retry
          </button>
        </div>
      )}

      {/* Table */}
      <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-800 text-left">
              <th className="px-4 py-3 text-xs font-medium text-gray-500 uppercase">Email</th>
              <th className="px-4 py-3 text-xs font-medium text-gray-500 uppercase">Tier</th>
              <th className="px-4 py-3 text-xs font-medium text-gray-500 uppercase">Status</th>
              <th className="px-4 py-3 text-xs font-medium text-gray-500 uppercase">Sessions</th>
              <th className="px-4 py-3 text-xs font-medium text-gray-500 uppercase">Exchanges</th>
              <th className="px-4 py-3 text-xs font-medium text-gray-500 uppercase">Last Login</th>
              <th className="px-4 py-3 text-xs font-medium text-gray-500 uppercase">Joined</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800">
            {loading ? (
              [...Array(5)].map((_, i) => (
                <tr key={i}>
                  <td colSpan={7} className="px-4 py-3">
                    <div className="h-5 bg-gray-800 rounded animate-pulse" />
                  </td>
                </tr>
              ))
            ) : !data || data.users.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-12 text-center text-gray-500">
                  {search ? `No users matching "${search}"` : 'No users found'}
                </td>
              </tr>
            ) : (
              data.users.map((user) => (
                <tr key={user.id} className="hover:bg-gray-800/50 transition-colors">
                  <td className="px-4 py-3">
                    <Link
                      href={`/admin/users/${user.id}`}
                      className="text-blue-400 hover:text-blue-300 truncate max-w-[200px] block"
                    >
                      {user.email}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${TIER_COLORS[user.tier]}`}>
                      {TIER_LABELS[user.tier]}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_COLORS[user.account_status]}`}>
                      {user.account_status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-300">{user.session_count}</td>
                  <td className="px-4 py-3 text-gray-300">{user.total_exchanges}</td>
                  <td className="px-4 py-3 text-gray-500 text-xs">
                    {user.last_login_at
                      ? formatDate(user.last_login_at)
                      : 'Never'}
                  </td>
                  <td className="px-4 py-3 text-gray-500 text-xs">
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
          <p className="text-xs text-gray-500">
            Page {page} of {totalPages}
          </p>
          <div className="flex gap-1">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="px-3 py-1.5 text-xs rounded-md bg-gray-800 text-gray-300 hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Previous
            </button>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className="px-3 py-1.5 text-xs rounded-md bg-gray-800 text-gray-300 hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
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
