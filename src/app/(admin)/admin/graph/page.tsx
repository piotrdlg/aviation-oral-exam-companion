'use client';

import { useState, useCallback } from 'react';
import dynamic from 'next/dynamic';

// ---------------------------------------------------------------------------
// Dynamic imports — ssr: false for canvas/WebGL/treemap components
// ---------------------------------------------------------------------------

const GraphExplorer = dynamic(() => import('./GraphExplorer'), { ssr: false });
const Graph3DView = dynamic(() => import('./Graph3DView'), { ssr: false });
const GraphHealth = dynamic(() => import('./GraphHealth'), { ssr: false });
const GraphCoverage = dynamic(() => import('./GraphCoverage'), { ssr: false });

// ---------------------------------------------------------------------------
// Tab definitions
// ---------------------------------------------------------------------------

type TabId = 'explorer' | '3d' | 'health' | 'coverage';

const TABS: { id: TabId; label: string }[] = [
  { id: 'explorer', label: 'Explorer' },
  { id: '3d', label: '3D View' },
  { id: 'health', label: 'Health' },
  { id: 'coverage', label: 'Coverage' },
];

// ---------------------------------------------------------------------------
// Page component
// ---------------------------------------------------------------------------

export default function GraphPage() {
  const [activeTab, setActiveTab] = useState<TabId>('explorer');

  // Callback for Health and Coverage tabs to navigate to Explorer
  const handleNavigateToExplorer = useCallback((slug: string) => {
    setActiveTab('explorer');
    // The slug will be used by Explorer to focus on the node
    // For now we just switch tabs — Explorer can read URL params or we pass via state
    // Store in sessionStorage so Explorer can pick it up
    if (typeof window !== 'undefined') {
      sessionStorage.setItem('graph-explorer-focus', slug);
    }
  }, []);

  return (
    <div className="-mx-6 -mt-8 h-[calc(100vh-44px)] flex flex-col">
      {/* ── Page header + tab bar ─────────────────────────────────── */}
      <div className="flex items-center justify-between px-6 border-b border-c-border bg-c-panel flex-shrink-0">
        <h1 className="font-mono text-sm font-bold text-c-amber glow-a uppercase tracking-widest py-3">
          KNOWLEDGE GRAPH
        </h1>
        <div className="flex">
          {TABS.map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-4 py-3 font-mono text-[11px] uppercase tracking-wider border-b-2 -mb-[1px] transition-colors ${
                  isActive
                    ? 'text-c-amber border-c-amber'
                    : 'text-c-muted hover:text-c-text border-transparent'
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Tab content ───────────────────────────────────────────── */}
      <div className="flex-1 min-h-0 overflow-auto">
        {activeTab === 'explorer' && (
          <div className="h-full">
            <GraphExplorer />
          </div>
        )}
        {activeTab === '3d' && (
          <div className="h-full">
            <Graph3DView />
          </div>
        )}
        {activeTab === 'health' && (
          <div className="p-6">
            <GraphHealth onNavigateToExplorer={handleNavigateToExplorer} />
          </div>
        )}
        {activeTab === 'coverage' && (
          <div className="p-6">
            <GraphCoverage onNavigateToExplorer={handleNavigateToExplorer} />
          </div>
        )}
      </div>
    </div>
  );
}
