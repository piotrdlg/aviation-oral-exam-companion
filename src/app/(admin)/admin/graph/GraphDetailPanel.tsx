'use client';

import type { GraphNode, GraphLink, EvidenceItem } from './graph-types';
import { CATEGORY_LABELS, RELATION_LABELS } from './graph-types';
import type { ConceptCategory, RelationType, ValidationStatus } from '@/types/database';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface Props {
  node: GraphNode | null;
  links: GraphLink[];
  allNodes: GraphNode[];
  onNavigate: (nodeId: string) => void;
  onClose: () => void;
}

// ---------------------------------------------------------------------------
// Badge helpers
// ---------------------------------------------------------------------------

function CategoryBadge({ category }: { category: ConceptCategory }) {
  return (
    <span className="text-[9px] font-mono uppercase tracking-wider px-1.5 py-0.5 border border-c-border rounded text-c-muted">
      {CATEGORY_LABELS[category] ?? category}
    </span>
  );
}

const VALIDATION_COLORS: Record<ValidationStatus, string> = {
  validated: 'text-c-green border-c-green',
  pending: 'text-c-amber border-c-amber',
  rejected: 'text-c-red border-c-red',
  needs_edit: 'text-c-amber border-c-amber',
};

function ValidationBadge({ status }: { status: ValidationStatus }) {
  const color = VALIDATION_COLORS[status] ?? 'text-c-muted border-c-border';
  return (
    <span
      className={`text-[9px] font-mono uppercase tracking-wider px-1.5 py-0.5 border rounded ${color}`}
    >
      {status.replace('_', ' ')}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Section label (// COMMENT style)
// ---------------------------------------------------------------------------

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[10px] font-mono uppercase tracking-wider text-c-dim mb-2">
      // {children}
    </p>
  );
}

// ---------------------------------------------------------------------------
// Helpers for resolving link source / target after force-graph mutation
// ---------------------------------------------------------------------------

function resolveLinkId(value: string | { id: string } | unknown): string {
  if (typeof value === 'object' && value !== null && 'id' in value) {
    return (value as { id: string }).id;
  }
  return value as string;
}

// ---------------------------------------------------------------------------
// Edge grouping
// ---------------------------------------------------------------------------

interface ResolvedEdge {
  relationType: RelationType;
  direction: 'outgoing' | 'incoming';
  targetNodeId: string;
  targetNodeName: string;
  confidence: number;
}

function resolveEdges(
  nodeId: string,
  links: GraphLink[],
  allNodes: GraphNode[],
): ResolvedEdge[] {
  const nodeMap = new Map(allNodes.map((n) => [n.id, n]));
  const edges: ResolvedEdge[] = [];

  for (const link of links) {
    const sourceId = resolveLinkId(link.source);
    const targetId = resolveLinkId(link.target);

    if (sourceId === nodeId) {
      const target = nodeMap.get(targetId);
      edges.push({
        relationType: link.relationType,
        direction: 'outgoing',
        targetNodeId: targetId,
        targetNodeName: target?.name ?? targetId,
        confidence: link.confidence,
      });
    } else if (targetId === nodeId) {
      const source = nodeMap.get(sourceId);
      edges.push({
        relationType: link.relationType,
        direction: 'incoming',
        targetNodeId: sourceId,
        targetNodeName: source?.name ?? sourceId,
        confidence: link.confidence,
      });
    }
  }

  return edges;
}

function groupByRelation(edges: ResolvedEdge[]): Map<RelationType, ResolvedEdge[]> {
  const groups = new Map<RelationType, ResolvedEdge[]>();
  for (const edge of edges) {
    const list = groups.get(edge.relationType) ?? [];
    list.push(edge);
    groups.set(edge.relationType, list);
  }
  return groups;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function GraphDetailPanel({
  node,
  links,
  allNodes,
  onNavigate,
  onClose,
}: Props) {
  if (!node) return null;

  const edges = resolveEdges(node.id, links, allNodes);
  const edgeGroups = groupByRelation(edges);

  const keyFacts = (node.keyFacts ?? []) as string[];
  const misconceptions = (node.misconceptions ?? []) as string[];
  const evidence: EvidenceItem[] = node.evidence ?? [];

  return (
    <aside className="w-80 flex-shrink-0 border-l border-c-border bg-c-panel overflow-y-auto">
      {/* ---- Header ---- */}
      <div className="px-4 py-3 border-b border-c-border">
        <div className="flex items-start justify-between gap-2">
          <h2 className="text-sm font-bold text-c-text leading-tight break-words">
            {node.name}
          </h2>
          <button
            onClick={onClose}
            className="flex-shrink-0 text-c-muted hover:text-c-text transition-colors text-lg leading-none"
            aria-label="Close panel"
          >
            &times;
          </button>
        </div>
        <div className="flex items-center gap-2 mt-2">
          <CategoryBadge category={node.category} />
          <ValidationBadge status={node.validationStatus} />
        </div>
        <p className="text-[10px] font-mono text-c-dim mt-1.5 break-all">
          {node.slug}
        </p>
      </div>

      {/* ---- Content ---- */}
      {node.content && (
        <div className="px-4 py-3 border-b border-c-border">
          <SectionLabel>Content</SectionLabel>
          <p className="text-xs text-c-text leading-relaxed whitespace-pre-wrap">
            {node.content}
          </p>
        </div>
      )}

      {/* ---- Key Facts ---- */}
      {keyFacts.length > 0 && (
        <div className="px-4 py-3 border-b border-c-border">
          <SectionLabel>Key Facts</SectionLabel>
          <ul className="space-y-1">
            {keyFacts.map((fact, i) => (
              <li key={i} className="flex items-start gap-2 text-xs text-c-text">
                <span className="text-c-cyan mt-0.5 flex-shrink-0">&bull;</span>
                <span className="leading-relaxed">{fact}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* ---- Misconceptions ---- */}
      {misconceptions.length > 0 && (
        <div className="px-4 py-3 border-b border-c-border">
          <SectionLabel>Misconceptions</SectionLabel>
          <ul className="space-y-1">
            {misconceptions.map((item, i) => (
              <li key={i} className="flex items-start gap-2 text-xs text-c-text">
                <span className="text-c-red mt-0.5 flex-shrink-0">&loz;</span>
                <span className="leading-relaxed">{item}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* ---- Edges ---- */}
      {edges.length > 0 && (
        <div className="px-4 py-3 border-b border-c-border">
          <SectionLabel>Edges ({edges.length})</SectionLabel>
          <div className="space-y-3">
            {Array.from(edgeGroups.entries()).map(([relType, group]) => (
              <div key={relType}>
                <p className="text-[10px] font-mono text-c-amber mb-1">
                  {RELATION_LABELS[relType] ?? relType}
                </p>
                <ul className="space-y-1">
                  {group.map((edge, i) => (
                    <li
                      key={`${edge.targetNodeId}-${i}`}
                      className="flex items-center gap-1.5 text-xs"
                    >
                      <span className="text-c-dim flex-shrink-0 font-mono">
                        {edge.direction === 'outgoing' ? '\u2192' : '\u2190'}
                      </span>
                      <button
                        onClick={() => onNavigate(edge.targetNodeId)}
                        className="text-c-cyan hover:underline truncate text-left"
                        title={edge.targetNodeName}
                      >
                        {edge.targetNodeName}
                      </button>
                      <span className="text-c-dim flex-shrink-0 ml-auto font-mono text-[10px]">
                        {Math.round(edge.confidence * 100)}%
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ---- Evidence ---- */}
      {evidence.length > 0 && (
        <div className="px-4 py-3">
          <SectionLabel>Evidence ({evidence.length})</SectionLabel>
          <ul className="space-y-1">
            {evidence.map((ev, i) => (
              <li key={ev.chunkId ?? i} className="flex items-start gap-2 text-xs text-c-text">
                <span className="text-c-amber mt-0.5 flex-shrink-0">&para;</span>
                <span className="leading-relaxed">
                  {ev.docTitle}
                  {ev.pageRef && (
                    <span className="text-c-dim ml-1">p.{ev.pageRef}</span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </aside>
  );
}
