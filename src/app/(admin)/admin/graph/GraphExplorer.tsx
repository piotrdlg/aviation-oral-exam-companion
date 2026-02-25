'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import dynamic from 'next/dynamic';
import type { GraphNode, GraphLink, GraphData } from './graph-types';
import { CATEGORY_COLORS, RELATION_COLORS, CATEGORY_LABELS } from './graph-types';
import type { ConceptCategory, RelationType } from '@/types/database';
import GraphDetailPanel from './GraphDetailPanel';

// ---------------------------------------------------------------------------
// Dynamic import — react-force-graph uses canvas and must not run on server
// ---------------------------------------------------------------------------

const ForceGraph2D = dynamic(
  () => import('react-force-graph').then((mod) => mod.ForceGraph2D),
  { ssr: false },
);

// ---------------------------------------------------------------------------
// CSS color resolution — reads CSS custom properties at runtime
// ---------------------------------------------------------------------------

function getCssColor(varExpr: string): string {
  if (typeof window === 'undefined') return '#888';
  const match = varExpr.match(/var\((.+)\)/);
  if (!match) return varExpr;
  return (
    getComputedStyle(document.documentElement)
      .getPropertyValue(match[1])
      .trim() || '#888'
  );
}

/** Hex color + alpha (0-1) to rgba string */
function hexWithAlpha(hex: string, alpha: number): string {
  // If already rgba or rgb, inject alpha
  if (hex.startsWith('rgba')) return hex;
  if (hex.startsWith('rgb(')) {
    return hex.replace('rgb(', 'rgba(').replace(')', `, ${alpha})`);
  }
  // Convert hex to rgba
  const r = parseInt(hex.slice(1, 3), 16) || 0;
  const g = parseInt(hex.slice(3, 5), 16) || 0;
  const b = parseInt(hex.slice(5, 7), 16) || 0;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// ---------------------------------------------------------------------------
// Search result type (from API)
// ---------------------------------------------------------------------------

interface SearchResult {
  id: string;
  name: string;
  slug: string;
  category: string;
}

// ---------------------------------------------------------------------------
// Node size by category
// ---------------------------------------------------------------------------

const CATEGORY_SIZE: Record<ConceptCategory, number> = {
  acs_area: 12,
  acs_task: 8,
  acs_element: 5,
  topic: 4,
  definition: 3,
  procedure: 4,
  regulatory_claim: 3,
  artifact: 2,
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function GraphExplorer() {
  // ---- State ----
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [selectedElement, setSelectedElement] = useState<string | null>(null);
  const [depth, setDepth] = useState(2);
  const [graphData, setGraphData] = useState<GraphData>({ nodes: [], links: [] });
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [loading, setLoading] = useState(false);
  const [resolvedColors, setResolvedColors] = useState<Record<string, string>>({});
  const [showDropdown, setShowDropdown] = useState(false);
  const [containerSize, setContainerSize] = useState({ width: 800, height: 600 });

  const fgRef = useRef<any>(null); // eslint-disable-line @typescript-eslint/no-explicit-any
  const containerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // ---- Resolve CSS colors ----
  const resolveAllColors = useCallback(() => {
    const colors: Record<string, string> = {};

    // Category colors
    for (const [cat, varExpr] of Object.entries(CATEGORY_COLORS)) {
      colors[`cat:${cat}`] = getCssColor(varExpr);
    }

    // Relation colors
    for (const [rel, { color }] of Object.entries(RELATION_COLORS)) {
      colors[`rel:${rel}`] = getCssColor(color);
    }

    setResolvedColors(colors);
  }, []);

  // Resolve colors on mount + theme change
  useEffect(() => {
    resolveAllColors();

    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (
          mutation.type === 'attributes' &&
          (mutation.attributeName === 'data-theme' ||
            mutation.attributeName === 'class')
        ) {
          // Small delay to let CSS variables update
          setTimeout(resolveAllColors, 50);
        }
      }
    });

    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme', 'class'],
    });

    return () => observer.disconnect();
  }, [resolveAllColors]);

  // ---- Container size measurement ----
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        if (width > 0 && height > 0) {
          setContainerSize({ width: Math.floor(width), height: Math.floor(height) });
        }
      }
    });

    resizeObserver.observe(container);
    return () => resizeObserver.disconnect();
  }, []);

  // ---- Debounced search ----
  useEffect(() => {
    if (searchTerm.length < 2) {
      setSearchResults([]);
      setShowDropdown(false);
      return;
    }

    const abortController = new AbortController();
    const timeout = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/admin/graph?search=${encodeURIComponent(searchTerm)}`,
          { signal: abortController.signal },
        );
        if (res.ok) {
          const data = await res.json();
          setSearchResults(data.results ?? []);
          setShowDropdown(true);
        }
      } catch {
        // Abort or network error — ignore
      }
    }, 300);

    return () => {
      clearTimeout(timeout);
      abortController.abort();
    };
  }, [searchTerm]);

  // ---- Fetch graph bundle ----
  const fetchGraph = useCallback(
    async (element: string, d: number) => {
      setLoading(true);
      try {
        const res = await fetch(
          `/api/admin/graph?element=${encodeURIComponent(element)}&depth=${d}`,
        );
        if (res.ok) {
          const data = await res.json();
          setGraphData({
            nodes: data.nodes ?? [],
            links: data.links ?? [],
          });
          // Center graph after data loads
          setTimeout(() => {
            if (fgRef.current) {
              fgRef.current.zoomToFit(400, 60);
            }
          }, 500);
        }
      } catch {
        // Network error
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  // Re-fetch when depth changes (if element selected)
  useEffect(() => {
    if (selectedElement) {
      fetchGraph(selectedElement, depth);
    }
  }, [selectedElement, depth, fetchGraph]);

  // ---- Handle search result selection ----
  const handleSelectResult = useCallback(
    (result: SearchResult) => {
      setSelectedElement(result.slug);
      setSearchTerm(result.name);
      setShowDropdown(false);
      setSelectedNode(null);
    },
    [],
  );

  // ---- Handle node click in detail panel ----
  const handleNavigateToNode = useCallback(
    (nodeId: string) => {
      const node = graphData.nodes.find((n) => n.id === nodeId);
      if (node) {
        setSelectedNode(node);
        // Center on the node
        if (fgRef.current && node.x !== undefined && node.y !== undefined) {
          fgRef.current.centerAt(node.x, node.y, 500);
          fgRef.current.zoom(3, 500);
        }
      }
    },
    [graphData.nodes],
  );

  // ---- ForceGraph2D callbacks ----
  const handleNodeClick = useCallback(
    (node: any) => { // eslint-disable-line @typescript-eslint/no-explicit-any
      setSelectedNode(node as GraphNode);
    },
    [],
  );

  const handleNodeDblClick = useCallback(
    (node: any) => { // eslint-disable-line @typescript-eslint/no-explicit-any
      const gNode = node as GraphNode;
      // Only re-center for ACS elements (they have meaningful slugs for the API)
      if (gNode.slug && ['acs_element', 'acs_task', 'acs_area'].includes(gNode.category)) {
        setSelectedElement(gNode.slug);
        setSearchTerm(gNode.name);
        setSelectedNode(null);
      }
    },
    [],
  );

  // ---- Node label ----
  const nodeLabel = useCallback(
    (node: any): string => { // eslint-disable-line @typescript-eslint/no-explicit-any
      const gNode = node as GraphNode;
      const catLabel = CATEGORY_LABELS[gNode.category] ?? gNode.category;
      return `${gNode.name} (${catLabel}) \u2014 ${gNode.edgeCount} edges`;
    },
    [],
  );

  // ---- Node size ----
  const nodeVal = useCallback(
    (node: any): number => { // eslint-disable-line @typescript-eslint/no-explicit-any
      const gNode = node as GraphNode;
      const baseSize = CATEGORY_SIZE[gNode.category] ?? 3;
      return baseSize + Math.min(gNode.edgeCount * 0.5, 6);
    },
    [],
  );

  // ---- Node color ----
  const nodeColor = useCallback(
    (node: any): string => { // eslint-disable-line @typescript-eslint/no-explicit-any
      const gNode = node as GraphNode;
      const hex = resolvedColors[`cat:${gNode.category}`] ?? '#888';
      const alpha = gNode.validationStatus === 'pending' ? 0.5 : 1;
      return hexWithAlpha(hex, alpha);
    },
    [resolvedColors],
  );

  // ---- Node canvas object mode — draw labels after default circle ----
  const nodeCanvasObjectMode = useCallback((): string => 'after', []);

  // ---- Node canvas object — label at high zoom + root ring ----
  const nodeCanvasObject = useCallback(
    (node: any, ctx: CanvasRenderingContext2D, globalScale: number) => { // eslint-disable-line @typescript-eslint/no-explicit-any
      const gNode = node as GraphNode;
      const x = node.x as number;
      const y = node.y as number;

      // Draw amber ring on root node
      if (selectedElement && gNode.slug === selectedElement) {
        const ringColor = resolvedColors['cat:acs_area'] ?? '#f59e0b';
        ctx.beginPath();
        ctx.arc(x, y, 8, 0, 2 * Math.PI);
        ctx.strokeStyle = ringColor;
        ctx.lineWidth = 2 / globalScale;
        ctx.stroke();
      }

      // Draw label text at high zoom
      if (globalScale > 1.5) {
        const label = gNode.name;
        const fontSize = Math.max(10 / globalScale, 1.5);
        ctx.font = `${fontSize}px monospace`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.fillStyle = resolvedColors['cat:acs_element'] ?? '#e5e5e5';
        ctx.fillText(label, x, y + 6);
      }
    },
    [selectedElement, resolvedColors],
  );

  // ---- Link color ----
  const linkColor = useCallback(
    (link: any): string => { // eslint-disable-line @typescript-eslint/no-explicit-any
      const gLink = link as GraphLink;
      const relMeta = RELATION_COLORS[gLink.relationType];
      const hex = resolvedColors[`rel:${gLink.relationType}`] ?? '#555';
      const opacity = relMeta?.opacity ?? 0.3;
      return hexWithAlpha(hex, opacity);
    },
    [resolvedColors],
  );

  // ---- Link width ----
  const linkWidth = useCallback(
    (link: any): number => { // eslint-disable-line @typescript-eslint/no-explicit-any
      const gLink = link as GraphLink;
      return gLink.relationType === 'is_component_of' ? 2 : 1;
    },
    [],
  );

  // ---- Categories present in current graph (for legend) ----
  const presentCategories = useMemo(() => {
    const cats = new Set<ConceptCategory>();
    for (const node of graphData.nodes) {
      cats.add(node.category);
    }
    return Array.from(cats).sort();
  }, [graphData.nodes]);

  // ---- Close dropdown when clicking outside ----
  useEffect(() => {
    function handleClickOutside(e: Event) {
      if (
        searchInputRef.current &&
        !searchInputRef.current.contains(e.target as Node)
      ) {
        setShowDropdown(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // ---- Render ----
  return (
    <div className="flex flex-col h-[calc(100vh-140px)]">
      {/* ---- Controls bar ---- */}
      <div className="flex items-center gap-4 px-4 py-3 border-b border-c-border bg-c-panel flex-shrink-0">
        {/* Search */}
        <div className="relative flex-1 max-w-sm" ref={searchInputRef}>
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            onFocus={() => {
              if (searchResults.length > 0) setShowDropdown(true);
            }}
            placeholder="Search ACS elements..."
            className="w-full px-3 py-1.5 text-xs font-mono bg-c-bg border border-c-border rounded text-c-text placeholder:text-c-dim focus:outline-none focus:border-c-amber transition-colors"
          />
          {/* Dropdown */}
          {showDropdown && searchResults.length > 0 && (
            <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-c-panel border border-c-border rounded shadow-lg max-h-60 overflow-y-auto">
              {searchResults.map((result) => (
                <button
                  key={result.id}
                  onClick={() => handleSelectResult(result)}
                  className="w-full flex items-center gap-2 px-3 py-2 text-xs font-mono text-left hover:bg-c-elevated/50 transition-colors"
                >
                  <span className="text-c-text truncate">{result.name}</span>
                  <span className="text-c-dim ml-auto flex-shrink-0 text-[10px]">
                    {result.slug}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Depth slider */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <label className="text-[10px] font-mono text-c-dim uppercase tracking-wider">
            Depth
          </label>
          <input
            type="range"
            min={1}
            max={3}
            value={depth}
            onChange={(e) => setDepth(parseInt(e.target.value, 10))}
            className="w-20 accent-amber-500"
          />
          <span className="text-xs font-mono text-c-amber w-4 text-center">
            {depth}
          </span>
        </div>

        {/* Stats */}
        {graphData.nodes.length > 0 && (
          <div className="flex items-center gap-3 flex-shrink-0">
            <span className="text-[10px] font-mono text-c-dim">
              <span className="text-c-cyan">{graphData.nodes.length}</span> nodes
            </span>
            <span className="text-[10px] font-mono text-c-dim">
              <span className="text-c-cyan">{graphData.links.length}</span> edges
            </span>
          </div>
        )}
      </div>

      {/* ---- Legend ---- */}
      {presentCategories.length > 0 && (
        <div className="flex items-center gap-3 px-4 py-2 border-b border-c-border bg-c-panel/50 flex-shrink-0">
          <span className="text-[10px] font-mono text-c-dim uppercase tracking-wider mr-1">
            //
          </span>
          {presentCategories.map((cat) => (
            <div key={cat} className="flex items-center gap-1.5">
              <span
                className="inline-block w-2.5 h-2.5 rounded-full flex-shrink-0"
                style={{
                  backgroundColor: resolvedColors[`cat:${cat}`] ?? '#888',
                }}
              />
              <span className="text-[10px] font-mono text-c-muted">
                {CATEGORY_LABELS[cat] ?? cat}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* ---- Main area: graph + detail panel ---- */}
      <div className="flex flex-1 min-h-0">
        {/* Graph canvas area */}
        <div ref={containerRef} className="flex-1 relative min-h-0">
          {/* Loading overlay */}
          {loading && (
            <div className="absolute inset-0 z-40 flex items-center justify-center bg-c-bg/70">
              <div className="flex flex-col items-center gap-2">
                <div className="w-6 h-6 border-2 border-c-amber border-t-transparent rounded-full animate-spin" />
                <span className="text-xs font-mono text-c-dim uppercase tracking-wider">
                  Loading graph...
                </span>
              </div>
            </div>
          )}

          {/* Empty state */}
          {!loading && graphData.nodes.length === 0 && (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="text-center">
                <p className="text-sm font-mono text-c-dim mb-2">
                  {selectedElement
                    ? 'No nodes found for this element.'
                    : 'Search for an ACS element to explore the knowledge graph.'}
                </p>
                <p className="text-[10px] font-mono text-c-dim/60">
                  Try: PA.I.A.K1, weather, airspace, V-speeds
                </p>
              </div>
            </div>
          )}

          {/* ForceGraph2D */}
          {graphData.nodes.length > 0 && containerSize.width > 0 && (
            <ForceGraph2D
              ref={fgRef}
              graphData={graphData as any} // eslint-disable-line @typescript-eslint/no-explicit-any
              nodeId="id"
              nodeLabel={nodeLabel}
              nodeVal={nodeVal}
              nodeColor={nodeColor}
              nodeCanvasObjectMode={nodeCanvasObjectMode as any} // eslint-disable-line @typescript-eslint/no-explicit-any
              nodeCanvasObject={nodeCanvasObject as any} // eslint-disable-line @typescript-eslint/no-explicit-any
              linkColor={linkColor}
              linkWidth={linkWidth}
              linkDirectionalArrowLength={3}
              linkDirectionalArrowRelPos={0.8}
              onNodeClick={handleNodeClick}
              onNodeRightClick={handleNodeDblClick}
              backgroundColor="rgba(0,0,0,0)"
              width={containerSize.width}
              height={containerSize.height}
              cooldownTicks={100}
              warmupTicks={50}
            />
          )}
        </div>

        {/* Detail panel */}
        {selectedNode && (
          <GraphDetailPanel
            node={selectedNode}
            links={graphData.links}
            allNodes={graphData.nodes}
            onNavigate={handleNavigateToNode}
            onClose={() => setSelectedNode(null)}
          />
        )}
      </div>
    </div>
  );
}
