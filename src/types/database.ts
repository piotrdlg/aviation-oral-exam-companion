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
export type Difficulty = 'easy' | 'medium' | 'hard' | 'mixed';
export type StudyMode = 'linear' | 'cross_acs' | 'weak_areas';
/** @deprecated Use Difficulty directly — 'mixed' is now a first-class difficulty level */
export type DifficultyPreference = Difficulty;
export type DocumentType = 'handbook' | 'ac' | 'cfr' | 'aim' | 'other';
export type TagType = 'attempt' | 'mention';
export type AircraftClass = 'ASEL' | 'AMEL' | 'ASES' | 'AMES';

export type ConceptCategory =
  | 'acs_area'
  | 'acs_task'
  | 'acs_element'
  | 'topic'
  | 'definition'
  | 'procedure'
  | 'regulatory_claim'
  | 'artifact'
  | 'taxonomy_node';

export type EvidenceType = 'primary' | 'secondary' | 'example' | 'counterexample';

export interface ConceptChunkEvidence {
  id: string;
  concept_id: string;
  chunk_id: string;
  evidence_type: EvidenceType;
  quote: string | null;
  page_ref: string | null;
  confidence: number;
  created_by: string;
  created_at: string;
}

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
  status: 'active' | 'paused' | 'completed' | 'expired' | 'abandoned';
  is_onboarding: boolean;
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
  expires_at: string | null;
  result: ExamResult | null;
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

export type ExamGrade = 'satisfactory' | 'unsatisfactory' | 'incomplete';
export type CompletionTrigger = 'user_ended' | 'all_tasks_covered' | 'expired';

export interface ExamResult {
  grade: ExamGrade;
  score_percentage: number;
  total_elements_in_set: number;
  elements_asked: number;
  elements_satisfactory: number;
  elements_unsatisfactory: number;
  elements_partial: number;
  elements_not_asked: number;
  score_by_area: Record<string, {
    asked: number;
    satisfactory: number;
    unsatisfactory: number;
  }>;
  completion_trigger: CompletionTrigger;
  graded_at: string;
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
  description: string;
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
  rating: Rating;
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

export type AccountStatus = 'active' | 'suspended' | 'banned';
export type Theme = 'cockpit' | 'glass' | 'sectional' | 'briefing';

export interface PersonaConfig {
  persona_id: string;
  model: string;
  label: string;
  desc: string;
  gender: string;
  image: string;
}

export type SubscriptionStatus = 'active' | 'past_due' | 'canceled' | 'trialing' | 'incomplete' | 'none';
export type AuthMethod = 'email_otp' | 'google' | 'apple' | 'microsoft' | 'password';

export interface UserProfile {
  id: string;
  user_id: string;
  tier: VoiceTier;
  preferred_voice: string | null;
  preferred_rating: Rating | null;
  preferred_aircraft_class: AircraftClass | null;
  aircraft_type: string | null;
  home_airport: string | null;
  onboarding_completed: boolean;
  preferred_theme: Theme;
  display_name: string | null;
  avatar_url: string | null;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  stripe_price_id: string | null;
  stripe_product_id: string | null;
  stripe_subscription_item_id: string | null;
  subscription_status: SubscriptionStatus;
  cancel_at_period_end: boolean;
  trial_end: string | null;
  current_period_start: string | null;
  current_period_end: string | null;
  last_webhook_event_id: string | null;
  last_webhook_event_ts: string | null;
  latest_invoice_status: string | null;
  account_status: AccountStatus;
  status_reason: string | null;
  status_changed_at: string | null;
  status_changed_by: string | null;
  last_login_at: string | null;
  auth_method: AuthMethod | null;
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

// ============================================================
// Pre-commercialization types
// ============================================================

// System config
export interface SystemConfig {
  key: string;
  value: Record<string, unknown>;
  description: string | null;
  updated_at: string;
  updated_by: string | null;
}

export interface KillSwitchValue {
  enabled: boolean;
}

export interface MaintenanceModeValue {
  enabled: boolean;
  message: string;
}

export interface UserHardCapsValue {
  daily_llm_tokens: number;
  daily_tts_chars: number;
  daily_stt_seconds: number;
}

// Admin
export interface AdminDevice {
  id: string;
  user_id: string;
  device_fingerprint: string;
  device_label: string | null;
  last_used_at: string;
  created_at: string;
}

export interface AdminAuditLog {
  id: string;
  admin_user_id: string;
  action: string;
  target_type: string | null;
  target_id: string | null;
  details: Record<string, unknown>;
  ip_address: string | null;
  device_fingerprint: string | null;
  reason: string | null;
  created_at: string;
}

export interface AdminNote {
  id: string;
  target_user_id: string;
  admin_user_id: string;
  note: string;
  created_at: string;
}

// Prompts
export type PromptStatus = 'draft' | 'published' | 'archived';

export interface PromptVersion {
  id: string;
  prompt_key: string;
  rating: string | null;
  study_mode: string | null;
  difficulty: string | null;
  version: number;
  content: string;
  status: PromptStatus;
  change_summary: string | null;
  published_at: string | null;
  published_by: string | null;
  created_at: string;
  created_by: string | null;
}

// Moderation
export type ModerationStatus = 'open' | 'reviewing' | 'resolved' | 'dismissed';
export type ReportType = 'inaccurate_answer' | 'safety_incident' | 'bug_report' | 'content_error';

export interface ModerationQueueItem {
  id: string;
  report_type: ReportType;
  reporter_user_id: string | null;
  session_id: string | null;
  transcript_id: string | null;
  prompt_version_id: string | null;
  details: Record<string, unknown>;
  status: ModerationStatus;
  resolution_notes: string | null;
  resolved_by: string | null;
  resolved_at: string | null;
  created_at: string;
}

// Sessions
export interface ActiveSession {
  id: string;
  user_id: string;
  session_token_hash: string;
  device_info: Record<string, unknown>;
  device_label: string | null;
  ip_address: string | null;
  approximate_location: string | null;
  is_exam_active: boolean;
  exam_session_id: string | null;
  last_activity_at: string;
  created_at: string;
}

// Billing
export interface SubscriptionEvent {
  id: string;
  stripe_event_id: string;
  event_type: string;
  status: 'processing' | 'processed' | 'failed';
  error: string | null;
  created_at: string;
  payload: Record<string, unknown>;
}

// Structured view of system config values (for typed access after parsing).
// NOTE: The runtime SystemConfigMap used by kill-switch.ts and system-config.ts
// is Record<string, Record<string, unknown>>. This is the typed overlay.
export interface SystemConfigStructured {
  killSwitches: Record<string, KillSwitchValue>;
  maintenanceMode: MaintenanceModeValue;
  userHardCaps: UserHardCapsValue;
}

// ============================================================
// Support tickets
// ============================================================

export type TicketType = 'support' | 'feedback';
export type TicketStatus = 'open' | 'in_progress' | 'resolved' | 'closed';
export type TicketPriority = 'low' | 'normal' | 'high' | 'urgent';
export type ReplyDirection = 'inbound' | 'outbound';

export interface SupportTicket {
  id: string;
  resend_email_id: string | null;
  from_email: string;
  from_name: string | null;
  to_address: string;
  subject: string;
  body_text: string | null;
  body_html: string | null;
  ticket_type: TicketType;
  status: TicketStatus;
  priority: TicketPriority;
  assigned_to: string | null;
  user_id: string | null;
  reply_count: number;
  last_reply_at: string | null;
  admin_notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface TicketReply {
  id: string;
  ticket_id: string;
  direction: ReplyDirection;
  from_email: string;
  body_text: string | null;
  body_html: string | null;
  resend_email_id: string | null;
  created_at: string;
}
