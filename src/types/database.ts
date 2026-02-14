export type ValidationStatus = 'pending' | 'validated' | 'rejected' | 'needs_edit';
export type EmbeddingStatus = 'current' | 'stale';
export type RelationType =
  | 'requires_knowledge_of'
  | 'leads_to_discussion_of'
  | 'is_component_of'
  | 'contrasts_with'
  | 'mitigates_risk_of'
  | 'applies_in_scenario';
export type AssessmentScore = 'satisfactory' | 'unsatisfactory' | 'partial';
export type WeakAreaSeverity = 'critical' | 'moderate' | 'minor';
export type Rating = 'private' | 'instrument' | 'commercial' | 'atp';

export interface Concept {
  id: string;
  name: string;
  slug: string;
  name_normalized: string;
  aliases: string[];
  acs_task_id: string | null;
  category: string;
  content: string;
  key_facts: string[];
  common_misconceptions: string[];
  embedding: number[] | null;
  embedding_model: string;
  embedding_dim: number;
  embedding_status: EmbeddingStatus;
  extraction_confidence: number | null;
  validation_status: ValidationStatus;
  validated_at: string | null;
  validated_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface ConceptRelation {
  id: string;
  source_id: string;
  target_id: string;
  relation_type: RelationType;
  weight: number;
  examiner_transition: string | null;
  context: string | null;
  confidence: number;
}

export interface AcsTask {
  id: string;
  rating: Rating;
  area: string;
  task: string;
  knowledge_elements: Record<string, string>[];
  risk_management_elements: Record<string, string>[] | null;
  skill_elements: Record<string, string>[] | null;
}

export interface ExamSession {
  id: string;
  user_id: string;
  rating: Rating;
  started_at: string;
  ended_at: string | null;
  status: 'active' | 'paused' | 'completed';
  acs_tasks_covered: AcsTaskCoverage[];
  concept_path: ConceptPathEntry[];
  weak_areas: WeakArea[];
  metadata: Record<string, unknown>;
}

export interface AcsTaskCoverage {
  task_id: string;
  status: AssessmentScore;
  attempts: number;
}

export interface ConceptPathEntry {
  concept_id: string;
  timestamp: string;
  transition_reason: string;
}

export interface WeakArea {
  concept_id: string;
  severity: WeakAreaSeverity;
  notes: string;
}

export interface SessionTranscript {
  id: string;
  session_id: string;
  exchange_number: number;
  role: 'examiner' | 'student';
  text: string;
  audio_storage_path: string | null;
  concept_id: string | null;
  assessment: AssessmentResult | null;
  timestamp: string;
}

export interface AssessmentResult {
  score: AssessmentScore;
  feedback: string;
  misconceptions: string[];
  follow_up_needed: boolean;
}

export interface LatencyLog {
  id: string;
  session_id: string;
  exchange_number: number;
  vad_to_stt_ms: number | null;
  stt_duration_ms: number | null;
  stt_audio_size_kb: number | null;
  stt_to_llm_first_token_ms: number | null;
  llm_total_ms: number | null;
  llm_to_tts_first_byte_ms: number | null;
  total_pipeline_ms: number | null;
  timestamp: string;
}

export interface OffGraphMention {
  id: string;
  session_id: string;
  raw_phrase: string;
  nearest_concept_id: string | null;
  retrieval_confidence: number | null;
  pivot_occurred: boolean;
  processed: boolean;
  timestamp: string;
}
