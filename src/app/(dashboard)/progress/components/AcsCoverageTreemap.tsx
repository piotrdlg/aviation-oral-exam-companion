'use client';

import { useMemo } from 'react';
import { ResponsiveTreeMap } from '@nivo/treemap';
import type { ElementScore } from '@/types/database';

interface Props {
  scores: ElementScore[];
  onElementClick?: (elementCode: string) => void;
}

interface TreeNode {
  name: string;
  children?: TreeNode[];
  value?: number;
  color?: string;
  elementCode?: string;
}

function getStatusColor(score: ElementScore): string {
  if (score.total_attempts === 0) return 'rgba(156, 163, 175, 0.15)'; // transparent gray — untouched
  if (!score.latest_score) return 'rgba(156, 163, 175, 0.15)';

  switch (score.latest_score) {
    case 'satisfactory':
      return 'rgba(34, 197, 94, 0.7)';   // green
    case 'partial':
      return 'rgba(234, 179, 8, 0.7)';    // yellow
    case 'unsatisfactory':
      return 'rgba(239, 68, 68, 0.7)';    // red
    default:
      return 'rgba(156, 163, 175, 0.15)';
  }
}

/**
 * Transform flat element scores into a hierarchical tree structure
 * for the Nivo treemap: Area > Task > Element
 */
function buildTreeData(scores: ElementScore[]): TreeNode {
  const areaMap = new Map<string, Map<string, ElementScore[]>>();

  for (const score of scores) {
    if (!areaMap.has(score.area)) {
      areaMap.set(score.area, new Map());
    }
    const taskMap = areaMap.get(score.area)!;
    if (!taskMap.has(score.task_id)) {
      taskMap.set(score.task_id, []);
    }
    taskMap.get(score.task_id)!.push(score);
  }

  const children: TreeNode[] = [];

  for (const [area, taskMap] of areaMap) {
    const taskChildren: TreeNode[] = [];

    for (const [taskId, elements] of taskMap) {
      const elementChildren: TreeNode[] = elements.map((el) => ({
        name: el.element_code.split('.').pop() || el.element_code,
        value: 1,
        color: getStatusColor(el),
        elementCode: el.element_code,
      }));

      taskChildren.push({
        name: taskId.replace('PA.', ''),
        children: elementChildren,
      });
    }

    children.push({
      name: area,
      children: taskChildren,
    });
  }

  return {
    name: 'ACS',
    children,
  };
}

export default function AcsCoverageTreemap({ scores, onElementClick }: Props) {
  const treeData = useMemo(() => buildTreeData(scores), [scores]);

  if (scores.length === 0) {
    return (
      <div className="bg-gray-900 rounded-xl border border-gray-800 p-6 text-center">
        <p className="text-gray-500">No element data available yet. Complete a practice session to see your progress.</p>
      </div>
    );
  }

  // Calculate summary stats
  const total = scores.length;
  const attempted = scores.filter(s => s.total_attempts > 0).length;
  const satisfactory = scores.filter(s => s.latest_score === 'satisfactory').length;
  const partial = scores.filter(s => s.latest_score === 'partial').length;
  const unsatisfactory = scores.filter(s => s.latest_score === 'unsatisfactory').length;

  return (
    <div className="bg-gray-900 rounded-xl border border-gray-800 p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-medium text-white">ACS Coverage Map</h3>
        <div className="flex gap-3 text-xs">
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-sm bg-green-500/70" /> {satisfactory}
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-sm bg-yellow-500/70" /> {partial}
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-sm bg-red-500/70" /> {unsatisfactory}
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-sm bg-gray-500/20" /> {total - attempted}
          </span>
        </div>
      </div>

      <div style={{ height: 400 }}>
        <ResponsiveTreeMap
          data={treeData}
          identity="name"
          value="value"
          leavesOnly={true}
          innerPadding={2}
          outerPadding={2}
          colors={(node) => {
            return (node.data as TreeNode).color || 'rgba(156, 163, 175, 0.15)';
          }}
          borderWidth={1}
          borderColor="rgba(255, 255, 255, 0.1)"
          labelSkipSize={20}
          label={(node) => (node.data as TreeNode).name || ''}
          labelTextColor="rgba(255, 255, 255, 0.8)"
          parentLabelSize={14}
          parentLabelTextColor="rgba(255, 255, 255, 0.5)"
          onClick={(node) => {
            const data = node.data as TreeNode;
            if (data.elementCode && onElementClick) {
              onElementClick(data.elementCode);
            }
          }}
          theme={{
            text: { fill: 'rgba(255, 255, 255, 0.8)', fontSize: 10 },
            tooltip: {
              container: {
                background: '#1f2937',
                color: '#e5e7eb',
                fontSize: 12,
                borderRadius: 8,
                boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
              },
            },
          }}
        />
      </div>

      <p className="text-xs text-gray-600 mt-2 text-center">
        {attempted} of {total} elements attempted ({Math.round(attempted / total * 100)}% coverage)
      </p>
    </div>
  );
}
