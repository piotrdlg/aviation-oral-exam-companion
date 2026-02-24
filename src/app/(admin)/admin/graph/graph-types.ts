import type { ConceptCategory, RelationType, ValidationStatus } from '@/types/database';

/** Node in the force-graph data structure */
export interface GraphNode {
  id: string;
  name: string;
  slug: string;
  category: ConceptCategory;
  content: string;
  keyFacts: unknown[];
  misconceptions: unknown[];
  validationStatus: ValidationStatus;
  edgeCount: number;
  evidence: EvidenceItem[];
  // Set by force-graph at runtime
  x?: number;
  y?: number;
  z?: number;
}

/** Edge in the force-graph data structure */
export interface GraphLink {
  source: string;
  target: string;
  relationType: RelationType;
  weight: number;
  confidence: number;
  examinerTransition: string | null;
}

/** Evidence citation attached to a concept */
export interface EvidenceItem {
  chunkId: string;
  docTitle: string;
  pageRef: string | null;
  confidence: number;
}

/** Data shape for react-force-graph */
export interface GraphData {
  nodes: GraphNode[];
  links: GraphLink[];
}

/** Health tab aggregate data */
export interface GraphHealthData {
  totals: {
    concepts: number;
    edges: number;
    evidence: number;
    orphans: number;
  };
  byCategory: CategoryStats[];
  byRelation: RelationStats[];
  orphans: OrphanNode[];
  unvalidated: UnvalidatedNode[];
  coverage: RatingCoverage[];
}

export interface CategoryStats {
  category: string;
  count: number;
  pctEmbedded: number;
  pctValidated: number;
  avgEdges: number;
}

export interface RelationStats {
  type: string;
  count: number;
  avgConfidence: number;
  avgWeight: number;
}

export interface OrphanNode {
  id: string;
  name: string;
  slug: string;
  category: string;
}

export interface UnvalidatedNode {
  id: string;
  name: string;
  slug: string;
  category: string;
  confidence: number | null;
}

export interface RatingCoverage {
  rating: string;
  totalElements: number;
  connectedElements: number;
  pct: number;
}

/** Coverage tab data */
export interface CoverageData {
  rating: string;
  areas: CoverageArea[];
}

export interface CoverageArea {
  name: string;
  slug: string;
  tasks: CoverageTask[];
}

export interface CoverageTask {
  name: string;
  slug: string;
  elements: CoverageElement[];
}

export interface CoverageElement {
  code: string;
  name: string;
  edgeCount: number;
}

/**
 * Map concept category to CSS color variable name.
 * These map to --color-c-* CSS custom properties defined in globals.css,
 * which automatically adapt across all 4 themes (cockpit/glass/sectional/briefing).
 */
export const CATEGORY_COLORS: Record<ConceptCategory, string> = {
  acs_area: 'var(--color-c-amber)',
  acs_task: 'var(--color-c-amber-dim)',
  acs_element: 'var(--color-c-text)',
  topic: 'var(--color-c-cyan)',
  definition: 'var(--color-c-green)',
  procedure: 'var(--color-c-cyan-dim)',
  regulatory_claim: 'var(--color-c-red)',
  artifact: 'var(--color-c-dim)',
};

/**
 * Map relation type to CSS color + opacity for edges.
 */
export const RELATION_COLORS: Record<RelationType, { color: string; opacity: number }> = {
  is_component_of: { color: 'var(--color-c-amber-dim)', opacity: 0.8 },
  applies_in_scenario: { color: 'var(--color-c-red)', opacity: 0.3 },
  leads_to_discussion_of: { color: 'var(--color-c-cyan)', opacity: 0.3 },
  requires_knowledge_of: { color: 'var(--color-c-green)', opacity: 0.3 },
  contrasts_with: { color: 'var(--color-c-red)', opacity: 0.7 },
  mitigates_risk_of: { color: 'var(--color-c-green-dim)', opacity: 0.5 },
};

/** Category labels for display */
export const CATEGORY_LABELS: Record<ConceptCategory, string> = {
  acs_area: 'ACS Area',
  acs_task: 'ACS Task',
  acs_element: 'ACS Element',
  topic: 'Topic',
  definition: 'Definition',
  procedure: 'Procedure',
  regulatory_claim: 'Regulatory Claim',
  artifact: 'Artifact',
};

/** Relation type labels for display */
export const RELATION_LABELS: Record<RelationType, string> = {
  is_component_of: 'Component Of',
  applies_in_scenario: 'Applies In',
  leads_to_discussion_of: 'Leads To',
  requires_knowledge_of: 'Requires',
  contrasts_with: 'Contrasts With',
  mitigates_risk_of: 'Mitigates',
};
