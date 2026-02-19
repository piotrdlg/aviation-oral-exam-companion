import type { Page } from '@playwright/test';

export const MOCK_VOICE_OPTIONS = [
  { model: 'aura-2-orion-en', label: 'Bob Mitchell', desc: 'Friendly veteran DPE everyone recommends', gender: 'M', persona_id: 'bob_mitchell', image: '/personas/bob-mitchell.webp' },
  { model: 'aura-2-zeus-en', label: 'Jim Hayes', desc: 'Younger examiner, methodical', gender: 'M', persona_id: 'jim_hayes', image: '/personas/jim-hayes.webp' },
  { model: 'aura-2-athena-en', label: 'Karen Sullivan', desc: 'Warm but thorough, catches everything', gender: 'F', persona_id: 'karen_sullivan', image: '/personas/karen-sullivan.webp' },
  { model: 'aura-2-luna-en', label: 'Maria Torres', desc: 'Precise and efficient', gender: 'F', persona_id: 'maria_torres', image: '/personas/maria-torres.webp' },
];

export function makeTierResponse(overrides: Record<string, unknown> = {}) {
  return {
    tier: 'checkride_prep',
    features: { maxSessionsPerMonth: 5, maxTtsCharsPerMonth: 50000 },
    usage: { sessionsThisMonth: 0, ttsCharsThisMonth: 0, sttSecondsThisMonth: 0 },
    preferredVoice: null,
    preferredRating: 'private',
    preferredAircraftClass: 'ASEL',
    onboardingCompleted: true,
    preferredTheme: 'cockpit',
    displayName: null,
    avatarUrl: null,
    voiceOptions: MOCK_VOICE_OPTIONS,
    ...overrides,
  };
}

export function makeExamStart(taskId = 'PA.I.A') {
  return {
    taskId,
    taskData: { id: taskId, area: 'I. Preflight Preparation', task: 'A. Pilot Qualifications', elements: [], knowledge_elements: [], risk_management_elements: [], skill_elements: [] },
    examinerMessage: 'Welcome to your oral exam. Let us begin with pilot qualifications.',
    plannerState: { currentAreaIndex: 0, currentTaskIndex: 0, plan: [] },
  };
}

export function makeExamRespond(taskId = 'PA.I.A') {
  return {
    taskId,
    taskData: { id: taskId, area: 'I. Preflight Preparation', task: 'A. Pilot Qualifications', elements: [], knowledge_elements: [], risk_management_elements: [], skill_elements: [] },
    examinerMessage: 'Good answer. Tell me more about currency requirements.',
    assessment: { score: 'satisfactory', feedback: 'Correct understanding.', misconceptions: [] },
  };
}

export async function setupStandardMocks(page: Page, tierOverrides: Record<string, unknown> = {}) {
  await page.route('**/api/user/tier', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(makeTierResponse(tierOverrides)),
      });
    } else {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) });
    }
  });

  await page.route('**/api/session*', async (route) => {
    const url = route.request().url();
    if (url.includes('action=get-resumable')) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ session: null }) });
    } else if (route.request().method() === 'GET') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ sessions: [] }) });
    } else {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ session: { id: 'test-session-id', status: 'active' } }) });
    }
  });

  await page.route('**/api/tts', async (route) => {
    await route.fulfill({ status: 200, contentType: 'audio/mpeg', body: Buffer.alloc(100) });
  });

  await page.route('**/api/stripe/status', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ tier: 'checkride_prep', status: 'free' }) });
  });

  await page.route('**/api/user/sessions', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ sessions: [{ id: 's1', device_label: 'Chrome on macOS', this_device: true, is_exam_active: false, last_activity_at: new Date().toISOString(), created_at: new Date().toISOString(), approximate_location: null }] }) });
  });

  await page.route('**/api/exam?action=list-tasks*', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ tasks: [{ id: 'PA.I.A', area: 'I. Preflight Preparation' }] }) });
  });
}
