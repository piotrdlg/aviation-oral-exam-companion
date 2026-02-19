'use client';

import { useMemo } from 'react';
import { ResponsiveTreeMap } from '@nivo/treemap';
import type { ComputedNode } from '@nivo/treemap';
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
  description?: string;
  taskName?: string;
  latestScore?: string | null;
  totalAttempts?: number;
  elementType?: string;
}

function getStatusColor(score: ElementScore): string {
  if (score.total_attempts === 0) return 'rgba(28, 35, 51, 0.6)'; // c-border tone — untouched
  if (!score.latest_score) return 'rgba(28, 35, 51, 0.6)';

  switch (score.latest_score) {
    case 'satisfactory':
      return 'rgba(0, 255, 65, 0.75)';    // c-green
    case 'partial':
      return 'rgba(245, 166, 35, 0.75)';   // c-amber
    case 'unsatisfactory':
      return 'rgba(255, 59, 48, 0.75)';    // c-red
    default:
      return 'rgba(28, 35, 51, 0.6)';
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
        description: el.description,
        taskName: `${area} > ${taskId.replace(/^(PA|CA|IR)\./, '')}`,
        latestScore: el.latest_score,
        totalAttempts: el.total_attempts,
        elementType: el.element_type,
      }));

      taskChildren.push({
        name: taskId.replace(/^(PA|CA|IR)\./, ''),
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

const SCORE_STYLES: Record<string, { label: string; bg: string; text: string }> = {
  satisfactory: { label: 'SATISFACTORY', bg: 'bg-c-green-lo', text: 'text-c-green' },
  partial: { label: 'PARTIAL', bg: 'bg-c-amber-lo', text: 'text-c-amber' },
  unsatisfactory: { label: 'UNSATISFACTORY', bg: 'bg-c-red-dim/40', text: 'text-c-red' },
};

const TYPE_LABELS: Record<string, string> = {
  knowledge: 'Knowledge',
  risk: 'Risk Management',
  skill: 'Skill',
};

function TreemapTooltip({ node }: { node: ComputedNode<TreeNode> }) {
  const { data } = node;
  if (!data.elementCode) return null;

  const scoreStyle = data.latestScore ? SCORE_STYLES[data.latestScore] : null;

  return (
    <div className="bg-c-bezel border border-c-border rounded-lg px-3 py-2 max-w-xs shadow-lg">
      <div className="flex items-center gap-2 mb-1">
        <span className="font-mono text-[9px] text-c-muted">{data.elementCode}</span>
        {data.elementType && (
          <span className="font-mono text-[9px] text-c-dim">{TYPE_LABELS[data.elementType] || data.elementType}</span>
        )}
      </div>
      {data.taskName && (
        <p className="font-mono text-[9px] text-c-muted mb-1">{data.taskName}</p>
      )}
      {data.description && (
        <p className="text-xs text-c-text mb-1.5">{data.description}</p>
      )}
      <div className="flex items-center gap-2">
        {scoreStyle ? (
          <span className={`font-mono text-[9px] px-1.5 py-0.5 rounded border ${scoreStyle.bg} ${scoreStyle.text} ${
            data.latestScore === 'satisfactory' ? 'border-c-green/20' :
            data.latestScore === 'partial' ? 'border-c-amber/20' :
            'border-c-red/20'
          }`}>
            {scoreStyle.label}
          </span>
        ) : (
          <span className="font-mono text-[9px] text-c-dim">NOT ATTEMPTED</span>
        )}
        {(data.totalAttempts ?? 0) > 0 && (
          <span className="font-mono text-[9px] text-c-dim">
            {data.totalAttempts} attempt{data.totalAttempts === 1 ? '' : 's'}
          </span>
        )}
      </div>
    </div>
  );
}

export default function AcsCoverageTreemap({ scores, onElementClick }: Props) {
  const treeData = useMemo(() => buildTreeData(scores), [scores]);

  if (scores.length === 0) {
    return (
      <div className="bezel rounded-lg border border-c-border p-6 text-center">
        <p className="text-c-dim font-mono text-sm">No element data available yet. Complete a practice session to see your progress.</p>
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
    <div className="bezel rounded-lg border border-c-border p-6">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-mono text-base font-semibold text-c-amber uppercase tracking-wider">ACS COVERAGE MAP</h3>
        <div className="flex gap-3 font-mono text-xs">
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-sm bg-c-green" /> <span className="text-c-muted">{satisfactory}</span>
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-sm bg-c-amber" /> <span className="text-c-muted">{partial}</span>
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-sm bg-c-red" /> <span className="text-c-muted">{unsatisfactory}</span>
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-sm bg-c-border" /> <span className="text-c-muted">{total - attempted}</span>
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
            return (node.data as TreeNode).color || 'rgba(28, 35, 51, 0.4)';
          }}
          borderWidth={1}
          borderColor="rgba(28, 35, 51, 0.8)"
          labelSkipSize={20}
          label={(node) => (node.data as TreeNode).name || ''}
          labelTextColor="rgba(201, 209, 217, 0.8)"
          parentLabelSize={14}
          parentLabelTextColor="rgba(201, 209, 217, 0.5)"
          tooltip={TreemapTooltip}
          onClick={(node) => {
            const data = node.data as TreeNode;
            if (data.elementCode && onElementClick) {
              onElementClick(data.elementCode);
            }
          }}
          theme={{
            text: { fill: 'rgba(201, 209, 217, 0.8)', fontSize: 10 },
            tooltip: {
              container: {
                background: '#161b22',
                color: '#c9d1d9',
                fontSize: 12,
                borderRadius: 8,
                boxShadow: '0 4px 12px rgba(0,0,0,0.6)',
              },
            },
          }}
        />
      </div>

      <p className="font-mono text-xs text-c-dim mt-2 text-center uppercase">
        {attempted} of {total} elements attempted ({Math.round(attempted / total * 100)}% coverage)
      </p>
    </div>
  );
}
