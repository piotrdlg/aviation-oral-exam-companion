'use client';

import { useState, useEffect, useMemo } from 'react';
import type { AircraftClass } from '@/types/database';

export interface SessionConfigData {
  studyMode: 'linear' | 'cross_acs' | 'weak_areas';
  difficulty: 'easy' | 'medium' | 'hard' | 'mixed';
  aircraftClass: AircraftClass;
  selectedAreas: string[];
  selectedTasks: string[];
  voiceEnabled: boolean;
}

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

const CLASS_OPTIONS: { value: AircraftClass; label: string; desc: string }[] = [
  { value: 'ASEL', label: 'ASEL', desc: 'Single-Engine Land' },
  { value: 'AMEL', label: 'AMEL', desc: 'Multi-Engine Land' },
  { value: 'ASES', label: 'ASES', desc: 'Single-Engine Sea' },
  { value: 'AMES', label: 'AMES', desc: 'Multi-Engine Sea' },
];

interface Props {
  onStart: (config: SessionConfigData) => void;
  loading?: boolean;
}

export default function SessionConfig({ onStart, loading }: Props) {
  const [studyMode, setStudyMode] = useState<SessionConfigData['studyMode']>('linear');
  const [difficulty, setDifficulty] = useState<SessionConfigData['difficulty']>('mixed');
  const [aircraftClass, setAircraftClass] = useState<AircraftClass>('ASEL');
  const [selectedTasks, setSelectedTasks] = useState<string[]>([]);
  const [voiceEnabled, setVoiceEnabled] = useState(false);
  const [showTaskPicker, setShowTaskPicker] = useState(false);
  const [allTasks, setAllTasks] = useState<AcsTaskItem[]>([]);
  const [tasksLoading, setTasksLoading] = useState(false);

  // Fetch tasks from DB when component mounts
  useEffect(() => {
    setTasksLoading(true);
    fetch('/api/exam?action=list-tasks')
      .then((res) => res.json())
      .then((data) => setAllTasks(data.tasks || []))
      .catch(() => {})
      .finally(() => setTasksLoading(false));
  }, []);

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
      // Extract area ID from task ID (e.g., "PA.I.A" -> "I")
      const areaId = tasks[0]?.id.split('.')[1] || '';
      groups.push({ areaId, areaName, tasks });
    }
    // Sort by area Roman numeral position
    const romanOrder = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];
    groups.sort((a, b) => romanOrder.indexOf(a.areaId) - romanOrder.indexOf(b.areaId));
    return groups;
  }, [filteredTasks]);

  // Clear task selection when aircraft class changes
  function handleClassChange(cls: AircraftClass) {
    setAircraftClass(cls);
    setSelectedTasks([]);
  }

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
    <div className="bg-gray-900 rounded-xl border border-gray-800 p-6">
      <h2 className="text-lg font-medium text-white mb-4">New Session</h2>
      <div className="space-y-5">
        {/* Aircraft Class */}
        <div>
          <label className="block text-sm text-gray-300 mb-2">Aircraft Class</label>
          <div className="grid grid-cols-4 gap-2">
            {CLASS_OPTIONS.map((cls) => (
              <button
                key={cls.value}
                onClick={() => handleClassChange(cls.value)}
                className={`p-2.5 rounded-lg border text-center transition-colors ${
                  aircraftClass === cls.value
                    ? 'border-blue-500 bg-blue-500/10 text-blue-400'
                    : 'border-gray-700 bg-gray-800 text-gray-400 hover:border-gray-600'
                }`}
              >
                <p className="text-sm font-bold">{cls.label}</p>
                <p className="text-[10px] mt-0.5 opacity-70">{cls.desc}</p>
              </button>
            ))}
          </div>
        </div>

        {/* Study Mode */}
        <div>
          <label className="block text-sm text-gray-300 mb-2">Study Mode</label>
          <div className="grid grid-cols-3 gap-2">
            {[
              { value: 'linear' as const, label: 'Linear', desc: 'One area at a time' },
              { value: 'cross_acs' as const, label: 'Cross-ACS', desc: 'Random across all areas' },
              { value: 'weak_areas' as const, label: 'Weak Areas', desc: 'Focus on your gaps' },
            ].map((mode) => (
              <button
                key={mode.value}
                onClick={() => setStudyMode(mode.value)}
                className={`p-3 rounded-lg border text-left transition-colors ${
                  studyMode === mode.value
                    ? 'border-blue-500 bg-blue-500/10 text-blue-400'
                    : 'border-gray-700 bg-gray-800 text-gray-400 hover:border-gray-600'
                }`}
              >
                <p className="text-sm font-medium">{mode.label}</p>
                <p className="text-xs mt-1 opacity-70">{mode.desc}</p>
              </button>
            ))}
          </div>
        </div>

        {/* Difficulty */}
        <div>
          <label className="block text-sm text-gray-300 mb-2">Difficulty</label>
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
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  difficulty === d.value
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-800 text-gray-400 border border-gray-700 hover:border-gray-600'
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
            className="text-sm text-blue-400 hover:text-blue-300 transition-colors flex items-center gap-1"
          >
            <span className="text-xs">{showTaskPicker ? '▼' : '▶'}</span>
            Customize tasks...
            {selectedTasks.length > 0 && (
              <span className="text-xs text-gray-500 ml-1">
                ({selectedTasks.length} of {filteredTasks.length} selected)
              </span>
            )}
          </button>

          {showTaskPicker && (
            <div className="mt-2 max-h-64 overflow-y-auto border border-gray-800 rounded-lg">
              {tasksLoading ? (
                <p className="p-3 text-sm text-gray-500">Loading tasks...</p>
              ) : areaGroups.length === 0 ? (
                <p className="p-3 text-sm text-gray-500">No tasks found.</p>
              ) : (
                areaGroups.map((group) => {
                  const areaTaskIds = group.tasks.map((t) => t.id);
                  const allSelected = areaTaskIds.every((id) => selectedTasks.includes(id));
                  const someSelected = areaTaskIds.some((id) => selectedTasks.includes(id));

                  return (
                    <div key={group.areaId} className="border-b border-gray-800 last:border-b-0">
                      {/* Area header */}
                      <button
                        onClick={() => toggleArea(group.areaId)}
                        className={`w-full px-3 py-2 flex items-center gap-2 text-left text-sm font-medium transition-colors hover:bg-gray-800/50 ${
                          allSelected ? 'text-blue-300' : someSelected ? 'text-blue-400/70' : 'text-gray-300'
                        }`}
                      >
                        <span className={`w-3 h-3 rounded-sm border flex items-center justify-center text-[8px] ${
                          allSelected
                            ? 'bg-blue-500 border-blue-500 text-white'
                            : someSelected
                            ? 'bg-blue-500/30 border-blue-500/50 text-blue-300'
                            : 'border-gray-600'
                        }`}>
                          {allSelected ? '✓' : someSelected ? '–' : ''}
                        </span>
                        <span className="font-mono text-xs opacity-50">{group.areaId}</span>
                        {group.areaName}
                        <span className="ml-auto text-xs text-gray-600">{group.tasks.length}</span>
                      </button>

                      {/* Individual tasks */}
                      <div className="pl-8 pb-1">
                        {group.tasks.map((task) => (
                          <button
                            key={task.id}
                            onClick={() => toggleTask(task.id)}
                            className={`w-full px-2 py-1 text-left text-xs transition-colors rounded hover:bg-gray-800/50 ${
                              selectedTasks.includes(task.id)
                                ? 'text-blue-300'
                                : 'text-gray-500'
                            }`}
                          >
                            <span className="font-mono opacity-50 mr-1.5">{task.id.replace('PA.', '')}</span>
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
            <p className="text-xs text-gray-600 mt-1">All tasks for {aircraftClass} will be included if none selected</p>
          )}
          {showTaskPicker && selectedTasks.length > 0 && (
            <button
              onClick={() => setSelectedTasks([])}
              className="text-xs text-gray-500 hover:text-gray-400 mt-1 transition-colors"
            >
              Clear selection
            </button>
          )}
        </div>

        {/* Voice Toggle */}
        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={voiceEnabled}
            onChange={(e) => setVoiceEnabled(e.target.checked)}
            className="w-4 h-4 rounded border-gray-600 bg-gray-800 text-blue-500 focus:ring-blue-500"
          />
          <span className="text-sm text-gray-300">Enable voice mode (mic + speaker)</span>
        </label>

        {/* Start Button */}
        <button
          onClick={() => onStart({
            studyMode,
            difficulty,
            aircraftClass,
            selectedAreas,
            selectedTasks,
            voiceEnabled,
          })}
          disabled={loading}
          className="w-full py-3 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg font-medium transition-colors"
        >
          {loading ? 'Starting...' : 'Start Practice Exam'}
        </button>
      </div>
    </div>
  );
}
