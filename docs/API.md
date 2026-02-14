# API Documentation

All API routes are server-side Next.js Route Handlers under `src/app/api/`. All endpoints require authentication via Supabase session cookies (set automatically by the auth middleware).

## `POST /api/exam`

The core exam engine endpoint. Handles three actions for managing the AI examiner conversation.

### Action: `start`

Begins a new exam by picking a random ACS task and generating the first examiner question.

**Request:**
```json
{
  "action": "start"
}
```

**Response:**
```json
{
  "taskId": "PA.I.A",
  "taskData": {
    "id": "PA.I.A",
    "area": "Preflight Preparation",
    "task": "Pilot Qualifications",
    "knowledge_elements": [
      { "code": "PA.I.A.K1", "description": "..." }
    ],
    "risk_management_elements": [...],
    "skill_elements": [...]
  },
  "examinerMessage": "Good morning. Let's start with some basics..."
}
```

### Action: `respond`

Sends the student's answer, gets an assessment and the examiner's next response.

**Request:**
```json
{
  "action": "respond",
  "taskData": { ... },
  "history": [
    { "role": "examiner", "text": "Tell me about..." },
    { "role": "student", "text": "Well, the..." }
  ],
  "studentAnswer": "The pilot must hold a valid..."
}
```

**Response:**
```json
{
  "taskId": "PA.I.A",
  "taskData": { ... },
  "examinerMessage": "Good. Now tell me about...",
  "assessment": {
    "score": "satisfactory",
    "feedback": "Correct and complete answer",
    "misconceptions": [],
    "follow_up_needed": false
  }
}
```

**Assessment scores**: `satisfactory`, `unsatisfactory`, `partial`

### Action: `next-task`

Transitions to a new ACS task area, avoiding already-covered tasks.

**Request:**
```json
{
  "action": "next-task",
  "taskData": { "id": "PA.I.A", ... },
  "coveredTaskIds": ["PA.I.A", "PA.I.B"]
}
```

**Response** (new task available):
```json
{
  "taskId": "PA.IX.A",
  "taskData": { ... },
  "examinerMessage": "Good, let's move on to emergency operations..."
}
```

**Response** (all tasks covered):
```json
{
  "examinerMessage": "We have covered all the areas. Great job today!",
  "sessionComplete": true
}
```

---

## `POST /api/session`

Manages exam session records in the database.

### Action: `create`

Creates a new session record.

**Request:**
```json
{
  "action": "create"
}
```

**Response:**
```json
{
  "session": {
    "id": "uuid-here",
    "user_id": "...",
    "status": "active",
    "started_at": "2026-02-14T...",
    ...
  }
}
```

### Action: `update`

Updates an existing session (exchange count, status, covered tasks).

**Request:**
```json
{
  "action": "update",
  "sessionId": "uuid-here",
  "status": "completed",
  "exchange_count": 12,
  "acs_tasks_covered": [
    { "task_id": "PA.I.A", "status": "covered" },
    { "task_id": "PA.IX.A", "status": "covered" }
  ]
}
```

**Response:**
```json
{
  "ok": true
}
```

---

## `GET /api/session`

Returns the authenticated user's most recent 20 sessions, ordered by start time (newest first).

**Response:**
```json
{
  "sessions": [
    {
      "id": "uuid",
      "user_id": "uuid",
      "status": "completed",
      "started_at": "2026-02-14T...",
      "ended_at": "2026-02-14T...",
      "exchange_count": 8,
      "acs_tasks_covered": [...]
    }
  ]
}
```

---

## `POST /api/tts`

Converts text to speech using OpenAI's TTS API. Returns raw MP3 audio.

**Request:**
```json
{
  "text": "Tell me about the weather minimums for VFR flight."
}
```

**Response:** Binary MP3 audio stream with `Content-Type: audio/mpeg`.

**Limits:** Text is truncated to 2000 characters server-side.

**Voice:** `onyx` (deep, authoritative — appropriate for DPE persona).

---

## `GET /auth/callback`

Handles email confirmation redirects from Supabase Auth. Exchanges the `code` query parameter for a session, then redirects to `/practice`.

**Query Parameters:**
- `code` — Authorization code from Supabase confirmation email
- `next` — Optional redirect path (defaults to `/practice`)

---

## Error Responses

All endpoints return errors in this format:

```json
{
  "error": "Error description"
}
```

| Status | Meaning |
|--------|---------|
| 400 | Invalid action or missing required fields |
| 401 | Not authenticated |
| 500 | Server error (database, API call failure) |

---

## AI Models Used

| Purpose | Model | Max Tokens | Notes |
|---------|-------|-----------|-------|
| Examiner persona | `claude-sonnet-4-5-20250929` | 500 | Generates questions and responses |
| Answer assessment | `claude-sonnet-4-5-20250929` | 300 | Returns structured JSON score |
| Text-to-speech | `tts-1` (OpenAI) | N/A | Voice: `onyx`, format: MP3 |
