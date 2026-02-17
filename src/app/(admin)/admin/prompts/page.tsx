'use client';

import { useEffect, useState, useCallback } from 'react';
import type { PromptVersion, PromptStatus } from '@/types/database';

const PROMPT_KEYS = [
  { value: 'examiner_system', label: 'Examiner System Prompt' },
  { value: 'assessment_system', label: 'Assessment System Prompt' },
  { value: 'planner_system', label: 'Planner System Prompt' },
  { value: 'rag_query', label: 'RAG Query Prompt' },
];

const STATUS_COLORS: Record<PromptStatus, string> = {
  draft: 'bg-gray-700 text-gray-300',
  published: 'bg-green-900/30 text-green-400',
  archived: 'bg-gray-800 text-gray-500',
};

export default function PromptsPage() {
  const [selectedKey, setSelectedKey] = useState(PROMPT_KEYS[0].value);
  const [versions, setVersions] = useState<PromptVersion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedVersion, setSelectedVersion] = useState<PromptVersion | null>(null);
  const [editorContent, setEditorContent] = useState('');
  const [changeSummary, setChangeSummary] = useState('');
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [isNewDraft, setIsNewDraft] = useState(false);

  const fetchVersions = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ prompt_key: selectedKey });
      const res = await fetch(`/api/admin/prompts?${params}`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `HTTP ${res.status}`);
      }
      const data = await res.json();
      const versionList: PromptVersion[] = data.versions || [];
      setVersions(versionList);

      // Auto-select the first version (latest)
      if (versionList.length > 0) {
        selectVersion(versionList[0]);
        setIsNewDraft(false);
      } else {
        setSelectedVersion(null);
        setEditorContent('');
        setIsNewDraft(false);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load prompts');
    } finally {
      setLoading(false);
    }
  }, [selectedKey]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    fetchVersions();
  }, [fetchVersions]);

  function selectVersion(v: PromptVersion) {
    setSelectedVersion(v);
    setEditorContent(v.content);
    setChangeSummary('');
    setIsNewDraft(false);
    setActionError(null);
  }

  function startNewDraft() {
    // Pre-fill with the currently published version's content
    const published = versions.find((v) => v.status === 'published');
    setEditorContent(published?.content || '');
    setChangeSummary('');
    setSelectedVersion(null);
    setIsNewDraft(true);
    setActionError(null);
  }

  async function saveDraft() {
    if (!editorContent.trim()) return;
    setSaving(true);
    setActionError(null);
    try {
      const res = await fetch('/api/admin/prompts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt_key: selectedKey,
          content: editorContent,
          change_summary: changeSummary || null,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `HTTP ${res.status}`);
      }
      await fetchVersions();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to save draft');
    } finally {
      setSaving(false);
    }
  }

  async function publishVersion(versionId: string) {
    if (!confirm('Publish this version? It will replace the currently published prompt.')) return;
    setPublishing(true);
    setActionError(null);
    try {
      const res = await fetch(`/api/admin/prompts/${versionId}/publish`, {
        method: 'POST',
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `HTTP ${res.status}`);
      }
      await fetchVersions();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to publish');
    } finally {
      setPublishing(false);
    }
  }

  async function rollbackVersion(versionId: string) {
    if (!confirm('Rollback? This will archive the current published version and restore the previous one.')) return;
    setPublishing(true);
    setActionError(null);
    try {
      const res = await fetch(`/api/admin/prompts/${versionId}/rollback`, {
        method: 'POST',
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `HTTP ${res.status}`);
      }
      await fetchVersions();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to rollback');
    } finally {
      setPublishing(false);
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-white">Prompt Management</h1>
        <button
          onClick={startNewDraft}
          className="px-4 py-2 text-sm rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors"
        >
          New Draft
        </button>
      </div>

      {/* Action Error */}
      {actionError && (
        <div className="bg-red-900/20 border border-red-800/50 rounded-lg p-3 mb-4 text-red-300 text-sm flex items-center justify-between">
          <span>{actionError}</span>
          <button onClick={() => setActionError(null)} className="text-red-400 hover:text-red-300 ml-3">
            &times;
          </button>
        </div>
      )}

      {/* Prompt Key Selector */}
      <div className="mb-6">
        <label className="block text-xs text-gray-500 uppercase tracking-wide mb-2">
          Prompt Key
        </label>
        <select
          value={selectedKey}
          onChange={(e) => {
            setSelectedKey(e.target.value);
            setIsNewDraft(false);
          }}
          className="px-4 py-2.5 bg-gray-900 border border-gray-800 rounded-lg text-sm text-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500 w-full max-w-xs"
        >
          {PROMPT_KEYS.map((pk) => (
            <option key={pk.value} value={pk.value}>
              {pk.label}
            </option>
          ))}
        </select>
      </div>

      {error && (
        <div className="bg-red-900/20 border border-red-800/50 rounded-xl p-4 mb-4">
          <p className="text-red-300 text-sm">{error}</p>
          <button onClick={fetchVersions} className="text-xs text-red-400 hover:text-red-300 underline mt-1">
            Retry
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Version List */}
        <div>
          <h2 className="text-sm font-medium text-gray-400 uppercase tracking-wide mb-3">
            Versions
          </h2>
          {loading ? (
            <div className="space-y-2">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="bg-gray-900 rounded-lg border border-gray-800 p-3 animate-pulse">
                  <div className="h-4 bg-gray-800 rounded w-20 mb-2" />
                  <div className="h-3 bg-gray-800 rounded w-32" />
                </div>
              ))}
            </div>
          ) : versions.length === 0 ? (
            <div className="bg-gray-900 rounded-lg border border-gray-800 p-4 text-center">
              <p className="text-gray-500 text-sm">No versions yet</p>
            </div>
          ) : (
            <div className="space-y-1.5">
              {versions.map((v) => {
                const isSelected = !isNewDraft && selectedVersion?.id === v.id;
                return (
                  <button
                    key={v.id}
                    onClick={() => selectVersion(v)}
                    className={`w-full text-left p-3 rounded-lg border transition-colors ${
                      isSelected
                        ? 'bg-gray-800 border-blue-500/50'
                        : 'bg-gray-900 border-gray-800 hover:bg-gray-800/50'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-300 font-medium">v{v.version}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_COLORS[v.status]}`}>
                        {v.status}
                      </span>
                    </div>
                    {v.change_summary && (
                      <p className="text-xs text-gray-500 mt-1 line-clamp-2">{v.change_summary}</p>
                    )}
                    <p className="text-xs text-gray-600 mt-1">
                      {new Date(v.created_at).toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                      })}
                    </p>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Editor */}
        <div className="lg:col-span-2">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-medium text-gray-400 uppercase tracking-wide">
              {isNewDraft
                ? 'New Draft'
                : selectedVersion
                ? `Version ${selectedVersion.version} (${selectedVersion.status})`
                : 'Select a version'}
            </h2>
            <div className="flex items-center gap-2">
              {/* Publish button — only for draft versions */}
              {selectedVersion?.status === 'draft' && (
                <button
                  onClick={() => publishVersion(selectedVersion.id)}
                  disabled={publishing}
                  className="px-3 py-1.5 text-xs rounded-md bg-green-900/30 text-green-300 hover:bg-green-900/50 transition-colors disabled:opacity-50"
                >
                  {publishing ? 'Publishing...' : 'Publish'}
                </button>
              )}
              {/* Rollback button — only for the currently published version */}
              {selectedVersion?.status === 'published' && (
                <button
                  onClick={() => rollbackVersion(selectedVersion.id)}
                  disabled={publishing}
                  className="px-3 py-1.5 text-xs rounded-md bg-amber-900/30 text-amber-300 hover:bg-amber-900/50 transition-colors disabled:opacity-50"
                >
                  {publishing ? 'Rolling back...' : 'Rollback'}
                </button>
              )}
            </div>
          </div>

          {/* Content Editor */}
          <textarea
            value={editorContent}
            onChange={(e) => setEditorContent(e.target.value)}
            disabled={!isNewDraft && selectedVersion?.status !== 'draft'}
            rows={20}
            className="w-full px-4 py-3 bg-gray-900 border border-gray-800 rounded-lg text-sm text-gray-200 font-mono placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-60 resize-y"
            placeholder="Enter prompt content..."
          />

          {/* Change Summary + Save (only for new drafts) */}
          {isNewDraft && (
            <div className="mt-3 space-y-3">
              <input
                type="text"
                value={changeSummary}
                onChange={(e) => setChangeSummary(e.target.value)}
                placeholder="What changed? (optional)"
                className="w-full px-3 py-2 bg-gray-900 border border-gray-800 rounded-lg text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <div className="flex justify-end">
                <button
                  onClick={saveDraft}
                  disabled={saving || !editorContent.trim()}
                  className="px-4 py-2 text-sm rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 disabled:hover:bg-blue-600 transition-colors"
                >
                  {saving ? 'Saving...' : 'Save as Draft'}
                </button>
              </div>
            </div>
          )}

          {/* Version metadata */}
          {selectedVersion && !isNewDraft && (
            <div className="mt-3 flex items-center gap-4 text-xs text-gray-600">
              <span>Created: {new Date(selectedVersion.created_at).toLocaleString()}</span>
              {selectedVersion.published_at && (
                <span>Published: {new Date(selectedVersion.published_at).toLocaleString()}</span>
              )}
              <span className="font-mono">{editorContent.length.toLocaleString()} chars</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
