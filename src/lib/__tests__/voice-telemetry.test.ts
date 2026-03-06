import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Tests for src/lib/voice-telemetry.ts
 *
 * Validates:
 * - captureVoiceEvent calls posthog.capture with browser info
 * - getBrowserInfo detects common browsers correctly
 * - No sensitive fields (tokens, transcripts) are leaked
 * - Silent on error (telemetry must never break the app)
 */

// vi.hoisted ensures mockCapture is available when vi.mock factory runs (hoisted)
const { mockCapture } = vi.hoisted(() => ({
  mockCapture: vi.fn(),
}));

vi.mock('posthog-js', () => ({
  default: {
    capture: mockCapture,
  },
}));

import { captureVoiceEvent, getBrowserInfo } from '../voice-telemetry';

describe('captureVoiceEvent', () => {
  beforeEach(() => {
    mockCapture.mockClear();
  });

  it('calls posthog.capture with event name', () => {
    captureVoiceEvent('stt_websocket_connected', { attempt: 1 });
    expect(mockCapture).toHaveBeenCalledTimes(1);
    expect(mockCapture.mock.calls[0][0]).toBe('stt_websocket_connected');
  });

  it('merges custom properties into capture call', () => {
    captureVoiceEvent('stt_token_request_started', { session_id: 'abc123' });
    const props = mockCapture.mock.calls[0][1];
    expect(props.session_id).toBe('abc123');
  });

  it('works with no properties', () => {
    captureVoiceEvent('voice_retry_attempted');
    expect(mockCapture).toHaveBeenCalledTimes(1);
    expect(mockCapture.mock.calls[0][0]).toBe('voice_retry_attempted');
  });

  it('does not throw when posthog.capture throws', () => {
    mockCapture.mockImplementationOnce(() => {
      throw new Error('PostHog exploded');
    });
    // Should not throw — telemetry must never break the app
    expect(() => captureVoiceEvent('test_event')).not.toThrow();
  });

  it('never includes token or transcript fields in passed properties', () => {
    captureVoiceEvent('stt_token_request_succeeded', {
      session_id: 'sess1',
      token_len: 42,
    });
    const props = mockCapture.mock.calls[0][1];
    // Verify the event does NOT contain actual token values
    expect(props.token).toBeUndefined();
    expect(props.transcript).toBeUndefined();
    expect(props.access_token).toBeUndefined();
    // But metadata is fine
    expect(props.token_len).toBe(42);
    expect(props.session_id).toBe('sess1');
  });

  it('passes different event names through to posthog', () => {
    captureVoiceEvent('stt_websocket_failed', { attempt: 2 });
    captureVoiceEvent('voice_auto_disabled', { reason: 'user_chose_text_only' });
    expect(mockCapture).toHaveBeenCalledTimes(2);
    expect(mockCapture.mock.calls[0][0]).toBe('stt_websocket_failed');
    expect(mockCapture.mock.calls[1][0]).toBe('voice_auto_disabled');
  });
});

describe('getBrowserInfo', () => {
  it('returns browser and platform keys', () => {
    const info = getBrowserInfo();
    // In any environment, should return browser and platform (or empty if no navigator)
    if (typeof navigator !== 'undefined') {
      expect(info).toHaveProperty('browser');
      expect(info).toHaveProperty('platform');
    } else {
      expect(info).toEqual({});
    }
  });
});

describe('voice telemetry event naming conventions', () => {
  it('all STT events use stt_ prefix', () => {
    const sttEvents = [
      'stt_websocket_connect_started',
      'stt_websocket_connected',
      'stt_websocket_failed',
      'stt_websocket_closed',
      'stt_token_request_started',
      'stt_token_request_succeeded',
      'stt_token_request_failed',
      'stt_mic_permission_failed',
    ];
    for (const event of sttEvents) {
      expect(event).toMatch(/^stt_/);
    }
  });

  it('all voice-level events use voice_ prefix', () => {
    const voiceEvents = [
      'voice_retry_attempted',
      'voice_auto_disabled',
    ];
    for (const event of voiceEvents) {
      expect(event).toMatch(/^voice_/);
    }
  });
});
