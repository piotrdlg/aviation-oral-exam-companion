'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import type { AircraftClass, Rating, ExaminerProfileKey } from '@/types/database';
import { EXAMINER_PROFILES } from '@/lib/examiner-profile';

export interface SessionConfigData {
  rating: Rating;
  studyMode: 'linear' | 'cross_acs' | 'weak_areas' | 'quick_drill' | 'scenario';
  difficulty: 'easy' | 'medium' | 'hard' | 'mixed';
  aircraftClass: AircraftClass;
  selectedAreas: string[];
  selectedTasks: string[];
  voiceEnabled: boolean;
  isOnboarding?: boolean;
  examinerProfileKey?: ExaminerProfileKey;
}

const RATING_LABELS: Record<string, string> = {
  private: 'Private Pilot',
  commercial: 'Commercial',
  instrument: 'Instrument',
  atp: 'ATP',
};

interface AcsTaskItem {
  id: string;
  area: string;
  task: string;
  applicable_classes: string[];
}

interface AreaGroup {
  areaId: string;
  areaName: string;
  tasks: AcsTaskItem[];
}

interface Props {
  onStart: (config: SessionConfigData) => void;
  loading?: boolean;
  preferredRating?: Rating;
  preferredAircraftClass?: AircraftClass;
  prefsLoaded?: boolean;
  preferredVoiceEnabled?: boolean;
  hasCompletedExams?: boolean;
  examinerProfileKey?: ExaminerProfileKey;
  /** Show the 'Mock Checkride' scenario card (exam.scenario_engine = on). */
  scenarioModeAvailable?: boolean;
}

export default function SessionConfig({ onStart, loading, preferredRating, preferredAircraftClass, prefsLoaded, preferredVoiceEnabled, hasCompletedExams, examinerProfileKey, scenarioModeAvailable }: Props) {
  const rating = preferredRating || 'private';
  const aircraftClass = preferredAircraftClass || 'ASEL';
  const prefsLoading = prefsLoaded === undefined ? false : !prefsLoaded;
  const [studyMode, setStudyMode] = useState<SessionConfigData['studyMode']>('linear');
  const [difficulty, setDifficulty] = useState<SessionConfigData['difficulty']>('mixed');
  const [selectedTasks, setSelectedTasks] = useState<string[]>([]);
  const [voiceEnabled, setVoiceEnabled] = useState(preferredVoiceEnabled ?? true);
  const resolvedProfile = examinerProfileKey ? EXAMINER_PROFILES[examinerProfileKey] : EXAMINER_PROFILES.maria_methodical;
  const [expandedAreas, setExpandedAreas] = useState<Set<string>>(new Set());
  const [showSecondary, setShowSecondary] = useState(true);
  const [allTasks, setAllTasks] = useState<AcsTaskItem[]>([]);
  const [tasksLoading, setTasksLoading] = useState(false);

  // Sync voice preference when it loads from the API
  useEffect(() => {
    if (preferredVoiceEnabled !== undefined) {
      setVoiceEnabled(preferredVoiceEnabled);
    }
  }, [preferredVoiceEnabled]);

  // Fetch tasks from DB when rating changes (wait for prefs to load)
  useEffect(() => {
    if (prefsLoading) return;
    setTasksLoading(true);
    setSelectedTasks([]);
    fetch(`/api/exam?action=list-tasks&rating=${rating}`)
      .then((res) => res.json())
      .then((data) => setAllTasks(data.tasks || []))
      .catch(() => {})
      .finally(() => setTasksLoading(false));
  }, [rating, prefsLoading]);

  // Filter tasks by aircraft class
  const filteredTasks = useMemo(
    () => allTasks.filter((t) => t.applicable_classes?.includes(aircraftClass)),
    [allTasks, aircraftClass]
  );

  // Group tasks by area
  const areaGroups = useMemo(() => {
    const map = new Map<string, AcsTaskItem[]>();
    for (const task of filteredTasks) {
      const existing = map.get(task.area) || [];
      existing.push(task);
      map.set(task.area, existing);
    }
    const groups: AreaGroup[] = [];
    for (const [areaName, tasks] of map) {
      const areaId = tasks[0]?.id.split('.')[1] || '';
      groups.push({ areaId, areaName, tasks });
    }
    const romanOrder = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];
    groups.sort((a, b) => romanOrder.indexOf(a.areaId) - romanOrder.indexOf(b.areaId));
    return groups;
  }, [filteredTasks]);

  function toggleTask(taskId: string) {
    setSelectedTasks((prev) =>
      prev.includes(taskId) ? prev.filter((t) => t !== taskId) : [...prev, taskId]
    );
  }

  function toggleArea(areaId: string) {
    const areaTasks = areaGroups.find((g) => g.areaId === areaId)?.tasks || [];
    const areaTaskIds = areaTasks.map((t) => t.id);
    const allSelected = areaTaskIds.every((id) => selectedTasks.includes(id));

    if (allSelected) {
      setSelectedTasks((prev) => prev.filter((id) => !areaTaskIds.includes(id)));
    } else {
      setSelectedTasks((prev) => [...new Set([...prev, ...areaTaskIds])]);
    }
  }

  // Derive selectedAreas from selectedTasks for backwards compatibility
  const selectedAreas = useMemo(() => {
    if (selectedTasks.length === 0) return [];
    const areas = new Set(selectedTasks.map((id) => id.split('.')[1]));
    return Array.from(areas);
  }, [selectedTasks]);

  // Auto-expand first area when areaGroups loads
  useEffect(() => {
    if (areaGroups.length > 0 && expandedAreas.size === 0) {
      setExpandedAreas(new Set([areaGroups[0].areaId]));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [areaGroups.length]);

  function toggleExpandArea(areaId: string) {
    setExpandedAreas((prev) => {
      const next = new Set(prev);
      if (next.has(areaId)) next.delete(areaId);
      else next.add(areaId);
      return next;
    });
  }

  // Summary computation
  const summaryMode = studyMode === 'linear' ? 'Area by Area' : studyMode === 'cross_acs' ? 'Across ACS' : studyMode === 'weak_areas' ? 'Weak Areas' : studyMode === 'scenario' ? 'Mock Checkride' : 'Quick Drill';
  const summaryScope = selectedTasks.length > 0
    ? `${selectedAreas.length} ${selectedAreas.length === 1 ? 'area' : 'areas'} \u00b7 ${selectedTasks.length} ${selectedTasks.length === 1 ? 'task' : 'tasks'}`
    : `All ${filteredTasks.length} tasks`;
  const summaryDiff = difficulty === 'mixed' ? 'Mixed' : difficulty.charAt(0).toUpperCase() + difficulty.slice(1);

  return (
    <div className="bezel rounded-xl border border-c-border p-6">
      <h2 className="font-semibold text-lg text-c-text tracking-tight mb-5">New exam</h2>
      <div className="space-y-5">
        {/* Rating & Class (read-only from Settings) */}
        <div className="flex items-center justify-between px-4 py-3 bg-c-panel rounded-lg border border-c-border">
          {prefsLoading ? (
            <span className="text-sm text-c-dim">Loading preferences…</span>
          ) : (
            <span className="text-sm font-medium">
              <span className="text-c-green-readable font-semibold">{RATING_LABELS[rating] || rating}</span>
              <span className="text-c-muted mx-2">&middot;</span>
              <span className="text-c-cyan-readable font-semibold">{rating === 'instrument' ? 'Airplane' : aircraftClass}</span>
            </span>
          )}
          <Link
            href="/settings"
            className="text-xs text-c-amber hover:text-c-amber-bright transition-colors whitespace-nowrap ml-3"
          >
            Change in settings &rarr;
          </Link>
        </div>

        {/* Study Mode */}
        <div>
          <label className="block font-mono text-[11px] text-c-muted mb-1 tracking-wider uppercase">Study mode</label>
          <p className="text-xs text-c-dim mb-2.5">How the examiner moves through the ACS during your session.</p>
          <div className="grid grid-cols-2 gap-2">
            {([
              ...(scenarioModeAvailable ? [{ value: 'scenario' as const, label: 'Mock checkride', desc: 'Scenario-based oral \u2014 questions flow from an assigned flight', locked: false }] : []),
              { value: 'linear' as const, label: 'Area by area', desc: 'One ACS area at a time, in order', locked: false },
              { value: 'cross_acs' as const, label: 'Across the ACS', desc: 'Random questions across all areas', locked: false },
              { value: 'weak_areas' as const, label: 'Weak areas', desc: 'Focus on your gaps', locked: false },
              { value: 'quick_drill' as const, label: 'Quick drill', desc: '10\u201320 focused questions on weak areas', locked: !hasCompletedExams },
            ] as const).map((mode) => (
              <button
                key={mode.value}
                onClick={() => !mode.locked && setStudyMode(mode.value)}
                disabled={mode.locked}
                className={`p-3.5 rounded-lg border text-left transition-colors ${
                  mode.locked
                    ? 'border-c-border bg-c-bezel opacity-50 cursor-not-allowed'
                    : studyMode === mode.value
                    ? 'station border-c-amber ring-1 ring-c-amber/30'
                    : 'border-c-border bg-c-bezel hover:border-c-border-hi'
                }`}
              >
                <p className={`text-sm ${
                  mode.locked ? 'font-medium text-c-dim'
                    : studyMode === mode.value ? 'font-semibold text-c-amber'
                    : 'font-medium text-c-text'
                }`}>{mode.label}</p>
                <p className="text-xs text-c-muted mt-1 leading-relaxed">{mode.desc}</p>
                {mode.locked && (
                  <p className="text-[11px] text-c-dim mt-1">Complete at least one exam to unlock</p>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Focus Section */}
        <div>
          <label className="block font-mono text-xs text-c-muted mb-2 tracking-wider uppercase">FOCUS</label>
          <div className="border border-c-border rounded-lg bg-c-panel overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-c-border">
              <span className="font-mono text-xs text-c-cyan uppercase tracking-wide">
                ACS Areas &mdash; {(RATING_LABELS[rating] || rating)}
              </span>
              {selectedTasks.length > 0 && (
                <span className="font-mono text-xs text-c-dim">
                  {selectedAreas.length} of {areaGroups.length} selected
                </span>
              )}
            </div>

            {/* Area rows */}
            {tasksLoading ? (
              <p className="p-3 text-sm text-c-dim">Loading…</p>
            ) : areaGroups.length === 0 ? (
              <p className="p-3 text-sm text-c-dim">No tasks found.</p>
            ) : (
              areaGroups.map((group, groupIdx) => {
                const areaTaskIds = group.tasks.map((t) => t.id);
                const allSelected = areaTaskIds.length > 0 && areaTaskIds.every((id) => selectedTasks.includes(id));
                const someSelected = areaTaskIds.some((id) => selectedTasks.includes(id));
                const isExpanded = expandedAreas.has(group.areaId);
                const isLast = groupIdx === areaGroups.length - 1;

                return (
                  <div key={group.areaId}>
                    {/* Area row */}
                    <div className={`flex items-center gap-2.5 px-4 py-2 cursor-pointer transition-colors hover:bg-c-cyan/[0.03] ${!isLast && !isExpanded ? 'border-b border-c-border/50' : ''} ${isExpanded ? 'bg-c-cyan/[0.03]' : ''}`}>
                      {/* Checkbox */}
                      <button
                        onClick={() => toggleArea(group.areaId)}
                        className={`w-4 h-4 rounded flex items-center justify-center text-[11px] flex-shrink-0 transition-all ${
                          allSelected
                            ? 'bg-c-cyan border-[1.5px] border-c-cyan text-c-bg'
                            : someSelected
                            ? 'bg-c-cyan/30 border-[1.5px] border-c-cyan/50 text-c-cyan'
                            : 'border-[1.5px] border-c-border-hi'
                        }`}
                      >
                        {allSelected ? '\u2713' : someSelected ? '\u2013' : ''}
                      </button>
                      {/* Roman numeral */}
                      <span className="font-mono text-xs text-c-dim w-7 flex-shrink-0">{group.areaId}</span>
                      {/* Area name */}
                      <span className={`text-[13px] font-medium flex-1 ${allSelected || someSelected ? 'text-c-cyan' : 'text-c-text'}`} onClick={() => toggleArea(group.areaId)}>
                        {group.areaName}
                      </span>
                      {/* Task count + expand toggle */}
                      <button
                        onClick={() => toggleExpandArea(group.areaId)}
                        className={`font-mono text-xs flex items-center gap-1 transition-opacity flex-shrink-0 ${
                          allSelected || someSelected ? 'text-c-cyan opacity-80 hover:opacity-100' : 'text-c-dim opacity-50 hover:opacity-80 hover:text-c-cyan'
                        }`}
                      >
                        {group.tasks.length} {group.tasks.length === 1 ? 'task' : 'tasks'} {isExpanded ? '\u25BE' : '\u25B8'}
                      </button>
                    </div>

                    {/* Expanded tasks */}
                    {isExpanded && (
                      <div className={`pl-[52px] pr-4 pb-2 ${!isLast ? 'border-b border-c-border/50' : ''}`}>
                        {group.tasks.map((task) => {
                          const isTaskSelected = selectedTasks.includes(task.id);
                          return (
                            <button
                              key={task.id}
                              onClick={() => toggleTask(task.id)}
                              className={`flex items-center gap-2 py-1 w-full text-left transition-colors hover:text-c-cyan ${
                                isTaskSelected ? 'text-c-cyan' : 'text-c-dim'
                              }`}
                            >
                              <span className={`w-3 h-3 rounded-sm flex items-center justify-center text-[8px] flex-shrink-0 transition-all ${
                                isTaskSelected
                                  ? 'bg-c-cyan border-[1.5px] border-c-cyan text-c-bg'
                                  : 'border-[1.5px] border-c-border-hi'
                              }`}>
                                {isTaskSelected ? '\u2713' : ''}
                              </span>
                              <span className="text-[11px]">{task.task}</span>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>

          {/* Helper text */}
          <div className="flex items-center justify-between mt-1.5 px-0.5">
            <span className="font-mono text-xs text-c-dim">Select none for all areas</span>
            {selectedTasks.length > 0 && (
              <button
                onClick={() => setSelectedTasks([])}
                className="font-mono text-[11px] text-c-muted hover:text-c-text tracking-wider transition-colors">Clear selection
              </button>
            )}
          </div>
        </div>

        {/* Secondary Settings Toggle */}
        <div>
          <button
            onClick={() => setShowSecondary(!showSecondary)}
            className="flex items-center gap-1.5 font-mono text-xs text-c-dim hover:text-c-muted uppercase tracking-wider transition-colors"
          >
            <span>{showSecondary ? '\u25BC' : '\u25B6'}</span>
            Difficulty &amp; examiner
          </button>

          {showSecondary && (
            <div className="mt-3 space-y-4">
              {/* Difficulty */}
              <div>
                <label className="block font-mono text-xs text-c-muted mb-2 tracking-wider uppercase">DIFFICULTY</label>
                <div className="flex gap-2">
                  {[
                    { value: 'mixed' as const, label: 'Mixed' },
                    { value: 'easy' as const, label: 'Easy' },
                    { value: 'medium' as const, label: 'Medium' },
                    { value: 'hard' as const, label: 'Hard' },
                  ].map((d) => (
                    <button
                      key={d.value}
                      onClick={() => setDifficulty(d.value)}
                      className={`px-4 py-2 rounded-lg text-sm transition-colors ${
                        difficulty === d.value
                          ? 'bg-c-amber text-c-bg font-semibold'
                          : 'bg-c-bezel text-c-muted border border-c-border font-medium hover:border-c-border-hi'
                      }`}
                    >
                      {d.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Examiner - Condensed */}
              <div className="flex items-center justify-between px-4 py-2.5 bg-c-panel rounded-lg border border-c-border">
                {prefsLoading ? (
                  <span className="text-sm text-c-dim">Loading…</span>
                ) : (
                  <span className="font-mono text-[13px]">
                    <span className="text-c-green-readable font-semibold">{resolvedProfile.defaultDisplayName}</span>
                    <span className="text-c-dim mx-1.5 text-xs">&mdash;</span>
                    <span className="text-c-dim text-xs">{resolvedProfile.description.charAt(0).toUpperCase() + resolvedProfile.description.slice(1).toLowerCase().split('.')[0]}</span>
                  </span>
                )}
                <Link
                  href="/settings"
                  className="font-mono text-[11px] text-c-amber hover:text-c-amber/80 transition-colors whitespace-nowrap ml-3 uppercase tracking-wider"
                >
                  Settings &rarr;
                </Link>
              </div>
            </div>
          )}
        </div>

        {/* Summary + Start */}
        <div>
          <p className="font-mono text-xs text-c-dim text-center mb-2">
            <span className="text-c-text font-medium">{summaryMode}</span>
            {' \u00b7 '}
            <span className="text-c-text font-medium">{summaryScope}</span>
            {' \u00b7 '}
            <span className="text-c-text font-medium">{summaryDiff}</span>
          </p>
          <button
            data-testid="start-exam-button"
            onClick={() => onStart({
              rating,
              studyMode,
              difficulty,
              aircraftClass,
              selectedAreas,
              selectedTasks,
              voiceEnabled,
              examinerProfileKey: examinerProfileKey || 'maria_methodical',
            })}
            disabled={loading || prefsLoading}
            className="w-full py-3.5 bg-c-amber hover:bg-c-amber-bright disabled:opacity-50 text-c-bg rounded-lg font-semibold text-base transition-colors shadow-lg shadow-c-amber/20"
          >
            {loading ? 'Starting…' : 'Start practice exam'}
          </button>
        </div>
      </div>
    </div>
  );
}
