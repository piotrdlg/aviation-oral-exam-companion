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
export type ElementType = 'knowledge' | 'risk' | 'skill';
export type Difficulty = 'easy' | 'medium' | 'hard';
export type StudyMode = 'linear' | 'cross_acs' | 'weak_areas';
export type DifficultyPreference = Difficulty | 'mixed';
export type DocumentType = 'handbook' | 'ac' | 'cfr' | 'aim' | 'other';
export type TagType = 'attempt' | 'mention';
export type AircraftClass = 'ASEL' | 'AMEL' | 'ASES' | 'AMES';

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
  applicable_classes: AircraftClass[];
}

export interface AcsElement {
  code: string;
  task_id: string;
  element_type: ElementType;
  short_code: string;
  description: string;
  order_index: number;
  difficulty_default: Difficulty;
  weight: number;
  created_at: string;
}

export interface ExamSession {
  id: string;
  user_id: string;
  rating: Rating;
  started_at: string;
  ended_at: string | null;
  status: 'active' | 'paused' | 'completed';
  study_mode: StudyMode;
  difficulty_preference: DifficultyPreference;
  selected_areas: string[];
  aircraft_class: AircraftClass;
  selected_tasks: string[];
  acs_tasks_covered: AcsTaskCoverage[];
  concept_path: ConceptPathEntry[];
  weak_areas: WeakArea[];
  metadata: Record<string, unknown>;
  exchange_count: number;
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

export interface SourceDocument {
  id: string;
  title: string;
  faa_number: string | null;
  abbreviation: string;
  document_type: DocumentType;
  chapter_number: number | null;
  chapter_title: string | null;
  file_name: string;
  total_pages: number | null;
  storage_path: string | null;
  created_at: string;
}

export interface SourceChunk {
  id: string;
  document_id: string;
  chunk_index: number;
  heading: string | null;
  content: string;
  content_hash: string | null;
  page_start: number | null;
  page_end: number | null;
  embedding: number[] | null;
  embedding_model: string;
  embedding_dim: number;
  embedding_status: EmbeddingStatus;
  extraction_version: string;
  created_at: string;
}

export interface ElementAttempt {
  id: string;
  session_id: string;
  transcript_id: string;
  element_code: string;
  tag_type: TagType;
  score: AssessmentScore | null;
  is_primary: boolean;
  confidence: number | null;
  created_at: string;
}

export interface TranscriptCitation {
  id: string;
  transcript_id: string;
  chunk_id: string;
  rank: number;
  score: number | null;
  snippet: string | null;
  created_at: string;
}

export interface ElementScore {
  element_code: string;
  task_id: string;
  area: string;
  element_type: ElementType;
  difficulty_default: Difficulty;
  total_attempts: number;
  satisfactory_count: number;
  partial_count: number;
  unsatisfactory_count: number;
  latest_score: AssessmentScore | null;
  latest_attempt_at: string | null;
}

export interface PlannerState {
  version: number;
  queue: string[];
  cursor: number;
  recent: string[];
  attempts: Record<string, number>;
}

export interface SessionConfig {
  aircraftClass: AircraftClass;
  studyMode: StudyMode;
  difficulty: DifficultyPreference;
  selectedAreas: string[];
  selectedTasks: string[];
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

export type VoiceTier = 'ground_school' | 'checkride_prep' | 'dpe_live';

export interface UserProfile {
  id: string;
  user_id: string;
  tier: VoiceTier;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  stripe_price_id: string | null;
  stripe_product_id: string | null;
  stripe_subscription_item_id: string | null;
  subscription_status: 'active' | 'past_due' | 'canceled' | 'trialing' | 'incomplete';
  cancel_at_period_end: boolean;
  trial_end: string | null;
  current_period_start: string | null;
  current_period_end: string | null;
  last_webhook_event_id: string | null;
  last_webhook_event_ts: string | null;
  latest_invoice_status: string | null;
  created_at: string;
  updated_at: string;
}

export interface UsageLog {
  id: string;
  user_id: string;
  session_id: string | null;
  request_id: string | null;
  event_type: 'tts_request' | 'stt_session' | 'llm_request' | 'token_issued';
  provider: string;
  tier: string;
  quantity: number;
  latency_ms: number | null;
  status: 'ok' | 'error' | 'timeout';
  error_code: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}
