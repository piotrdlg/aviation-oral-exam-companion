import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export interface ExamMessage {
  role: 'examiner' | 'student';
  text: string;
}

export interface ExamTurn {
  examinerMessage: string;
  assessment?: {
    score: 'satisfactory' | 'unsatisfactory' | 'partial';
    feedback: string;
    misconceptions: string[];
    follow_up_needed: boolean;
  };
}

interface AcsElement {
  code: string;
  description: string;
}

interface AcsTaskRow {
  id: string;
  area: string;
  task: string;
  knowledge_elements: AcsElement[];
  risk_management_elements: AcsElement[];
  skill_elements: AcsElement[];
}

/**
 * Pick a random uncovered ACS task to start examining.
 * For the tracer bullet, just picks a random task from Area I.
 */
export async function pickStartingTask(): Promise<AcsTaskRow | null> {
  const { data, error } = await supabase
    .from('acs_tasks')
    .select('*')
    .eq('rating', 'private')
    .like('id', 'PA.I.%');

  if (error || !data || data.length === 0) return null;
  return data[Math.floor(Math.random() * data.length)] as AcsTaskRow;
}

/**
 * Build the system prompt for the DPE examiner persona.
 */
function buildSystemPrompt(task: AcsTaskRow): string {
  const knowledgeList = task.knowledge_elements
    .map((e: AcsElement) => `  - ${e.code}: ${e.description}`)
    .join('\n');
  const riskList = task.risk_management_elements
    .map((e: AcsElement) => `  - ${e.code}: ${e.description}`)
    .join('\n');

  return `You are a Designated Pilot Examiner (DPE) conducting an FAA Private Pilot oral examination. You are professional, thorough, and encouraging — firm but fair.

CURRENT ACS TASK: ${task.area} > ${task.task} (${task.id})

KNOWLEDGE ELEMENTS TO COVER:
${knowledgeList}

RISK MANAGEMENT ELEMENTS TO COVER:
${riskList}

INSTRUCTIONS:
1. Ask ONE clear question at a time about a specific knowledge or risk management element.
2. After the applicant responds, briefly assess their answer:
   - If correct and complete, acknowledge and move to the next element or a natural follow-up.
   - If partially correct, probe deeper with a follow-up question.
   - If incorrect, note the error and rephrase or offer a hint before moving on.
3. Use realistic DPE phrasing. For example:
   - "Tell me about..." / "Walk me through..." / "What would you do if..."
   - "Good. Now let's talk about..." / "That's close, but think about..."
4. Cover at least 2-3 knowledge elements and 1-2 risk management elements per task.
5. Keep questions conversational, not robotic. A real DPE connects topics naturally.
6. When you've covered enough elements, naturally transition by saying something like "Good, let's move on to..." or end the session.

IMPORTANT: Respond ONLY as the examiner. Do not include any JSON, metadata, or system text. Just speak naturally as the DPE would.`;
}

/**
 * Generate the next examiner turn given conversation history.
 */
export async function generateExaminerTurn(
  task: AcsTaskRow,
  history: ExamMessage[]
): Promise<ExamTurn> {
  const systemPrompt = buildSystemPrompt(task);

  const messages = history.map((msg) => ({
    role: msg.role === 'examiner' ? 'assistant' as const : 'user' as const,
    content: msg.text,
  }));

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-5-20250929',
    max_tokens: 500,
    system: systemPrompt,
    messages:
      messages.length === 0
        ? [{ role: 'user', content: 'Begin the oral examination.' }]
        : messages,
  });

  const examinerMessage =
    response.content[0].type === 'text' ? response.content[0].text : '';

  return { examinerMessage };
}

/**
 * Assess the student's latest answer using Claude.
 */
export async function assessAnswer(
  task: AcsTaskRow,
  history: ExamMessage[],
  studentAnswer: string
): Promise<ExamTurn['assessment']> {
  const knowledgeList = task.knowledge_elements
    .map((e: AcsElement) => `${e.code}: ${e.description}`)
    .join('\n');

  const recentContext = history
    .slice(-4)
    .map((m) => `${m.role}: ${m.text}`)
    .join('\n');

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-5-20250929',
    max_tokens: 300,
    system: `You are assessing a private pilot applicant's oral exam answer. Rate it against the ACS standards.

ACS Task: ${task.id} - ${task.task}
Knowledge elements: ${knowledgeList}

Respond in JSON only: {"score":"satisfactory"|"unsatisfactory"|"partial","feedback":"brief note","misconceptions":["if any"],"follow_up_needed":true|false}`,
    messages: [
      {
        role: 'user',
        content: `Recent conversation:\n${recentContext}\n\nStudent's answer: ${studentAnswer}\n\nAssess this answer.`,
      },
    ],
  });

  const text =
    response.content[0].type === 'text' ? response.content[0].text : '{}';

  try {
    const cleaned = text.replace(/```json\n?|\n?```/g, '').trim();
    return JSON.parse(cleaned);
  } catch {
    return {
      score: 'partial',
      feedback: 'Assessment could not be parsed.',
      misconceptions: [],
      follow_up_needed: false,
    };
  }
}
