'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import type { AircraftClass, Rating } from '@/types/database';

export interface SessionConfigData {
  rating: Rating;
  studyMode: 'linear' | 'cross_acs' | 'weak_areas';
  difficulty: 'easy' | 'medium' | 'hard' | 'mixed';
  aircraftClass: AircraftClass;
  selectedAreas: string[];
  selectedTasks: string[];
  voiceEnabled: boolean;
  isOnboarding?: boolean;
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
}

export default function SessionConfig({ onStart, loading, preferredRating, preferredAircraftClass, prefsLoaded }: Props) {
  const rating = preferredRating || 'private';
  const aircraftClass = preferredAircraftClass || 'ASEL';
  const prefsLoading = prefsLoaded === undefined ? false : !prefsLoaded;
  const [studyMode, setStudyMode] = useState<SessionConfigData['studyMode']>('linear');
  const [difficulty, setDifficulty] = useState<SessionConfigData['difficulty']>('mixed');
  const [selectedTasks, setSelectedTasks] = useState<string[]>([]);
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const [showTaskPicker, setShowTaskPicker] = useState(false);
  const [allTasks, setAllTasks] = useState<AcsTaskItem[]>([]);
  const [tasksLoading, setTasksLoading] = useState(false);

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

  return (
    <div className="bezel rounded-lg border border-c-border p-6">
      <h2 className="font-mono font-semibold text-base text-c-amber mb-5 tracking-wider uppercase">NEW SESSION</h2>
      <div className="space-y-5">
        {/* Rating & Class (read-only from Settings) */}
        <div className="flex items-center justify-between px-4 py-3 bg-c-panel rounded-lg border border-c-border">
          {prefsLoading ? (
            <span className="font-mono text-sm text-c-dim">LOADING PREFERENCES...</span>
          ) : (
            <span className="font-mono text-sm">
              <span className="text-c-green font-semibold glow-g">{(RATING_LABELS[rating] || rating).toUpperCase()}</span>
              <span className="text-c-muted mx-2">&middot;</span>
              <span className="text-c-cyan font-semibold">{rating === 'instrument' ? 'AIRPLANE' : aircraftClass}</span>
            </span>
          )}
          <Link
            href="/settings"
            className="font-mono text-xs text-c-amber hover:text-c-amber/80 transition-colors whitespace-nowrap ml-3 uppercase tracking-wider"
          >
            CHANGE IN SETTINGS &rarr;
          </Link>
        </div>

        {/* Study Mode */}
        <div>
          <label className="block font-mono text-xs text-c-muted mb-2 tracking-wider uppercase">STUDY MODE</label>
          <div className="grid grid-cols-3 gap-2">
            {[
              { value: 'linear' as const, label: 'AREA BY AREA', desc: 'One area at a time' },
              { value: 'cross_acs' as const, label: 'ACROSS ACS', desc: 'Random across all areas' },
              { value: 'weak_areas' as const, label: 'WEAK AREAS', desc: 'Focus on your gaps' },
            ].map((mode) => (
              <button
                key={mode.value}
                onClick={() => setStudyMode(mode.value)}
                className={`p-3 rounded-lg border text-left transition-colors ${
                  studyMode === mode.value
                    ? 'border-c-amber/50 bg-c-amber-lo/50'
                    : 'border-c-border bg-c-bezel hover:border-c-border-hi'
                }`}
              >
                <p className={`font-mono text-sm ${studyMode === mode.value ? 'font-semibold text-c-amber' : 'font-medium text-c-muted'}`}>{mode.label}</p>
                <p className="text-xs text-c-muted mt-1">{mode.desc}</p>
              </button>
            ))}
          </div>
        </div>

        {/* Difficulty */}
        <div>
          <label className="block font-mono text-xs text-c-muted mb-2 tracking-wider uppercase">DIFFICULTY</label>
          <div className="flex gap-2">
            {[
              { value: 'mixed' as const, label: 'MIXED' },
              { value: 'easy' as const, label: 'EASY' },
              { value: 'medium' as const, label: 'MEDIUM' },
              { value: 'hard' as const, label: 'HARD' },
            ].map((d) => (
              <button
                key={d.value}
                onClick={() => setDifficulty(d.value)}
                className={`px-4 py-2 rounded-lg font-mono text-sm transition-colors ${
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

        {/* Task Selection Toggle */}
        <div>
          <button
            onClick={() => setShowTaskPicker(!showTaskPicker)}
            className="font-mono text-sm text-c-cyan hover:text-c-cyan/80 transition-colors flex items-center gap-1"
          >
            <span className="text-xs">{showTaskPicker ? '\u25BC' : '\u25B6'}</span>
            CUSTOMIZE TASKS...
            {selectedTasks.length > 0 && (
              <span className="text-xs text-c-dim ml-1">
                ({selectedTasks.length} of {filteredTasks.length} selected)
              </span>
            )}
          </button>

          {showTaskPicker && (
            <div className="mt-3 max-h-64 overflow-y-auto border border-c-border rounded-lg bg-c-panel">
              {tasksLoading ? (
                <p className="p-3 font-mono text-sm text-c-dim">LOADING TASKS...</p>
              ) : areaGroups.length === 0 ? (
                <p className="p-3 font-mono text-sm text-c-dim">NO TASKS FOUND.</p>
              ) : (
                areaGroups.map((group) => {
                  const areaTaskIds = group.tasks.map((t) => t.id);
                  const allSelected = areaTaskIds.every((id) => selectedTasks.includes(id));
                  const someSelected = areaTaskIds.some((id) => selectedTasks.includes(id));

                  return (
                    <div key={group.areaId} className="border-b border-c-border last:border-b-0">
                      {/* Area header */}
                      <button
                        onClick={() => toggleArea(group.areaId)}
                        className={`w-full px-3 py-2 flex items-center gap-2 text-left text-sm font-medium transition-colors hover:bg-c-elevated ${
                          allSelected ? 'text-c-cyan' : someSelected ? 'text-c-cyan/70' : 'text-c-text'
                        }`}
                      >
                        <span className={`w-3 h-3 rounded-sm border flex items-center justify-center text-[8px] ${
                          allSelected
                            ? 'bg-c-cyan border-c-cyan text-c-bg'
                            : someSelected
                            ? 'bg-c-cyan/30 border-c-cyan/50 text-c-cyan'
                            : 'border-c-border'
                        }`}>
                          {allSelected ? '\u2713' : someSelected ? '\u2013' : ''}
                        </span>
                        <span className="font-mono text-xs text-c-dim">{group.areaId}</span>
                        {group.areaName}
                        <span className="ml-auto text-xs text-c-dim">{group.tasks.length}</span>
                      </button>

                      {/* Individual tasks */}
                      <div className="pl-8 pb-1">
                        {group.tasks.map((task) => (
                          <button
                            key={task.id}
                            onClick={() => toggleTask(task.id)}
                            className={`w-full px-2 py-1 text-left text-[11px] transition-colors rounded hover:bg-c-elevated ${
                              selectedTasks.includes(task.id)
                                ? 'text-c-cyan'
                                : 'text-c-dim hover:text-c-cyan'
                            }`}
                          >
                            <span className="font-mono text-c-dim/50 mr-1.5">{task.id.replace(/^(PA|CA|IR)\./, '')}</span>
                            {task.task}
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}

          {showTaskPicker && selectedTasks.length === 0 && (
            <p className="text-xs text-c-dim font-mono mt-1.5">All tasks for {aircraftClass} will be included if none selected</p>
          )}
          {showTaskPicker && selectedTasks.length > 0 && (
            <button
              onClick={() => setSelectedTasks([])}
              className="text-xs text-c-muted hover:text-c-text font-mono mt-1 transition-colors"
            >
              CLEAR SELECTION
            </button>
          )}
        </div>

        {/* Voice Toggle */}
        <label className="flex items-center gap-3 cursor-pointer px-3 py-2.5 rounded-lg border border-c-border hover:border-c-border-hi bg-c-panel transition-colors">
          <input
            type="checkbox"
            checked={voiceEnabled}
            onChange={(e) => setVoiceEnabled(e.target.checked)}
            className="w-4 h-4 rounded border-c-border bg-c-bezel text-c-green focus:ring-c-green"
          />
          <span className="font-mono text-sm text-c-text uppercase">ENABLE VOICE MODE</span>
          <span className="text-xs text-c-dim font-mono">(MIC + SPEAKER)</span>
        </label>

        {/* Start Button */}
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
          })}
          disabled={loading || prefsLoading}
          className="w-full py-3.5 bg-c-amber hover:bg-c-amber/90 disabled:opacity-50 text-c-bg rounded-lg font-mono font-bold text-base tracking-wider uppercase transition-colors shadow-lg shadow-c-amber/20"
        >
          {loading ? 'STARTING...' : 'START PRACTICE EXAM'}
        </button>
      </div>
    </div>
  );
}
