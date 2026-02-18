'use client';

import { useEffect, useState, useCallback } from 'react';
import type { PromptVersion, PromptStatus } from '@/types/database';

const PROMPT_KEYS = [
  { value: 'examiner_system', label: 'Examiner System Prompt' },
  { value: 'assessment_system', label: 'Assessment System Prompt' },
  { value: 'planner_system', label: 'Planner System Prompt' },
  { value: 'rag_query', label: 'RAG Query Prompt' },
];

const DIFFICULTY_OPTIONS = [
  { value: '', label: 'All Difficulties' },
  { value: 'easy', label: 'Easy' },
  { value: 'medium', label: 'Medium' },
  { value: 'hard', label: 'Hard' },
  { value: 'mixed', label: 'Mixed' },
];

const STUDY_MODE_OPTIONS = [
  { value: '', label: 'All Modes' },
  { value: 'linear', label: 'Linear' },
  { value: 'cross_acs', label: 'Cross-ACS' },
];

const STATUS_COLORS: Record<PromptStatus, string> = {
  draft: 'bg-c-elevated text-c-text',
  published: 'bg-green-900/30 text-c-green',
  archived: 'bg-c-bezel text-c-dim',
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
  const [filterDifficulty, setFilterDifficulty] = useState('');
  const [filterStudyMode, setFilterStudyMode] = useState('');
  const [draftDifficulty, setDraftDifficulty] = useState('');
  const [draftStudyMode, setDraftStudyMode] = useState('');

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
          difficulty: draftDifficulty || null,
          study_mode: draftStudyMode || null,
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
        <h1 className="text-2xl font-bold text-c-text font-mono uppercase tracking-wider">Prompt Management</h1>
        <button
          onClick={startNewDraft}
          className="px-4 py-2 text-sm rounded-lg bg-c-amber text-c-text font-mono uppercase hover:bg-c-amber/90 transition-colors"
        >
          New Draft
        </button>
      </div>

      {/* Action Error */}
      {actionError && (
        <div className="bg-c-red-dim/40 border border-red-800/50 rounded-lg p-3 mb-4 text-red-300 text-sm flex items-center justify-between">
          <span>{actionError}</span>
          <button onClick={() => setActionError(null)} className="text-c-red hover:text-red-300 ml-3">
            &times;
          </button>
        </div>
      )}

      {/* Prompt Key Selector + Filters */}
      <div className="mb-6 flex flex-wrap gap-4">
        <div>
          <label className="font-mono text-[10px] text-c-muted uppercase tracking-wider block mb-2">
            Prompt Key
          </label>
          <select
            value={selectedKey}
            onChange={(e) => {
              setSelectedKey(e.target.value);
              setIsNewDraft(false);
            }}
            className="px-4 py-2.5 bg-c-panel border border-c-border rounded-lg text-sm text-c-text focus:outline-none focus:ring-2 focus:ring-c-amber"
          >
            {PROMPT_KEYS.map((pk) => (
              <option key={pk.value} value={pk.value}>
                {pk.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="font-mono text-[10px] text-c-muted uppercase tracking-wider block mb-2">
            Difficulty
          </label>
          <select
            value={filterDifficulty}
            onChange={(e) => setFilterDifficulty(e.target.value)}
            className="px-4 py-2.5 bg-c-panel border border-c-border rounded-lg text-sm text-c-text focus:outline-none focus:ring-2 focus:ring-c-amber"
          >
            {DIFFICULTY_OPTIONS.map((d) => (
              <option key={d.value} value={d.value}>{d.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="font-mono text-[10px] text-c-muted uppercase tracking-wider block mb-2">
            Study Mode
          </label>
          <select
            value={filterStudyMode}
            onChange={(e) => setFilterStudyMode(e.target.value)}
            className="px-4 py-2.5 bg-c-panel border border-c-border rounded-lg text-sm text-c-text focus:outline-none focus:ring-2 focus:ring-c-amber"
          >
            {STUDY_MODE_OPTIONS.map((m) => (
              <option key={m.value} value={m.value}>{m.label}</option>
            ))}
          </select>
        </div>
      </div>

      {error && (
        <div className="bg-c-red-dim/40 border border-red-800/50 rounded-lg p-4 mb-4">
          <p className="text-red-300 text-sm">{error}</p>
          <button onClick={fetchVersions} className="text-xs text-c-red hover:text-red-300 underline mt-1">
            Retry
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Version List */}
        <div>
          <h2 className="font-mono text-[10px] text-c-muted uppercase tracking-wider mb-3">
            Versions
          </h2>
          {loading ? (
            <div className="space-y-2">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="bezel rounded-lg border border-c-border p-3 animate-pulse">
                  <div className="h-4 bg-c-bezel rounded w-20 mb-2" />
                  <div className="h-3 bg-c-bezel rounded w-32" />
                </div>
              ))}
            </div>
          ) : versions.length === 0 ? (
            <div className="bezel rounded-lg border border-c-border p-4 text-center">
              <p className="text-c-dim text-sm">No versions yet</p>
            </div>
          ) : (
            <div className="space-y-1.5">
              {versions
                .filter((v) => {
                  if (filterDifficulty && v.difficulty !== filterDifficulty) return false;
                  if (filterStudyMode && v.study_mode !== filterStudyMode) return false;
                  return true;
                })
                .map((v) => {
                const isSelected = !isNewDraft && selectedVersion?.id === v.id;
                return (
                  <button
                    key={v.id}
                    onClick={() => selectVersion(v)}
                    className={`w-full text-left p-3 rounded-lg border transition-colors ${
                      isSelected
                        ? 'bg-c-bezel border-c-amber/50'
                        : 'bg-c-panel border-c-border hover:bg-c-bezel/50'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-c-text font-medium">v{v.version}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_COLORS[v.status]}`}>
                        {v.status}
                      </span>
                    </div>
                    <div className="flex gap-1 mt-1 flex-wrap">
                      {v.difficulty && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-900/30 text-purple-400">
                          {v.difficulty}
                        </span>
                      )}
                      {v.study_mode && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-cyan-900/30 text-cyan-400">
                          {v.study_mode}
                        </span>
                      )}
                      {v.rating && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-900/30 text-c-amber">
                          {v.rating}
                        </span>
                      )}
                      {!v.difficulty && !v.study_mode && !v.rating && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-c-bezel text-c-dim">
                          generic
                        </span>
                      )}
                    </div>
                    {v.change_summary && (
                      <p className="text-xs text-c-dim mt-1 line-clamp-2">{v.change_summary}</p>
                    )}
                    <p className="text-xs text-c-dim mt-1">
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
            <h2 className="font-mono text-[10px] text-c-muted uppercase tracking-wider">
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
                  className="px-3 py-1.5 text-xs rounded-md font-mono uppercase bg-green-900/30 text-green-300 hover:bg-green-900/50 transition-colors disabled:opacity-50"
                >
                  {publishing ? 'Publishing...' : 'Publish'}
                </button>
              )}
              {/* Rollback button — only for the currently published version */}
              {selectedVersion?.status === 'published' && (
                <button
                  onClick={() => rollbackVersion(selectedVersion.id)}
                  disabled={publishing}
                  className="px-3 py-1.5 text-xs rounded-md font-mono uppercase bg-amber-900/30 text-amber-300 hover:bg-amber-900/50 transition-colors disabled:opacity-50"
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
            className="w-full px-4 py-3 bg-c-panel border border-c-border rounded-lg text-sm text-c-text font-mono placeholder-c-dim focus:outline-none focus:ring-2 focus:ring-c-amber disabled:opacity-60 resize-y"
            placeholder="Enter prompt content..."
          />

          {/* Change Summary + Dimensions + Save (only for new drafts) */}
          {isNewDraft && (
            <div className="mt-3 space-y-3">
              <div className="flex gap-3">
                <div className="flex-1">
                  <label className="font-mono text-[10px] text-c-muted uppercase tracking-wider block mb-1">Difficulty</label>
                  <select
                    value={draftDifficulty}
                    onChange={(e) => setDraftDifficulty(e.target.value)}
                    className="w-full px-3 py-2 bg-c-panel border border-c-border rounded-lg text-sm text-c-text focus:outline-none focus:ring-2 focus:ring-c-amber"
                  >
                    <option value="">Any (generic)</option>
                    <option value="easy">Easy</option>
                    <option value="medium">Medium</option>
                    <option value="hard">Hard</option>
                    <option value="mixed">Mixed</option>
                  </select>
                </div>
                <div className="flex-1">
                  <label className="font-mono text-[10px] text-c-muted uppercase tracking-wider block mb-1">Study Mode</label>
                  <select
                    value={draftStudyMode}
                    onChange={(e) => setDraftStudyMode(e.target.value)}
                    className="w-full px-3 py-2 bg-c-panel border border-c-border rounded-lg text-sm text-c-text focus:outline-none focus:ring-2 focus:ring-c-amber"
                  >
                    <option value="">Any (generic)</option>
                    <option value="linear">Linear</option>
                    <option value="cross_acs">Cross-ACS</option>
                  </select>
                </div>
              </div>
              <input
                type="text"
                value={changeSummary}
                onChange={(e) => setChangeSummary(e.target.value)}
                placeholder="What changed? (optional)"
                className="w-full px-3 py-2 bg-c-panel border border-c-border rounded-lg text-sm text-c-text placeholder-c-dim focus:outline-none focus:ring-2 focus:ring-c-amber"
              />
              <div className="flex justify-end">
                <button
                  onClick={saveDraft}
                  disabled={saving || !editorContent.trim()}
                  className="px-4 py-2 text-sm rounded-lg bg-c-amber text-c-text font-mono uppercase hover:bg-c-amber/90 disabled:opacity-50 disabled:hover:bg-c-amber transition-colors"
                >
                  {saving ? 'Saving...' : 'Save as Draft'}
                </button>
              </div>
            </div>
          )}

          {/* Version metadata */}
          {selectedVersion && !isNewDraft && (
            <div className="mt-3 flex items-center gap-4 text-xs text-c-dim">
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
