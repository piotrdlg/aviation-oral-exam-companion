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
  draft: 'font-mono text-[10px] bg-c-amber-lo text-c-amber px-2 py-0.5 rounded border border-c-amber/20',
  published: 'font-mono text-[10px] bg-c-green-lo text-c-green px-2 py-0.5 rounded border border-c-green/20',
  archived: 'font-mono text-[10px] bg-c-bezel text-c-dim px-2 py-0.5 rounded border border-c-border',
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
        <div>
          <p className="font-mono text-xs text-c-cyan glow-c tracking-[0.3em] uppercase mb-2">// PROMPT MANAGEMENT</p>
          <h1 className="text-2xl font-bold text-c-amber font-mono uppercase tracking-wider glow-a">PROMPT MANAGEMENT</h1>
        </div>
        <button
          onClick={startNewDraft}
          className="px-5 py-2.5 text-xs rounded-lg bg-c-amber text-c-bg font-mono font-semibold uppercase tracking-wide hover:bg-c-amber/90 transition-colors"
        >
          NEW DRAFT
        </button>
      </div>

      {/* Action Error */}
      {actionError && (
        <div className="iframe rounded-lg p-3 mb-4 border-l-2 border-c-red text-sm flex items-center justify-between">
          <span className="text-c-red">{actionError}</span>
          <button onClick={() => setActionError(null)} className="text-c-red hover:text-c-text ml-3 transition-colors">
            &times;
          </button>
        </div>
      )}

      {/* Prompt Key Selector + Filters */}
      <div className="mb-6 flex flex-wrap gap-4">
        <div>
          <label className="font-mono text-[10px] text-c-muted uppercase tracking-wider block mb-2">
            PROMPT KEY
          </label>
          <select
            value={selectedKey}
            onChange={(e) => {
              setSelectedKey(e.target.value);
              setIsNewDraft(false);
            }}
            className="px-3 py-2 bg-c-panel border border-c-border rounded-lg font-mono text-xs text-c-text focus:outline-none focus:ring-1 focus:ring-c-amber focus:border-c-amber transition-colors"
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
            DIFFICULTY
          </label>
          <select
            value={filterDifficulty}
            onChange={(e) => setFilterDifficulty(e.target.value)}
            className="px-3 py-2 bg-c-panel border border-c-border rounded-lg font-mono text-xs text-c-text focus:outline-none focus:ring-1 focus:ring-c-amber focus:border-c-amber transition-colors"
          >
            {DIFFICULTY_OPTIONS.map((d) => (
              <option key={d.value} value={d.value}>{d.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="font-mono text-[10px] text-c-muted uppercase tracking-wider block mb-2">
            STUDY MODE
          </label>
          <select
            value={filterStudyMode}
            onChange={(e) => setFilterStudyMode(e.target.value)}
            className="px-3 py-2 bg-c-panel border border-c-border rounded-lg font-mono text-xs text-c-text focus:outline-none focus:ring-1 focus:ring-c-amber focus:border-c-amber transition-colors"
          >
            {STUDY_MODE_OPTIONS.map((m) => (
              <option key={m.value} value={m.value}>{m.label}</option>
            ))}
          </select>
        </div>
      </div>

      {error && (
        <div className="iframe rounded-lg p-4 mb-4 border-l-2 border-c-red">
          <p className="text-c-red text-sm">{error}</p>
          <button onClick={fetchVersions} className="font-mono text-xs text-c-red hover:text-c-text underline mt-1 transition-colors">
            RETRY
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Version List */}
        <div>
          <h2 className="font-mono text-[10px] text-c-muted uppercase tracking-wider mb-3">
            VERSIONS
          </h2>
          {loading ? (
            <div className="space-y-2">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="iframe rounded-lg p-3 animate-pulse">
                  <div className="h-4 bg-c-bezel rounded w-20 mb-2" />
                  <div className="h-3 bg-c-bezel rounded w-32" />
                </div>
              ))}
            </div>
          ) : versions.length === 0 ? (
            <div className="iframe rounded-lg p-4 text-center">
              <p className="text-c-dim text-sm font-mono">NO VERSIONS YET</p>
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
                    className={`w-full text-left iframe rounded-lg p-3 transition-colors ${
                      isSelected
                        ? 'border-l-2 border-c-amber ring-1 ring-c-amber/20'
                        : 'hover:border-c-border-hi'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-xs font-semibold text-c-text uppercase">V{v.version}</span>
                      <span className={STATUS_COLORS[v.status]}>
                        {v.status.toUpperCase()}
                      </span>
                    </div>
                    <div className="flex gap-1 mt-1.5 flex-wrap">
                      {v.difficulty && (
                        <span className="font-mono text-[10px] bg-c-cyan-lo text-c-cyan px-2 py-0.5 rounded border border-c-cyan/20">
                          {v.difficulty.toUpperCase()}
                        </span>
                      )}
                      {v.study_mode && (
                        <span className="font-mono text-[10px] bg-c-cyan-lo text-c-cyan px-2 py-0.5 rounded border border-c-cyan/20">
                          {v.study_mode.toUpperCase()}
                        </span>
                      )}
                      {v.rating && (
                        <span className="font-mono text-[10px] bg-c-amber-lo text-c-amber px-2 py-0.5 rounded border border-c-amber/20">
                          {v.rating.toUpperCase()}
                        </span>
                      )}
                      {!v.difficulty && !v.study_mode && !v.rating && (
                        <span className="font-mono text-[10px] bg-c-bezel text-c-dim px-2 py-0.5 rounded border border-c-border">
                          GENERIC
                        </span>
                      )}
                    </div>
                    {v.change_summary && (
                      <p className="text-xs text-c-dim mt-1 line-clamp-2">{v.change_summary}</p>
                    )}
                    <p className="font-mono text-[10px] text-c-dim mt-1">
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
                ? 'NEW DRAFT'
                : selectedVersion
                ? `VERSION ${selectedVersion.version} (${selectedVersion.status.toUpperCase()})`
                : 'SELECT A VERSION'}
            </h2>
            <div className="flex items-center gap-2">
              {/* Publish button — only for draft versions */}
              {selectedVersion?.status === 'draft' && (
                <button
                  onClick={() => publishVersion(selectedVersion.id)}
                  disabled={publishing}
                  className="px-4 py-2 text-xs rounded-lg font-mono font-semibold uppercase tracking-wide bg-c-amber hover:bg-c-amber/90 text-c-bg transition-colors disabled:opacity-50"
                >
                  {publishing ? 'PUBLISHING...' : 'PUBLISH'}
                </button>
              )}
              {/* Rollback button — only for the currently published version */}
              {selectedVersion?.status === 'published' && (
                <button
                  onClick={() => rollbackVersion(selectedVersion.id)}
                  disabled={publishing}
                  className="px-4 py-2 text-xs rounded-lg font-mono font-semibold uppercase tracking-wide bg-c-red/80 hover:bg-c-red text-c-text transition-colors disabled:opacity-50"
                >
                  {publishing ? 'ROLLING BACK...' : 'ROLLBACK'}
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
            className="fb-textarea w-full px-3 py-2.5 bg-c-panel border border-c-border rounded-lg text-c-text font-mono text-xs focus:outline-none focus:border-c-amber placeholder-c-dim disabled:opacity-60 resize-y transition-colors"
            placeholder="Enter prompt content..."
          />

          {/* Change Summary + Dimensions + Save (only for new drafts) */}
          {isNewDraft && (
            <div className="mt-3 space-y-3">
              <div className="flex gap-3">
                <div className="flex-1">
                  <label className="font-mono text-[10px] text-c-muted uppercase tracking-wider block mb-1">DIFFICULTY</label>
                  <select
                    value={draftDifficulty}
                    onChange={(e) => setDraftDifficulty(e.target.value)}
                    className="w-full px-3 py-2 bg-c-panel border border-c-border rounded-lg font-mono text-xs text-c-text focus:outline-none focus:ring-1 focus:ring-c-amber focus:border-c-amber transition-colors"
                  >
                    <option value="">Any (generic)</option>
                    <option value="easy">Easy</option>
                    <option value="medium">Medium</option>
                    <option value="hard">Hard</option>
                    <option value="mixed">Mixed</option>
                  </select>
                </div>
                <div className="flex-1">
                  <label className="font-mono text-[10px] text-c-muted uppercase tracking-wider block mb-1">STUDY MODE</label>
                  <select
                    value={draftStudyMode}
                    onChange={(e) => setDraftStudyMode(e.target.value)}
                    className="w-full px-3 py-2 bg-c-panel border border-c-border rounded-lg font-mono text-xs text-c-text focus:outline-none focus:ring-1 focus:ring-c-amber focus:border-c-amber transition-colors"
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
                className="w-full px-3 py-2 bg-c-panel border border-c-border rounded-lg font-mono text-xs text-c-text placeholder-c-dim focus:outline-none focus:ring-1 focus:ring-c-amber focus:border-c-amber transition-colors"
              />
              <div className="flex justify-end">
                <button
                  onClick={saveDraft}
                  disabled={saving || !editorContent.trim()}
                  className="px-5 py-2.5 text-xs rounded-lg bg-c-amber text-c-bg font-mono font-semibold uppercase tracking-wide hover:bg-c-amber/90 disabled:opacity-50 disabled:hover:bg-c-amber transition-colors"
                >
                  {saving ? 'SAVING...' : 'SAVE AS DRAFT'}
                </button>
              </div>
            </div>
          )}

          {/* Version metadata */}
          {selectedVersion && !isNewDraft && (
            <div className="mt-3 iframe rounded-lg p-3 flex items-center gap-4">
              <span className="font-mono text-[10px] text-c-dim uppercase">Created: {new Date(selectedVersion.created_at).toLocaleString()}</span>
              {selectedVersion.published_at && (
                <span className="font-mono text-[10px] text-c-dim uppercase">Published: {new Date(selectedVersion.published_at).toLocaleString()}</span>
              )}
              <span className="font-mono text-[10px] text-c-muted">{editorContent.length.toLocaleString()} CHARS</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
