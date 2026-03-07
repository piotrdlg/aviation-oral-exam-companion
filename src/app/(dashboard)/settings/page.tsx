'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { VoiceTier, TierFeatures } from '@/lib/voice/types';
import type { Rating, AircraftClass, ExaminerProfileKey, CertificateType } from '@/types/database';
import { THEMES, setTheme } from '@/lib/theme';
import { DEFAULT_AVATARS } from '@/lib/avatar-options';
import { EXAMINER_PROFILES, ALL_PROFILE_KEYS, type ExaminerProfileV1 } from '@/lib/examiner-profile';
import { warmUpAudio } from '@/lib/audio-unlock';

type TestStatus = 'idle' | 'running' | 'pass' | 'fail';

interface DiagStep {
  label: string;
  status: TestStatus;
  detail: string;
}

interface AudioDevice {
  deviceId: string;
  label: string;
}

interface VoiceOption {
  model: string;
  label: string;
  desc?: string;
  gender?: string;
  persona_id?: string;
  image?: string;
}

interface TierInfo {
  tier: VoiceTier;
  features: TierFeatures;
  usage: {
    sessionsThisMonth: number;
    ttsCharsThisMonth: number;
    sttSecondsThisMonth: number;
  };
  preferredVoice: string | null;
  preferredRating: Rating;
  preferredAircraftClass: AircraftClass;
  aircraftType: string | null;
  homeAirport: string | null;
  preferredTheme: string;
  voiceEnabled: boolean;
  voiceOptions: VoiceOption[];
  displayName: string | null;
  avatarUrl: string | null;
  examinerProfile: ExaminerProfileKey | null;
}

interface SubscriptionInfo {
  tier: string;
  status: string;
  plan: string | null;
  renewalDate: string | null;
  hasStripeCustomer: boolean;
}

interface ActiveSessionItem {
  id: string;
  device_label: string;
  approximate_location: string | null;
  is_exam_active: boolean;
  last_activity_at: string;
  created_at: string;
  this_device: boolean;
}

export default function SettingsPage() {
  const [email, setEmail] = useState<string | null>(null);
  const supabase = createClient();

  // Voice tier & voice preference state
  const [tierInfo, setTierInfo] = useState<TierInfo | null>(null);
  const [tierLoading, setTierLoading] = useState(true);
  const [voiceSaving, setVoiceSaving] = useState(false);
  const [voiceMessage, setVoiceMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  const [previewingVoice, setPreviewingVoice] = useState<string | null>(null);
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);

  // Practice defaults state
  const [defaultsSaving, setDefaultsSaving] = useState(false);
  const [defaultsMessage, setDefaultsMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  // Subscription state (Task 35)
  const [subInfo, setSubInfo] = useState<SubscriptionInfo | null>(null);
  const [subLoading, setSubLoading] = useState(true);
  const [portalLoading, setPortalLoading] = useState(false);
  const [portalError, setPortalError] = useState<string | null>(null);

  // Feedback widget state (Task 27)
  const [feedbackType, setFeedbackType] = useState<'bug_report' | 'content_error' | null>(null);
  const [feedbackDescription, setFeedbackDescription] = useState('');
  const [feedbackSubmitting, setFeedbackSubmitting] = useState(false);
  const [feedbackMessage, setFeedbackMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  // Active sessions state (Task 32)
  const [activeSessions, setActiveSessions] = useState<ActiveSessionItem[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(true);
  const [signOutOthersLoading, setSignOutOthersLoading] = useState(false);
  const [sessionsMessage, setSessionsMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  // Email notification preferences state
  const [emailPrefs, setEmailPrefs] = useState<Record<string, boolean> | null>(null);
  const [emailPrefsLoading, setEmailPrefsLoading] = useState(true);
  const [emailPrefsSaving, setEmailPrefsSaving] = useState<string | null>(null);
  const [emailPrefsMessage, setEmailPrefsMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  // Instructor Mode state
  const [instructorFeatureEnabled, setInstructorFeatureEnabled] = useState(false);
  const [instructorState, setInstructorState] = useState<{
    featureEnabled: boolean;
    hasProfile: boolean;
    profile: {
      status: string;
      first_name: string | null;
      last_name: string | null;
      certificate_number: string | null;
      certificate_type: CertificateType | null;
      rejection_reason: string | null;
      suspension_reason: string | null;
    } | null;
    applicationStatus: string | null;
    canActivate: boolean;
    canOpenInstructorMode: boolean;
    statusMessage: string;
    hasCourtesyAccess?: boolean;
    courtesyReason?: string;
    paidStudentCount?: number;
  } | null>(null);
  const [instructorLoading, setInstructorLoading] = useState(true);
  const [instructorFormVisible, setInstructorFormVisible] = useState(false);
  const [instructorFirstName, setInstructorFirstName] = useState('');
  const [instructorLastName, setInstructorLastName] = useState('');
  const [instructorCertNumber, setInstructorCertNumber] = useState('');
  const [instructorCertType, setInstructorCertType] = useState<CertificateType>('CFI');
  const [instructorSubmitting, setInstructorSubmitting] = useState(false);
  const [instructorMessage, setInstructorMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  const [invites, setInvites] = useState<{ id: string; token: string; invite_url: string; expires_at: string; claimed_at: string | null; claimed_by: string | null; revoked_at: string | null }[]>([]);
  const [invitesLoading, setInvitesLoading] = useState(false);
  const [inviteCreating, setInviteCreating] = useState(false);
  const [inviteCopied, setInviteCopied] = useState<string | null>(null);

  // Student-instructor connection state
  const [studentConnection, setStudentConnection] = useState<{
    id: string;
    state: string;
    instructorName: string | null;
    instructorCertType: string | null;
    connectedAt: string | null;
    requestedAt: string | null;
  } | null>(null);
  const [studentConnLoading, setStudentConnLoading] = useState(true);
  const [instructorSearchLastName, setInstructorSearchLastName] = useState('');
  const [instructorSearchCertNum, setInstructorSearchCertNum] = useState('');
  const [instructorSearchResults, setInstructorSearchResults] = useState<{ id: string; userId: string; displayName: string; certType: string | null }[]>([]);
  const [instructorSearching, setInstructorSearching] = useState(false);
  const [connectionActionLoading, setConnectionActionLoading] = useState(false);
  const [connectionMessage, setConnectionMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  // Milestones state
  const [milestones, setMilestones] = useState<{ key: string; status: string; declaredAt: string | null; declaredBy: string }[]>([]);
  const [milestoneLoading, setMilestoneLoading] = useState(true);
  const [milestoneUpdating, setMilestoneUpdating] = useState<string | null>(null);

  // Voice diagnostics state
  const [diagOpen, setDiagOpen] = useState(false);
  const [diagRunning, setDiagRunning] = useState(false);
  const [steps, setSteps] = useState<DiagStep[]>([
    { label: 'Microphone access', status: 'idle', detail: '' },
    { label: 'Speech recognition', status: 'idle', detail: '' },
    { label: 'Speaker / TTS playback', status: 'idle', detail: '' },
  ]);
  const [micLevel, setMicLevel] = useState(0);
  const [recognizedText, setRecognizedText] = useState('');
  const [audioDevices, setAudioDevices] = useState<AudioDevice[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>('');
  const streamRef = useRef<MediaStream | null>(null);
  const animRef = useRef<number>(0);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setEmail(data.user?.email ?? null);
    });
  }, [supabase.auth]);

  // Fetch current voice tier + voice options
  useEffect(() => {
    fetch('/api/user/tier')
      .then((res) => res.json())
      .then((data) => {
        if (data.tier) {
          setTierInfo({
            tier: data.tier,
            features: data.features,
            usage: data.usage,
            preferredVoice: data.preferredVoice || null,
            preferredRating: data.preferredRating || 'private',
            preferredAircraftClass: data.preferredAircraftClass || 'ASEL',
            aircraftType: data.aircraftType || null,
            homeAirport: data.homeAirport || null,
            preferredTheme: data.preferredTheme || 'cockpit',
            voiceEnabled: data.voiceEnabled ?? true,
            voiceOptions: data.voiceOptions || [],
            displayName: data.displayName || null,
            avatarUrl: data.avatarUrl || null,
            examinerProfile: data.examinerProfile || null,
          });
        }
      })
      .catch(() => {})
      .finally(() => setTierLoading(false));
  }, []);

  // Fetch subscription status (Task 35)
  useEffect(() => {
    fetch('/api/stripe/status')
      .then((res) => res.json())
      .then((data) => {
        setSubInfo({
          tier: data.tier || 'checkride_prep',
          status: data.status || 'free',
          plan: data.plan || null,
          renewalDate: data.renewalDate || null,
          hasStripeCustomer: !!data.tier && data.status !== 'free',
        });
      })
      .catch(() => {})
      .finally(() => setSubLoading(false));
  }, []);

  // Fetch active sessions (Task 32)
  const fetchActiveSessions = useCallback(() => {
    setSessionsLoading(true);
    fetch('/api/user/sessions')
      .then((res) => res.ok ? res.json() : null)
      .then((data) => {
        if (data?.sessions) setActiveSessions(data.sessions);
      })
      .catch(() => {})
      .finally(() => setSessionsLoading(false));
  }, []);

  useEffect(() => {
    fetchActiveSessions();
  }, [fetchActiveSessions]);

  // Fetch email notification preferences
  useEffect(() => {
    fetch('/api/user/email-preferences')
      .then((res) => res.ok ? res.json() : null)
      .then((data) => {
        if (data?.preferences) setEmailPrefs(data.preferences);
      })
      .catch(() => {})
      .finally(() => setEmailPrefsLoading(false));
  }, []);

  // Fetch feature flags and instructor state
  useEffect(() => {
    fetch('/api/flags')
      .then((res) => res.json())
      .then((data) => {
        const enabled = data.instructor_partnership_v1 ?? false;
        setInstructorFeatureEnabled(enabled);
        if (enabled) {
          // Fetch instructor state only when feature is enabled
          fetch('/api/user/instructor')
            .then((res) => res.ok ? res.json() : null)
            .then((state) => {
              if (state) setInstructorState(state);
              if (state?.applicationStatus === 'approved') {
                fetch('/api/user/instructor/invites')
                  .then((res) => res.ok ? res.json() : null)
                  .then((data) => {
                    if (data?.invites) setInvites(data.invites);
                  })
                  .catch(() => {});
              }
            })
            .catch(() => {})
            .finally(() => setInstructorLoading(false));
          // Also fetch student's connection (student may not be an instructor)
          fetch('/api/user/instructor/connections')
            .then((res) => res.ok ? res.json() : null)
            .then((data) => {
              if (data?.connection) setStudentConnection(data.connection);
            })
            .catch(() => {})
            .finally(() => setStudentConnLoading(false));
        } else {
          setInstructorLoading(false);
          setStudentConnLoading(false);
        }
      })
      .catch(() => {
        setInstructorLoading(false);
      });
  }, []);

  // Fetch milestones
  useEffect(() => {
    async function loadMilestones() {
      try {
        const res = await fetch('/api/user/milestones');
        if (res.ok) {
          const data = await res.json();
          setMilestones(data.milestones || []);
        }
      } catch {
        // silently fail
      } finally {
        setMilestoneLoading(false);
      }
    }
    loadMilestones();
  }, []);

  const MILESTONE_LABELS: Record<string, string> = {
    knowledge_test_passed: 'FAA Knowledge Test',
    mock_oral_completed: 'Mock Oral Exam',
    checkride_scheduled: 'Checkride Scheduled',
    oral_passed: 'Oral Exam Passed',
  };

  const STATUS_OPTIONS: { value: string; label: string }[] = [
    { value: 'not_set', label: 'Not Started' },
    { value: 'in_progress', label: 'In Progress' },
    { value: 'completed', label: 'Completed' },
  ];

  async function handleMilestoneUpdate(key: string, newStatus: string) {
    setMilestoneUpdating(key);
    try {
      const res = await fetch('/api/user/milestones', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ milestoneKey: key, status: newStatus }),
      });
      if (!res.ok) throw new Error('Failed');
      // Refresh milestones
      const refreshRes = await fetch('/api/user/milestones');
      if (refreshRes.ok) {
        const data = await refreshRes.json();
        setMilestones(data.milestones || []);
      }
    } catch {
      // Show error inline
    } finally {
      setMilestoneUpdating(null);
    }
  }

  async function submitInstructorApplication() {
    setInstructorSubmitting(true);
    setInstructorMessage(null);
    try {
      const res = await fetch('/api/user/instructor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          firstName: instructorFirstName.trim(),
          lastName: instructorLastName.trim(),
          certificateNumber: instructorCertNumber.trim(),
          certificateType: instructorCertType,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to submit application');
      setInstructorMessage({ text: 'Application submitted! We will review it shortly.', type: 'success' });
      setInstructorFormVisible(false);
      // Re-fetch instructor state
      const stateRes = await fetch('/api/user/instructor');
      if (stateRes.ok) {
        const newState = await stateRes.json();
        setInstructorState(newState);
        if (newState?.applicationStatus === 'approved') {
          fetch('/api/user/instructor/invites')
            .then((res) => res.ok ? res.json() : null)
            .then((data) => {
              if (data?.invites) setInvites(data.invites);
            })
            .catch(() => {});
        }
      }
    } catch (err) {
      setInstructorMessage({ text: err instanceof Error ? err.message : 'Failed to submit application', type: 'error' });
    } finally {
      setInstructorSubmitting(false);
    }
  }

  async function createInviteLink() {
    setInviteCreating(true);
    try {
      const res = await fetch('/api/user/instructor/invites', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'create' }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to create invite');
      // Refresh invites list
      const listRes = await fetch('/api/user/instructor/invites');
      if (listRes.ok) {
        const listData = await listRes.json();
        if (listData?.invites) setInvites(listData.invites);
      }
    } catch (err) {
      setInstructorMessage({ text: err instanceof Error ? err.message : 'Failed to create invite', type: 'error' });
    } finally {
      setInviteCreating(false);
    }
  }

  async function revokeInviteLink(inviteId: string) {
    try {
      const res = await fetch('/api/user/instructor/invites', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'revoke', inviteId }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to revoke invite');
      }
      setInvites((prev) => prev.filter((i) => i.id !== inviteId));
    } catch (err) {
      setInstructorMessage({ text: err instanceof Error ? err.message : 'Failed to revoke invite', type: 'error' });
    }
  }

  function copyInviteUrl(url: string, inviteId: string) {
    navigator.clipboard.writeText(url).then(() => {
      setInviteCopied(inviteId);
      setTimeout(() => setInviteCopied(null), 2000);
    });
  }

  async function searchForInstructor() {
    if (!instructorSearchLastName.trim()) return;
    setInstructorSearching(true);
    setConnectionMessage(null);
    try {
      const params = new URLSearchParams({ lastName: instructorSearchLastName.trim() });
      if (instructorSearchCertNum.trim()) params.set('certNumber', instructorSearchCertNum.trim());
      const res = await fetch(`/api/user/instructor/search?${params}`);
      if (!res.ok) throw new Error('Search failed');
      const data = await res.json();
      setInstructorSearchResults(data.instructors || []);
      if (data.instructors?.length === 0) {
        setConnectionMessage({ text: 'No approved instructors found with that name.', type: 'error' });
      }
    } catch {
      setConnectionMessage({ text: 'Failed to search. Please try again.', type: 'error' });
    } finally {
      setInstructorSearching(false);
    }
  }

  async function requestInstructorConnection(instructorUserId: string) {
    setConnectionActionLoading(true);
    setConnectionMessage(null);
    try {
      const res = await fetch('/api/user/instructor/connections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'request_connection', instructor_user_id: instructorUserId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to request connection');
      setConnectionMessage({ text: 'Connection request sent! Your instructor will need to approve it.', type: 'success' });
      setInstructorSearchResults([]);
      // Refresh connection state
      const connRes = await fetch('/api/user/instructor/connections');
      if (connRes.ok) {
        const connData = await connRes.json();
        if (connData?.connection) setStudentConnection(connData.connection);
      }
    } catch (err) {
      setConnectionMessage({ text: err instanceof Error ? err.message : 'Failed to request connection', type: 'error' });
    } finally {
      setConnectionActionLoading(false);
    }
  }

  async function cancelOrDisconnect(connectionId: string, action: 'cancel_request' | 'disconnect') {
    setConnectionActionLoading(true);
    setConnectionMessage(null);
    try {
      const res = await fetch('/api/user/instructor/connections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, connection_id: connectionId }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed');
      }
      setStudentConnection(null);
      setConnectionMessage({ text: action === 'disconnect' ? 'Disconnected from instructor.' : 'Request cancelled.', type: 'success' });
    } catch (err) {
      setConnectionMessage({ text: err instanceof Error ? err.message : 'Failed', type: 'error' });
    } finally {
      setConnectionActionLoading(false);
    }
  }

  async function openCustomerPortal() {
    setPortalLoading(true);
    setPortalError(null);
    try {
      const res = await fetch('/api/stripe/portal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to open portal');
      if (data.url) {
        window.location.href = data.url;
      }
    } catch (err) {
      setPortalError(err instanceof Error ? err.message : 'Failed to open subscription portal. Please try again.');
    } finally {
      setPortalLoading(false);
    }
  }

  async function toggleEmailPref(category: string, enabled: boolean) {
    setEmailPrefsSaving(category);
    setEmailPrefsMessage(null);
    try {
      const res = await fetch('/api/user/email-preferences', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category, enabled }),
      });
      if (!res.ok) throw new Error('Failed to update');
      setEmailPrefs((prev) => prev ? { ...prev, [category]: enabled } : null);
      setEmailPrefsMessage({ text: 'Preference saved', type: 'success' });
      setTimeout(() => setEmailPrefsMessage(null), 2000);
    } catch (err) {
      setEmailPrefsMessage({ text: err instanceof Error ? err.message : 'Failed', type: 'error' });
    } finally {
      setEmailPrefsSaving(null);
    }
  }

  async function switchVoice(model: string) {
    if (tierInfo?.preferredVoice === model || voiceSaving) return;
    setVoiceSaving(true);
    setVoiceMessage(null);
    try {
      const res = await fetch('/api/user/tier', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ preferredVoice: model }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to update voice');
      setTierInfo((prev) => prev ? { ...prev, preferredVoice: model } : null);
      const label = tierInfo?.voiceOptions.find((v) => v.model === model)?.label || model;
      setVoiceMessage({ text: `Voice changed to ${label}`, type: 'success' });
    } catch (err) {
      setVoiceMessage({ text: err instanceof Error ? err.message : 'Failed to update voice', type: 'error' });
    } finally {
      setVoiceSaving(false);
    }
  }

  async function switchExaminerProfile(profileKey: ExaminerProfileKey) {
    if (tierInfo?.examinerProfile === profileKey || voiceSaving) return;
    setVoiceSaving(true);
    setVoiceMessage(null);
    try {
      const res = await fetch('/api/user/tier', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ examinerProfile: profileKey }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to update examiner');
      const profile = EXAMINER_PROFILES[profileKey];
      setTierInfo((prev) => prev ? {
        ...prev,
        examinerProfile: profileKey,
        preferredVoice: profile.voiceId,
      } : null);
      setVoiceMessage({ text: `Examiner changed to ${profile.defaultDisplayName}`, type: 'success' });
    } catch (err) {
      setVoiceMessage({ text: err instanceof Error ? err.message : 'Failed to update examiner', type: 'error' });
    } finally {
      setVoiceSaving(false);
    }
  }

  async function savePracticeDefault(field: 'preferredRating' | 'preferredAircraftClass' | 'aircraftType' | 'homeAirport' | 'preferredTheme' | 'displayName' | 'avatarUrl', value: string) {
    setDefaultsSaving(true);
    setDefaultsMessage(null);
    try {
      const res = await fetch('/api/user/tier', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [field]: value || null }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to update');
      setTierInfo((prev) => {
        if (!prev) return null;
        if (field === 'preferredRating') return { ...prev, preferredRating: value as Rating };
        if (field === 'preferredAircraftClass') return { ...prev, preferredAircraftClass: value as AircraftClass };
        if (field === 'aircraftType') return { ...prev, aircraftType: value || null };
        if (field === 'homeAirport') return { ...prev, homeAirport: value || null };
        if (field === 'displayName') return { ...prev, displayName: value || null };
        if (field === 'avatarUrl') return { ...prev, avatarUrl: value || null };
        return prev;
      });
      setDefaultsMessage({ text: 'Preference saved', type: 'success' });
      setTimeout(() => setDefaultsMessage(null), 2000);
    } catch (err) {
      setDefaultsMessage({ text: err instanceof Error ? err.message : 'Failed to save', type: 'error' });
    } finally {
      setDefaultsSaving(false);
    }
  }

  async function saveVoiceEnabled(enabled: boolean) {
    setDefaultsSaving(true);
    setDefaultsMessage(null);
    try {
      const res = await fetch('/api/user/tier', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ voiceEnabled: enabled }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to update');
      setTierInfo((prev) => prev ? { ...prev, voiceEnabled: enabled } : null);
      setDefaultsMessage({ text: 'Preference saved', type: 'success' });
      setTimeout(() => setDefaultsMessage(null), 2000);
    } catch (err) {
      setDefaultsMessage({ text: err instanceof Error ? err.message : 'Failed to save', type: 'error' });
    } finally {
      setDefaultsSaving(false);
    }
  }

  const [avatarUploading, setAvatarUploading] = useState(false);
  const [avatarMessage, setAvatarMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  async function handleAvatarUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setAvatarUploading(true);
    setAvatarMessage(null);
    const formData = new FormData();
    formData.append('avatar', file);
    try {
      const res = await fetch('/api/user/avatar', { method: 'POST', body: formData });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Upload failed');
      setTierInfo((prev) => prev ? { ...prev, avatarUrl: data.avatarUrl } : null);
      setAvatarMessage({ text: 'Avatar updated', type: 'success' });
      setTimeout(() => setAvatarMessage(null), 3000);
    } catch (err) {
      setAvatarMessage({ text: err instanceof Error ? err.message : 'Upload failed', type: 'error' });
    } finally {
      setAvatarUploading(false);
      // Reset file input so re-selecting the same file triggers onChange
      e.target.value = '';
    }
  }

  async function previewVoice(model: string) {
    // Unlock browser audio during user gesture (before async fetch)
    warmUpAudio();

    // Stop any currently playing preview
    if (previewAudioRef.current) {
      previewAudioRef.current.pause();
      previewAudioRef.current = null;
    }

    setPreviewingVoice(model);
    try {
      const res = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: "Good morning. I'm your designated pilot examiner. Let's begin with the oral examination.",
          voice: model,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || err.error || `HTTP ${res.status}`);
      }

      const encoding = res.headers.get('X-Audio-Encoding') || 'mp3';
      const arrayBuffer = await res.arrayBuffer();

      if (encoding === 'mp3') {
        const blob = new Blob([arrayBuffer], { type: 'audio/mpeg' });
        const url = URL.createObjectURL(blob);
        const audio = new Audio(url);
        previewAudioRef.current = audio;
        audio.onended = () => { URL.revokeObjectURL(url); setPreviewingVoice(null); };
        audio.onerror = () => { URL.revokeObjectURL(url); setPreviewingVoice(null); };
        await audio.play();
      } else {
        // PCM: decode via AudioContext
        const sampleRate = parseInt(res.headers.get('X-Audio-Sample-Rate') || '48000', 10);
        const audioCtx = new AudioContext({ sampleRate });
        let float32: Float32Array;
        if (encoding === 'linear16') {
          const int16 = new Int16Array(arrayBuffer);
          float32 = new Float32Array(int16.length);
          for (let i = 0; i < int16.length; i++) float32[i] = int16[i] / 32768;
        } else {
          float32 = new Float32Array(arrayBuffer);
        }
        const buffer = audioCtx.createBuffer(1, float32.length, sampleRate);
        buffer.getChannelData(0).set(float32);
        const source = audioCtx.createBufferSource();
        source.buffer = buffer;
        source.connect(audioCtx.destination);
        source.onended = () => { audioCtx.close(); setPreviewingVoice(null); };
        source.start();
      }
    } catch (err) {
      setVoiceMessage({ text: `Preview failed: ${err instanceof Error ? err.message : 'Unknown error'}`, type: 'error' });
      setPreviewingVoice(null);
    }
  }

  // Load available audio input devices
  const loadDevices = useCallback(async () => {
    try {
      // Need to request permission first to get labeled devices
      const tempStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      tempStream.getTracks().forEach((t) => t.stop());

      const devices = await navigator.mediaDevices.enumerateDevices();
      const audioInputs = devices
        .filter((d) => d.kind === 'audioinput')
        .map((d) => ({
          deviceId: d.deviceId,
          label: d.label || `Microphone ${d.deviceId.slice(0, 8)}`,
        }));
      setAudioDevices(audioInputs);
      if (audioInputs.length > 0 && !selectedDeviceId) {
        setSelectedDeviceId(audioInputs[0].deviceId);
      }
    } catch {
      // Permission denied or no devices — will be caught during diagnostics
    }
  }, [selectedDeviceId]);

  useEffect(() => {
    loadDevices();
  }, [loadDevices]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }
      cancelAnimationFrame(animRef.current);
      if (previewAudioRef.current) {
        previewAudioRef.current.pause();
        previewAudioRef.current = null;
      }
    };
  }, []);

  function updateStep(index: number, updates: Partial<DiagStep>) {
    setSteps((prev) =>
      prev.map((s, i) => (i === index ? { ...s, ...updates } : s))
    );
  }

  async function runDiagnostics() {
    // Unlock browser audio during user gesture (before async mic/STT/TTS tests)
    warmUpAudio();

    setDiagRunning(true);
    setRecognizedText('');
    setMicLevel(0);
    setSteps([
      { label: 'Microphone access', status: 'idle', detail: '' },
      { label: 'Speech recognition (Deepgram STT)', status: 'idle', detail: '' },
      { label: 'Speaker / TTS playback', status: 'idle', detail: '' },
    ]);

    const deviceLabel = audioDevices.find((d) => d.deviceId === selectedDeviceId)?.label || 'default';

    // --- Step 1: Microphone access ---
    updateStep(0, { status: 'running', detail: `Requesting "${deviceLabel}"...` });

    const audioConstraints: MediaTrackConstraints | boolean = selectedDeviceId
      ? { deviceId: { exact: selectedDeviceId } }
      : true;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: audioConstraints });
      streamRef.current = stream;

      // Report which device we actually got
      const track = stream.getAudioTracks()[0];
      const actualDevice = track?.label || 'Unknown device';
      updateStep(0, { detail: `Using: ${actualDevice} — speak to see level meter...` });

      const audioCtx = new AudioContext();
      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      const dataArray = new Uint8Array(analyser.frequencyBinCount);

      const startTime = Date.now();
      let peakLevel = 0;

      function updateLevel() {
        analyser.getByteFrequencyData(dataArray);
        const avg = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;
        const normalized = Math.min(100, Math.round((avg / 128) * 100));
        setMicLevel(normalized);
        if (normalized > peakLevel) peakLevel = normalized;

        if (Date.now() - startTime < 3000) {
          animRef.current = requestAnimationFrame(updateLevel);
        } else {
          setMicLevel(0);
          audioCtx.close();
          if (peakLevel > 5) {
            updateStep(0, {
              status: 'pass',
              detail: `${actualDevice} — working (peak level: ${peakLevel}%)`,
            });
          } else {
            updateStep(0, {
              status: 'fail',
              detail: `${actualDevice} — connected but no audio detected. Check that mic is not muted.`,
            });
          }
        }
      }
      updateLevel();

      // Wait for mic test to finish
      await new Promise((r) => setTimeout(r, 3200));
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      updateStep(0, {
        status: 'fail',
        detail: `Microphone access denied or unavailable: ${msg}`,
      });
    }

    // --- Step 2: Speech recognition (Deepgram STT via WebSocket) ---
    updateStep(1, { status: 'running', detail: 'Fetching Deepgram STT token...' });

    try {
      const tokenRes = await fetch('/api/stt/token');
      if (!tokenRes.ok) {
        const errData = await tokenRes.json().catch(() => ({}));
        throw new Error(errData.error || `Token request failed (HTTP ${tokenRes.status})`);
      }
      const tokenData = await tokenRes.json();
      const token = tokenData.token;
      const wsUrl = tokenData.url;

      if (!token || !wsUrl) {
        throw new Error('Token or WebSocket URL missing from response');
      }

      updateStep(1, { detail: 'Connecting to Deepgram STT...' });

      // Test WebSocket connection (just connect and close — validates auth + network)
      const isJwt = token.startsWith('eyJ');
      const connected = await new Promise<boolean>((resolve) => {
        const timeout = setTimeout(() => resolve(false), 8000);
        try {
          const ws = new WebSocket(wsUrl, [isJwt ? 'bearer' : 'token', token]);
          ws.onopen = () => {
            clearTimeout(timeout);
            ws.send(JSON.stringify({ type: 'CloseStream' }));
            setTimeout(() => ws.close(), 500);
            resolve(true);
          };
          ws.onerror = () => { clearTimeout(timeout); resolve(false); };
          ws.onclose = (e) => {
            if (e.code !== 1000 && e.code !== 1005) {
              clearTimeout(timeout);
              resolve(false);
            }
          };
        } catch {
          clearTimeout(timeout);
          resolve(false);
        }
      });

      if (connected) {
        updateStep(1, {
          status: 'pass',
          detail: 'Deepgram STT connected successfully. Speech recognition works in all browsers.',
        });
      } else {
        updateStep(1, {
          status: 'fail',
          detail: 'Deepgram STT WebSocket connection failed. Check network or try again.',
        });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      updateStep(1, {
        status: 'fail',
        detail: `STT token request failed: ${msg}`,
      });
    }

    // Clean up any remaining mic stream
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;

    // --- Step 3: TTS playback ---
    updateStep(2, { status: 'running', detail: 'Requesting TTS audio from server...' });
    try {
      const res = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: 'This is the examiner voice. If you can hear this clearly, your speaker is working.' }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.detail || errData.error || `HTTP ${res.status}`);
      }

      const encoding = res.headers.get('X-Audio-Encoding') || 'mp3';
      const sampleRate = parseInt(res.headers.get('X-Audio-Sample-Rate') || '22050', 10);
      const provider = res.headers.get('X-TTS-Provider') || 'unknown';

      updateStep(2, { detail: `Playing audio (${provider})...` });
      const arrayBuffer = await res.arrayBuffer();

      if (encoding === 'mp3') {
        // MP3: use standard Audio element
        const blob = new Blob([arrayBuffer], { type: 'audio/mpeg' });
        const url = URL.createObjectURL(blob);
        const audio = new Audio(url);

        await new Promise<void>((resolve, reject) => {
          audio.onended = () => { URL.revokeObjectURL(url); resolve(); };
          audio.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Audio playback failed')); };
          audio.play().catch(reject);
        });
      } else {
        // PCM (linear16 or pcm_f32le): decode and play via AudioContext
        const audioCtx = new AudioContext({ sampleRate });
        let float32: Float32Array;

        if (encoding === 'linear16') {
          const int16 = new Int16Array(arrayBuffer);
          float32 = new Float32Array(int16.length);
          for (let i = 0; i < int16.length; i++) {
            float32[i] = int16[i] / 32768;
          }
        } else {
          // pcm_f32le
          float32 = new Float32Array(arrayBuffer);
        }

        const audioBuffer = audioCtx.createBuffer(1, float32.length, sampleRate);
        audioBuffer.getChannelData(0).set(float32);
        const source = audioCtx.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(audioCtx.destination);

        await new Promise<void>((resolve) => {
          source.onended = () => { audioCtx.close(); resolve(); };
          source.start();
        });
      }

      updateStep(2, {
        status: 'pass',
        detail: `Audio played (${provider}, ${encoding}). If you heard the voice, speakers are working.`,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      updateStep(2, {
        status: 'fail',
        detail: `TTS playback failed: ${msg}`,
      });
    }

    setDiagRunning(false);
  }

  const statusIcon = (s: TestStatus) => {
    switch (s) {
      case 'idle':
        return '\u25CB';
      case 'running':
        return '\u25CC';
      case 'pass':
        return '\u2713';
      case 'fail':
        return '\u2717';
    }
  };

  const statusColor = (s: TestStatus) => {
    switch (s) {
      case 'idle':
        return 'text-c-muted';
      case 'running':
        return 'text-c-amber blink';
      case 'pass':
        return 'text-c-green glow-g';
      case 'fail':
        return 'text-c-red';
    }
  };

  const isPaidUser = subInfo?.hasStripeCustomer && (subInfo.status === 'active' || subInfo.status === 'trialing');

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="font-mono font-bold text-2xl text-c-amber glow-a tracking-wider uppercase">SETTINGS</h1>
        <p className="font-mono text-sm text-c-muted mt-1">Manage your account, subscription, and preferences.</p>
      </div>

      {/* 1. Profile */}
      <div data-testid="profile-section" className="bezel rounded-lg border border-c-border p-6">
        <h2 className="font-mono font-semibold text-base text-c-amber mb-1 tracking-wider uppercase">PROFILE</h2>
        <p className="font-mono text-xs text-c-muted mb-5">
          Your name and avatar appear during exam sessions.
        </p>

        {/* Avatar */}
        <div className="flex items-center gap-4 mb-4">
          <div data-testid="profile-avatar-container" className="w-16 h-16 rounded-full overflow-hidden border-2 border-c-border bg-c-bezel flex-shrink-0">
            {tierInfo?.avatarUrl ? (
              <img data-testid="profile-avatar-img" src={tierInfo.avatarUrl} alt="Avatar" className="w-full h-full object-cover" />
            ) : (
              <div data-testid="profile-avatar-initials" className="w-full h-full flex items-center justify-center text-c-muted text-2xl font-mono">
                {tierInfo?.displayName?.[0]?.toUpperCase() || '?'}
              </div>
            )}
          </div>
          <div>
            <input data-testid="avatar-file-input" type="file" id="avatar-upload" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={handleAvatarUpload} />
            <label data-testid="avatar-upload-label" htmlFor="avatar-upload" className={`cursor-pointer inline-block px-3 py-1.5 rounded font-mono text-xs font-medium bg-c-bezel border border-c-border text-c-muted hover:bg-c-border hover:text-c-text transition-colors uppercase ${avatarUploading ? 'opacity-50 pointer-events-none' : ''}`}>
              {avatarUploading ? 'UPLOADING...' : 'UPLOAD PHOTO'}
            </label>
            <p className="font-mono text-xs text-c-dim mt-1">Max 2MB. JPG, PNG, or WebP.</p>
            {avatarMessage && (
              <p className={`font-mono text-xs mt-1 ${avatarMessage.type === 'success' ? 'text-c-green glow-g' : 'text-c-red'}`}>
                {avatarMessage.type === 'success' ? '\u2713 ' : ''}{avatarMessage.text}
              </p>
            )}
          </div>
        </div>

        {/* Default avatar options */}
        <div data-testid="default-avatars-grid" className="mb-4">
          <label className="block font-mono text-xs text-c-muted mb-2 uppercase tracking-wider">OR CHOOSE AN AVATAR</label>
          <div className="flex gap-2">
            {DEFAULT_AVATARS.map((av) => (
              <button
                key={av.id}
                data-testid={`default-avatar-${av.id}`}
                onClick={() => savePracticeDefault('avatarUrl', av.url)}
                className={`w-10 h-10 rounded-full overflow-hidden border-2 transition-colors ${
                  tierInfo?.avatarUrl === av.url ? 'border-c-amber' : 'border-c-border hover:border-c-border-hi'
                }`}
              >
                <img src={av.url} alt={av.label} className="w-full h-full object-cover" />
              </button>
            ))}
          </div>
        </div>

        {/* Display name */}
        <div>
          <label className="block font-mono text-xs text-c-muted mb-1.5 uppercase tracking-wider">DISPLAY NAME</label>
          <input
            data-testid="display-name-input"
            type="text"
            defaultValue={tierInfo?.displayName || ''}
            onBlur={(e) => {
              const val = e.target.value.trim();
              savePracticeDefault('displayName', val);
            }}
            placeholder="How should the examiner address you?"
            maxLength={50}
            className="w-full px-3 py-2 bg-c-panel border border-c-border rounded-lg text-c-text font-mono text-sm focus:outline-none focus:ring-1 focus:ring-c-amber focus:border-c-amber placeholder-c-dim transition-colors"
          />
        </div>
      </div>

      {/* 2. Account Info */}
      <div className="bezel rounded-lg border border-c-border p-6">
        <h2 className="font-mono font-semibold text-base text-c-amber mb-4 tracking-wider uppercase">ACCOUNT</h2>
        <div className="text-sm mb-5 font-mono">
          <span className="text-c-muted">EMAIL: </span>
          <span className="text-c-text">{email ?? 'LOADING...'}</span>
        </div>

        {/* Practice Defaults (folded into Account) */}
        <div className="border-t border-c-border pt-4">
          <h3 className="font-mono text-xs text-c-muted mb-3 tracking-wider uppercase">PRACTICE DEFAULTS</h3>
          {tierLoading ? (
            <div className="font-mono text-sm text-c-dim">LOADING PREFERENCES...</div>
          ) : (
            <div className="space-y-4">
              <div>
                <label className="block font-mono text-xs text-c-muted mb-1.5 uppercase">CERTIFICATE / RATING</label>
                <div className="flex gap-2">
                  {([
                    { value: 'private', label: 'PRIVATE PILOT' },
                    { value: 'commercial', label: 'COMMERCIAL' },
                    { value: 'instrument', label: 'INSTRUMENT' },
                  ] as const).map((r) => (
                    <button
                      key={r.value}
                      onClick={() => savePracticeDefault('preferredRating', r.value)}
                      disabled={defaultsSaving || tierInfo?.preferredRating === r.value}
                      className={`px-3 py-1.5 rounded-lg border font-mono text-xs transition-colors ${
                        tierInfo?.preferredRating === r.value
                          ? 'border-c-amber/50 bg-c-amber-lo/50 text-c-amber font-semibold'
                          : 'border-c-border bg-c-bezel text-c-muted hover:border-c-border-hi'
                      } disabled:opacity-70`}
                    >
                      {r.label}
                    </button>
                  ))}
                </div>
              </div>
              {tierInfo?.preferredRating !== 'instrument' ? (
                <div>
                  <label className="block font-mono text-xs text-c-muted mb-1.5 uppercase">AIRCRAFT CLASS</label>
                  <div className="flex gap-2">
                    {([
                      { value: 'ASEL', label: 'ASEL' },
                      { value: 'AMEL', label: 'AMEL' },
                      { value: 'ASES', label: 'ASES' },
                      { value: 'AMES', label: 'AMES' },
                    ] as const).map((cls) => (
                      <button
                        key={cls.value}
                        onClick={() => savePracticeDefault('preferredAircraftClass', cls.value)}
                        disabled={defaultsSaving || tierInfo?.preferredAircraftClass === cls.value}
                        className={`px-3 py-1.5 rounded-lg border font-mono text-xs transition-colors ${
                          tierInfo?.preferredAircraftClass === cls.value
                            ? 'border-c-cyan/50 bg-c-cyan-lo/50 text-c-cyan font-semibold'
                            : 'border-c-border bg-c-bezel text-c-muted hover:border-c-border-hi'
                        } disabled:opacity-70`}
                      >
                        {cls.label}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <p className="font-mono text-xs text-c-dim uppercase">INSTRUMENT RATING — AIRPLANE</p>
              )}
              <div>
                <label className="block font-mono text-xs text-c-muted mb-1.5 uppercase">AIRCRAFT TYPE</label>
                <input
                  type="text"
                  value={tierInfo?.aircraftType || ''}
                  onChange={(e) => setTierInfo(prev => prev ? { ...prev, aircraftType: e.target.value } : null)}
                  onBlur={(e) => {
                    const val = e.target.value.trim();
                    if (val !== (tierInfo?.aircraftType || '')) {
                      savePracticeDefault('aircraftType', val);
                    }
                  }}
                  placeholder="e.g., Cessna 172"
                  maxLength={100}
                  className="w-full px-3 py-2 bg-c-panel border border-c-border rounded-lg text-c-text font-mono text-sm focus:outline-none focus:ring-1 focus:ring-c-amber focus:border-c-amber placeholder-c-dim transition-colors"
                />
              </div>
              <div>
                <label className="block font-mono text-xs text-c-muted mb-1.5 uppercase">HOME AIRPORT</label>
                <input
                  type="text"
                  value={tierInfo?.homeAirport || ''}
                  onChange={(e) => setTierInfo(prev => prev ? { ...prev, homeAirport: e.target.value.toUpperCase() } : null)}
                  onBlur={(e) => {
                    const val = e.target.value.trim().toUpperCase();
                    if (val !== (tierInfo?.homeAirport || '')) {
                      savePracticeDefault('homeAirport', val);
                    }
                  }}
                  placeholder="e.g., KJAX"
                  maxLength={10}
                  className="w-full px-3 py-2 bg-c-panel border border-c-border rounded-lg text-c-text font-mono text-sm focus:outline-none focus:ring-1 focus:ring-c-amber focus:border-c-amber placeholder-c-dim uppercase transition-colors"
                />
              </div>
              <div>
                <label className="block font-mono text-xs text-c-muted mb-1.5 uppercase">VOICE MODE</label>
                <label className="flex items-center gap-3 cursor-pointer px-3 py-2.5 rounded-lg border border-c-border hover:border-c-border-hi bg-c-panel transition-colors">
                  <input
                    type="checkbox"
                    checked={tierInfo?.voiceEnabled ?? true}
                    onChange={(e) => saveVoiceEnabled(e.target.checked)}
                    disabled={defaultsSaving}
                    className="w-4 h-4 rounded border-c-border bg-c-bezel text-c-green focus:ring-c-green"
                  />
                  <span className="font-mono text-sm text-c-text uppercase">ENABLE VOICE MODE</span>
                  <span className="text-xs text-c-dim font-mono">(MIC + SPEAKER)</span>
                </label>
                <p className="font-mono text-xs text-c-dim mt-1.5">
                  Applied automatically when starting new exams.
                </p>
              </div>
              {defaultsMessage && (
                <p data-testid="profile-save-message" className={`font-mono text-xs ${defaultsMessage.type === 'success' ? 'text-c-green glow-g' : 'text-c-red'}`}>
                  {defaultsMessage.type === 'success' ? '\u2713 ' : ''}{defaultsMessage.text}
                </p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* 2. Plan & Usage */}
      <div className="bezel rounded-lg border border-c-border p-6">
        <h2 className="font-mono font-semibold text-base text-c-amber mb-1 tracking-wider uppercase">PLAN &amp; USAGE</h2>
        <p className="font-mono text-xs text-c-muted mb-5">
          Your current subscription and usage this billing period.
        </p>

        {subLoading || tierLoading ? (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="iframe rounded-lg p-4 h-20" />
              <div className="iframe rounded-lg p-4 h-20" />
            </div>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3 mb-5">
              <div className="iframe rounded-lg p-4">
                <div className="font-mono text-xs text-c-muted mb-1 uppercase">CURRENT PLAN</div>
                <div className="font-mono text-c-green font-semibold text-base glow-g uppercase">
                  {isPaidUser ? (subInfo?.plan || 'PAID') : 'FREE'}
                </div>
                {subInfo?.status === 'trialing' && (
                  <div className="font-mono text-xs text-c-amber mt-1 uppercase">TRIAL ACTIVE</div>
                )}
              </div>
              <div className="iframe rounded-lg p-4">
                <div className="font-mono text-xs text-c-muted mb-1 uppercase">
                  {isPaidUser ? 'RENEWAL DATE' : 'STATUS'}
                </div>
                <div className="font-mono text-c-text font-semibold text-base uppercase">
                  {subInfo?.renewalDate
                    ? new Date(subInfo.renewalDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                    : isPaidUser ? 'N/A' : 'FREE TIER'}
                </div>
              </div>
            </div>

            {tierInfo && (
              <div className="grid grid-cols-2 gap-3 mb-5">
                <div className="iframe rounded-lg p-4">
                  <div className="font-mono text-xs text-c-muted mb-1 uppercase">SESSIONS THIS MONTH</div>
                  <div className="font-mono text-c-text font-semibold text-base">
                    {tierInfo.usage.sessionsThisMonth}
                    <span className="text-c-muted font-normal">
                      {' / '}
                      {tierInfo.features.maxSessionsPerMonth === Infinity ? 'UNLIMITED' : tierInfo.features.maxSessionsPerMonth}
                    </span>
                  </div>
                  {tierInfo.features.maxSessionsPerMonth !== Infinity && (
                    <div className="mt-2 h-1.5 w-full bg-c-border rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full prog-a"
                        style={{ width: `${Math.min(100, (tierInfo.usage.sessionsThisMonth / tierInfo.features.maxSessionsPerMonth) * 100)}%` }}
                      />
                    </div>
                  )}
                </div>
                <div className="iframe rounded-lg p-4">
                  <div className="font-mono text-xs text-c-muted mb-1 uppercase">TTS CHARACTERS</div>
                  <div className="font-mono text-c-text font-semibold text-base">
                    {Math.round(tierInfo.usage.ttsCharsThisMonth / 1000)}k
                    <span className="text-c-muted font-normal">
                      {' / '}
                      {tierInfo.features.maxTtsCharsPerMonth === Infinity ? 'UNLIMITED' : `${Math.round(tierInfo.features.maxTtsCharsPerMonth / 1000)}k`}
                    </span>
                  </div>
                  {tierInfo.features.maxTtsCharsPerMonth !== Infinity && (
                    <div className="mt-2 h-1.5 w-full bg-c-border rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full prog-c"
                        style={{ width: `${Math.min(100, (tierInfo.usage.ttsCharsThisMonth / tierInfo.features.maxTtsCharsPerMonth) * 100)}%` }}
                      />
                    </div>
                  )}
                </div>
              </div>
            )}

            {portalError && (
              <p className="font-mono text-sm text-c-red mb-3">{portalError}</p>
            )}

            <div className="flex items-center gap-3">
              {isPaidUser ? (
                <>
                  <button
                    onClick={openCustomerPortal}
                    disabled={portalLoading}
                    className="px-4 py-2 bg-c-bezel hover:bg-c-border border border-c-border text-c-text font-mono text-sm font-semibold rounded-lg transition-colors disabled:opacity-50 uppercase tracking-wide"
                  >
                    {portalLoading ? 'OPENING...' : 'MANAGE SUBSCRIPTION'}
                  </button>
                  <button
                    onClick={openCustomerPortal}
                    disabled={portalLoading}
                    className="px-4 py-2 font-mono text-sm text-c-muted hover:text-c-text transition-colors uppercase tracking-wide"
                  >
                    PAUSE SUBSCRIPTION
                  </button>
                </>
              ) : (
                <a
                  href="/pricing"
                  className="px-4 py-2 bg-c-amber hover:bg-c-amber/90 text-c-bg font-mono text-sm font-semibold rounded-lg transition-colors inline-block uppercase tracking-wide"
                >
                  UPGRADE PLAN
                </a>
              )}
            </div>
          </>
        )}
      </div>

      {/* 3. Theme */}
      <div className="bezel rounded-lg border border-c-border p-6">
        <h2 className="font-mono font-semibold text-base text-c-amber mb-1 tracking-wider uppercase">THEME</h2>
        <p className="font-mono text-xs text-c-muted mb-5">
          Choose the cockpit aesthetic for your entire interface.
        </p>

        <div className="grid gap-3 sm:grid-cols-2">
          {THEMES.map((t) => {
            const isActive = (tierInfo?.preferredTheme || 'cockpit') === t.id;
            return (
              <button
                key={t.id}
                onClick={() => {
                  setTheme(t.id);
                  savePracticeDefault('preferredTheme', t.id);
                  setTierInfo(prev => prev ? { ...prev, preferredTheme: t.id } : null);
                }}
                disabled={isActive}
                className={`iframe rounded-lg p-4 text-left transition-colors ${
                  isActive
                    ? 'border-l-2 border-c-amber ring-1 ring-c-amber/20'
                    : 'hover:border-c-border-hi cursor-pointer'
                }`}
              >
                <div className="flex items-center gap-2 mb-1">
                  <div className="w-4 h-4 rounded-full flex-shrink-0" style={{ background: t.accent }} />
                  <span className={`font-mono text-sm font-semibold uppercase ${isActive ? 'text-c-amber' : 'text-c-text'}`}>
                    {t.label}
                  </span>
                  {isActive && (
                    <span className="font-mono text-xs bg-c-amber-lo text-c-amber px-2 py-0.5 rounded border border-c-amber/20 uppercase ml-auto">
                      ACTIVE
                    </span>
                  )}
                </div>
                <p className="font-mono text-xs text-c-dim">{t.desc}</p>
              </button>
            );
          })}
        </div>
      </div>

      {/* 4. Your Examiner (unified profile selector) */}
      <div className="bezel rounded-lg border border-c-border p-6">
        <h2 className="font-mono font-semibold text-base text-c-amber mb-1 tracking-wider uppercase">YOUR EXAMINER</h2>
        <p className="font-mono text-xs text-c-muted mb-5">
          Choose your DPE examiner. This sets personality, voice, and identity for all sessions.
        </p>

        {tierLoading ? (
          <div className="font-mono text-sm text-c-dim uppercase">LOADING EXAMINERS...</div>
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-2">
              {ALL_PROFILE_KEYS.map((profileKey) => {
                const profile = EXAMINER_PROFILES[profileKey];
                const isActive = tierInfo?.examinerProfile === profileKey
                  || (!tierInfo?.examinerProfile && profileKey === 'maria_methodical');
                const voiceOption = tierInfo?.voiceOptions?.find((v: VoiceOption) => v.persona_id === profile.voiceId);
                const isPreviewing = previewingVoice === (voiceOption?.model || profile.voiceId);
                return (
                  <div
                    key={profileKey}
                    data-testid={`examiner-card-${profileKey}`}
                    className={`iframe rounded-lg p-4 transition-colors ${
                      isActive
                        ? 'border-l-2 border-c-amber ring-1 ring-c-amber/20'
                        : 'hover:border-c-border-hi'
                    }`}
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex items-start gap-3">
                        {voiceOption?.image && (
                          <div className={`w-12 h-12 rounded-full overflow-hidden border-2 flex-shrink-0 bg-c-bezel ${isActive ? 'border-c-amber' : 'border-c-border'}`}>
                            <img src={voiceOption.image} alt={profile.defaultDisplayName} className="w-full h-full object-cover" />
                          </div>
                        )}
                        <div>
                          <span className={`font-mono text-sm font-semibold uppercase ${isActive ? 'text-c-amber' : 'font-medium text-c-text'}`}>
                            {profile.defaultDisplayName}
                          </span>
                          <p className="font-mono text-xs text-c-dim mt-0.5">{profile.description}</p>
                        </div>
                      </div>
                      {isActive && (
                        <span className="font-mono text-xs bg-c-amber/15 text-c-amber px-2 py-0.5 rounded border border-c-amber/25 uppercase flex-shrink-0">
                          ACTIVE
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-3">
                      <button
                        onClick={() => {
                          const modelId = voiceOption?.model || profile.voiceId;
                          isPreviewing
                            ? (() => { previewAudioRef.current?.pause(); previewAudioRef.current = null; setPreviewingVoice(null); })()
                            : previewVoice(modelId);
                        }}
                        disabled={previewingVoice !== null && !isPreviewing}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded font-mono text-xs font-medium transition-colors ${
                          isPreviewing
                            ? 'bg-c-amber text-c-bg'
                            : 'bg-c-bezel border border-c-border text-c-muted hover:bg-c-border hover:text-c-text'
                        } disabled:opacity-40 uppercase`}
                      >
                        {isPreviewing ? '\u25A0' : '\u25B6'} {isPreviewing ? 'STOP' : 'PREVIEW'}
                      </button>
                      {!isActive && (
                        <button
                          onClick={() => switchExaminerProfile(profileKey)}
                          disabled={voiceSaving}
                          className="px-3 py-1.5 rounded font-mono text-xs font-medium bg-c-amber/15 text-c-amber hover:bg-c-amber hover:text-c-bg transition-colors border border-c-amber/30 disabled:opacity-40 uppercase"
                        >
                          SELECT
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {voiceMessage && (
              <p className={`font-mono text-xs mt-3 ${voiceMessage.type === 'success' ? 'text-c-green glow-g' : 'text-c-red'}`}>
                {voiceMessage.text}
              </p>
            )}
          </>
        )}
      </div>

      {/* 5. Voice Diagnostics (collapsible) */}
      <div className="bezel rounded-lg border border-c-border">
        <button
          onClick={() => setDiagOpen(!diagOpen)}
          className="w-full flex items-center justify-between p-6 text-left"
        >
          <div>
            <h2 className="font-mono font-semibold text-base text-c-amber tracking-wider uppercase">VOICE DIAGNOSTICS</h2>
            <p className="font-mono text-xs text-c-muted mt-0.5">
              Test your microphone, speech recognition, and speaker.
            </p>
          </div>
          <span className={`font-mono text-c-muted text-base transition-transform ${diagOpen ? 'rotate-180' : ''}`}>
            &#9660;
          </span>
        </button>

        {diagOpen && (
          <div className="px-6 pb-6 border-t border-c-border pt-4">
            {/* Microphone selector */}
            {audioDevices.length > 0 && (
              <div className="mb-5">
                <label className="block font-mono text-xs text-c-muted mb-1.5 uppercase">MICROPHONE</label>
                <select
                  value={selectedDeviceId}
                  onChange={(e) => setSelectedDeviceId(e.target.value)}
                  disabled={diagRunning}
                  className="w-full px-3 py-2 bg-c-panel border border-c-border rounded-lg text-c-text font-mono text-sm focus:outline-none focus:ring-1 focus:ring-c-amber disabled:opacity-50"
                >
                  {audioDevices.map((d) => (
                    <option key={d.deviceId} value={d.deviceId}>
                      {d.label}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="space-y-3 mb-5">
              {steps.map((step, i) => (
                <div key={i} className="flex items-start gap-3 px-3 py-2.5 iframe rounded-lg">
                  <span className={`font-mono text-base mt-0.5 ${statusColor(step.status)}`}>
                    {statusIcon(step.status)}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="font-mono text-sm text-c-text uppercase">{step.label}</p>
                    {step.detail && (
                      <p className={`font-mono text-xs mt-0.5 ${step.status === 'fail' ? 'text-c-red' : step.status === 'pass' ? 'text-c-green' : 'text-c-muted'}`}>
                        {step.detail}
                      </p>
                    )}
                    {/* Mic level meter */}
                    {i === 0 && step.status === 'running' && micLevel > 0 && (
                      <div className="mt-2 h-1.5 w-full bg-c-border rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full prog-g transition-all duration-75"
                          style={{ width: `${micLevel}%` }}
                        />
                      </div>
                    )}
                    {/* Recognized text display */}
                    {i === 1 && step.status === 'running' && recognizedText && (
                      <p className="font-mono text-xs mt-1 text-c-cyan italic">
                        &ldquo;{recognizedText}&rdquo;
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>

            <button
              onClick={runDiagnostics}
              disabled={diagRunning}
              className="px-5 py-2.5 bg-c-amber hover:bg-c-amber/90 disabled:opacity-50 text-c-bg font-mono text-sm font-semibold rounded-lg transition-colors uppercase tracking-wide"
            >
              {diagRunning ? 'RUNNING...' : 'RUN VOICE TEST'}
            </button>

            <p className="text-xs text-c-dim font-mono mt-3 leading-relaxed">
              Note: Speech recognition uses Chrome&apos;s built-in mic setting, which may differ from the selection above.
              Check chrome://settings/content/microphone if recognition fails.
            </p>
          </div>
        )}
      </div>

      {/* 6. Active Sessions */}
      <div className="bezel rounded-lg border border-c-border p-6">
        <h2 className="font-mono font-semibold text-base text-c-amber mb-1 tracking-wider uppercase">ACTIVE SESSIONS</h2>
        <p className="font-mono text-xs text-c-muted mb-5">
          Devices where you are currently signed in.
        </p>

        {sessionsLoading ? (
          <div className="space-y-3">
            <div className="iframe rounded-lg p-3 h-16" />
          </div>
        ) : activeSessions.length === 0 ? (
          <div className="font-mono text-sm text-c-dim uppercase">NO ACTIVE SESSIONS FOUND.</div>
        ) : (
          <div className="space-y-3">
            {activeSessions.map((session) => (
              <div
                key={session.id}
                className={`flex items-center justify-between p-3 iframe rounded-lg ${
                  session.this_device
                    ? 'border-l-2 border-c-cyan'
                    : ''
                }`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span className="text-c-muted text-xl">&#9109;</span>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-sm text-c-text">{session.device_label}</span>
                      {session.this_device && (
                        <span className="font-mono text-xs bg-c-cyan-lo text-c-cyan px-1.5 py-0.5 rounded border border-c-cyan/20 uppercase">
                          THIS DEVICE
                        </span>
                      )}
                      {session.is_exam_active && (
                        <span className="font-mono text-xs bg-c-green-lo text-c-green px-1.5 py-0.5 rounded border border-c-green/20 uppercase">
                          EXAM ACTIVE
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      {session.approximate_location && (
                        <span className="font-mono text-xs text-c-dim">{session.approximate_location}</span>
                      )}
                      {session.approximate_location && (
                        <span className="font-mono text-xs text-c-dim">&middot;</span>
                      )}
                      <span className="font-mono text-xs text-c-dim">
                        Last active: {new Date(session.last_activity_at).toLocaleString('en-US', {
                          month: 'short',
                          day: 'numeric',
                          hour: 'numeric',
                          minute: '2-digit',
                        })}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {sessionsMessage && (
          <p className={`font-mono text-xs mt-3 ${sessionsMessage.type === 'success' ? 'text-c-green glow-g' : 'text-c-red'}`}>
            {sessionsMessage.text}
          </p>
        )}

        {activeSessions.filter(s => !s.this_device).length > 0 && (
          <button
            onClick={async () => {
              setSignOutOthersLoading(true);
              setSessionsMessage(null);
              try {
                const res = await fetch('/api/user/sessions', { method: 'DELETE' });
                const data = await res.json();
                if (!res.ok) throw new Error(data.error || 'Failed to sign out other sessions');
                setSessionsMessage({ text: 'All other sessions have been signed out.', type: 'success' });
                fetchActiveSessions();
              } catch (err) {
                setSessionsMessage({ text: err instanceof Error ? err.message : 'Failed to sign out other sessions', type: 'error' });
              } finally {
                setSignOutOthersLoading(false);
              }
            }}
            disabled={signOutOthersLoading}
            className="mt-4 px-4 py-2 bg-c-red/80 hover:bg-c-red disabled:opacity-50 text-c-text font-mono text-sm font-semibold rounded-lg transition-colors uppercase tracking-wide"
          >
            {signOutOthersLoading ? 'SIGNING OUT...' : 'SIGN OUT ALL OTHER SESSIONS'}
          </button>
        )}
      </div>

      {/* 6.5 Email Notifications */}
      <div className="bezel rounded-lg border border-c-border p-6">
        <h2 className="font-mono font-semibold text-base text-c-amber mb-1 tracking-wider uppercase">EMAIL NOTIFICATIONS</h2>
        <p className="font-mono text-xs text-c-muted mb-5">
          Control which emails you receive from HeyDPE.
        </p>

        {emailPrefsLoading ? (
          <div className="space-y-3">
            <div className="iframe rounded-lg p-3 h-14" />
            <div className="iframe rounded-lg p-3 h-14" />
            <div className="iframe rounded-lg p-3 h-14" />
          </div>
        ) : (
          <div className="space-y-3">
            {/* Required categories */}
            {([
              { key: 'account_security', label: 'Account & Security', desc: 'Password resets, email verification, login alerts' },
              { key: 'billing_transactional', label: 'Billing & Payments', desc: 'Subscription confirmations, payment receipts, trial reminders' },
              { key: 'support_transactional', label: 'Support Tickets', desc: 'Ticket confirmations and replies' },
            ] as const).map((cat) => (
              <div key={cat.key} className="flex items-center justify-between p-3 iframe rounded-lg opacity-60">
                <div className="flex items-center gap-3 min-w-0">
                  <span className="text-c-muted text-sm">&#128274;</span>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-sm text-c-text">{cat.label}</span>
                      <span className="font-mono text-xs bg-c-bezel text-c-dim px-1.5 py-0.5 rounded border border-c-border uppercase">
                        REQUIRED
                      </span>
                    </div>
                    <p className="font-mono text-xs text-c-dim mt-0.5">{cat.desc}</p>
                  </div>
                </div>
                <label className="flex-shrink-0 cursor-not-allowed">
                  <input
                    type="checkbox"
                    checked={true}
                    disabled={true}
                    className="w-4 h-4 rounded border-c-border bg-c-bezel text-c-green focus:ring-c-green opacity-50"
                  />
                </label>
              </div>
            ))}

            {/* Optional categories */}
            {([
              { key: 'learning_digest', label: 'Daily Learning Digest', desc: 'Morning summary of weak areas and study recommendations' },
              { key: 'motivation_nudges', label: 'Practice Reminders', desc: 'Friendly reminders when you haven\'t practiced recently' },
              { key: 'product_updates', label: 'Product Updates', desc: 'New features, improvements, and tips' },
              { key: 'marketing', label: 'Marketing & Promotions', desc: 'Special offers and promotions' },
            ] as const).map((cat) => (
              <div key={cat.key} className="flex items-center justify-between p-3 iframe rounded-lg">
                <div className="flex items-center gap-3 min-w-0">
                  <span className="text-c-muted text-sm">&#9993;</span>
                  <div className="min-w-0">
                    <span className="font-mono text-sm text-c-text">{cat.label}</span>
                    <p className="font-mono text-xs text-c-dim mt-0.5">{cat.desc}</p>
                  </div>
                </div>
                <label className="flex-shrink-0 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={emailPrefs?.[cat.key] ?? false}
                    disabled={emailPrefsSaving === cat.key}
                    onChange={(e) => toggleEmailPref(cat.key, e.target.checked)}
                    className="w-4 h-4 rounded border-c-border bg-c-bezel text-c-green focus:ring-c-green disabled:opacity-50"
                  />
                </label>
              </div>
            ))}
          </div>
        )}

        {emailPrefsMessage && (
          <p className={`font-mono text-xs mt-3 ${emailPrefsMessage.type === 'success' ? 'text-c-green glow-g' : 'text-c-red'}`}>
            {emailPrefsMessage.type === 'success' ? '\u2713 ' : ''}{emailPrefsMessage.text}
          </p>
        )}
      </div>

      {/* 7. Feedback */}
      <div className="bezel rounded-lg border border-c-border p-6">
        <h2 className="font-mono font-semibold text-base text-c-amber mb-1 tracking-wider uppercase">FEEDBACK</h2>
        <p className="font-mono text-xs text-c-muted mb-5">
          Help us improve HeyDPE by reporting bugs or content errors.
        </p>

        {feedbackType === null ? (
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => { setFeedbackType('bug_report'); setFeedbackMessage(null); }}
              className="px-4 py-3 bg-c-panel hover:bg-c-elevated border border-c-border hover:border-c-amber/30 rounded-lg text-left transition-colors"
            >
              <div className="flex items-center gap-2 mb-1">
                <span className="text-c-amber text-base">&#9888;</span>
                <span className="font-mono text-sm font-semibold text-c-text uppercase">REPORT A BUG</span>
              </div>
              <p className="font-mono text-xs text-c-muted">Something isn&apos;t working correctly</p>
            </button>
            <button
              onClick={() => { setFeedbackType('content_error'); setFeedbackMessage(null); }}
              className="px-4 py-3 bg-c-panel hover:bg-c-elevated border border-c-border hover:border-c-cyan/30 rounded-lg text-left transition-colors"
            >
              <div className="flex items-center gap-2 mb-1">
                <span className="text-c-cyan text-base">&#9776;</span>
                <span className="font-mono text-sm font-semibold text-c-text uppercase">CONTENT ERROR</span>
              </div>
              <p className="font-mono text-xs text-c-muted">Incorrect aviation information</p>
            </button>
          </div>
        ) : (
          <div>
            <div className="flex items-center justify-between mb-4">
              <span className={`font-mono text-xs px-2 py-0.5 rounded border uppercase ${
                feedbackType === 'bug_report'
                  ? 'bg-c-amber-lo text-c-amber border-c-amber/20'
                  : 'bg-c-cyan-lo text-c-cyan border-c-cyan/20'
              }`}>
                {feedbackType === 'bug_report' ? 'BUG REPORT' : 'CONTENT ERROR'}
              </span>
              <button
                onClick={() => {
                  setFeedbackType(null);
                  setFeedbackDescription('');
                  setFeedbackMessage(null);
                }}
                disabled={feedbackSubmitting}
                className="font-mono text-xs text-c-dim hover:text-c-text transition-colors uppercase"
              >
                CHANGE TYPE
              </button>
            </div>

            <textarea
              value={feedbackDescription}
              onChange={(e) => setFeedbackDescription(e.target.value)}
              placeholder={feedbackType === 'bug_report'
                ? 'Describe the bug... What happened? What did you expect?'
                : 'Describe the content error... What information was incorrect?'}
              rows={4}
              className="fb-textarea w-full px-3 py-2.5 bg-c-panel border border-c-border rounded-lg text-c-text font-mono text-sm focus:outline-none focus:border-c-amber placeholder-c-dim resize-none mb-4 transition-colors"
            />

            {feedbackMessage && (
              <p className={`font-mono text-xs mb-3 ${feedbackMessage.type === 'success' ? 'text-c-green glow-g' : 'text-c-red'}`}>
                {feedbackMessage.text}
              </p>
            )}

            <div className="flex gap-3 justify-end">
              <button
                onClick={() => {
                  setFeedbackType(null);
                  setFeedbackDescription('');
                  setFeedbackMessage(null);
                }}
                disabled={feedbackSubmitting}
                className="px-4 py-2 text-c-muted hover:text-c-text font-mono text-sm transition-colors uppercase"
              >
                CANCEL
              </button>
              <button
                onClick={async () => {
                  setFeedbackSubmitting(true);
                  setFeedbackMessage(null);
                  try {
                    const details: Record<string, unknown> = {
                      description: feedbackDescription,
                    };
                    if (feedbackType === 'bug_report' && typeof navigator !== 'undefined') {
                      details.browser_info = navigator.userAgent;
                      details.page_url = window.location.href;
                    }
                    const res = await fetch('/api/report', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        report_type: feedbackType,
                        details,
                      }),
                    });
                    if (res.ok) {
                      setFeedbackMessage({ text: 'Thank you! Your feedback has been submitted.', type: 'success' });
                      setFeedbackDescription('');
                      setTimeout(() => {
                        setFeedbackType(null);
                        setFeedbackMessage(null);
                      }, 3000);
                    } else {
                      const data = await res.json().catch(() => ({}));
                      setFeedbackMessage({ text: data.error || 'Failed to submit feedback', type: 'error' });
                    }
                  } catch {
                    setFeedbackMessage({ text: 'Failed to submit feedback', type: 'error' });
                  } finally {
                    setFeedbackSubmitting(false);
                  }
                }}
                disabled={feedbackSubmitting || !feedbackDescription.trim()}
                className="px-5 py-2 bg-c-amber hover:bg-c-amber/90 disabled:opacity-50 text-c-bg font-mono text-sm font-semibold rounded-lg transition-colors uppercase tracking-wide"
              >
                {feedbackSubmitting ? 'SUBMITTING...' : 'SUBMIT'}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* 7.5. Your Instructor (student connection — behind feature flag) */}
      {instructorFeatureEnabled && (
        <div className="bezel rounded-lg border border-c-border p-6">
          <h2 className="font-mono font-semibold text-base text-c-amber mb-1 tracking-wider uppercase">YOUR INSTRUCTOR</h2>
          <p className="font-mono text-xs text-c-muted mb-5">
            Connect with your flight instructor to share your practice progress.
          </p>

          {studentConnLoading ? (
            <div className="font-mono text-sm text-c-dim uppercase">LOADING...</div>
          ) : studentConnection?.state === 'connected' ? (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <span className="w-2.5 h-2.5 rounded-full bg-c-green inline-block glow-g" />
                <span className="font-mono text-sm text-c-green font-semibold uppercase">CONNECTED</span>
              </div>
              <div className="iframe rounded-lg p-3 mb-3">
                <div className="font-mono text-xs text-c-muted mb-1 uppercase">INSTRUCTOR</div>
                <div className="font-mono text-sm text-c-text">
                  {studentConnection.instructorName || 'Instructor'}
                  {studentConnection.instructorCertType && (
                    <span className="ml-2 font-mono text-[10px] px-2 py-0.5 rounded border border-c-amber/30 bg-c-amber-lo text-c-amber uppercase">
                      {studentConnection.instructorCertType}
                    </span>
                  )}
                </div>
              </div>
              <button
                onClick={() => cancelOrDisconnect(studentConnection.id, 'disconnect')}
                disabled={connectionActionLoading}
                className="px-3 py-1.5 rounded border border-c-red/20 bg-c-red-dim text-c-red hover:bg-c-red/20 font-mono text-[10px] uppercase transition-colors disabled:opacity-50"
              >
                {connectionActionLoading ? '...' : 'DISCONNECT'}
              </button>
              {connectionMessage && (
                <p className={`font-mono text-xs mt-3 ${connectionMessage.type === 'success' ? 'text-c-green glow-g' : 'text-c-red'}`}>
                  {connectionMessage.text}
                </p>
              )}
            </div>
          ) : studentConnection?.state === 'pending' ? (
            <div>
              <p className="font-mono text-sm text-c-muted mb-3">
                Connection request sent to <span className="text-c-text">{studentConnection.instructorName || 'instructor'}</span>. Awaiting approval.
              </p>
              <button
                onClick={() => cancelOrDisconnect(studentConnection.id, 'cancel_request')}
                disabled={connectionActionLoading}
                className="px-3 py-1.5 rounded border border-c-border bg-c-bezel text-c-muted hover:text-c-text font-mono text-[10px] uppercase transition-colors disabled:opacity-50"
              >
                {connectionActionLoading ? '...' : 'CANCEL REQUEST'}
              </button>
              {connectionMessage && (
                <p className={`font-mono text-xs mt-3 ${connectionMessage.type === 'success' ? 'text-c-green glow-g' : 'text-c-red'}`}>
                  {connectionMessage.text}
                </p>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex gap-3">
                <div className="flex-1">
                  <label className="block font-mono text-xs text-c-muted mb-1.5 uppercase tracking-wider">INSTRUCTOR LAST NAME</label>
                  <input
                    type="text"
                    value={instructorSearchLastName}
                    onChange={(e) => setInstructorSearchLastName(e.target.value)}
                    placeholder="e.g. Smith"
                    maxLength={100}
                    className="w-full px-3 py-2 bg-c-panel border border-c-border rounded-lg text-c-text font-mono text-sm focus:outline-none focus:ring-1 focus:ring-c-amber focus:border-c-amber placeholder-c-dim transition-colors"
                  />
                </div>
                <div className="flex-1">
                  <label className="block font-mono text-xs text-c-muted mb-1.5 uppercase tracking-wider">CERTIFICATE NUMBER</label>
                  <input
                    type="text"
                    value={instructorSearchCertNum}
                    onChange={(e) => setInstructorSearchCertNum(e.target.value)}
                    placeholder="Optional"
                    maxLength={50}
                    className="w-full px-3 py-2 bg-c-panel border border-c-border rounded-lg text-c-text font-mono text-sm focus:outline-none focus:ring-1 focus:ring-c-amber focus:border-c-amber placeholder-c-dim transition-colors"
                  />
                </div>
              </div>
              <button
                onClick={searchForInstructor}
                disabled={instructorSearching || !instructorSearchLastName.trim()}
                className="px-4 py-2 bg-c-amber hover:bg-c-amber/90 disabled:opacity-50 text-c-bg font-mono text-sm font-semibold rounded-lg transition-colors uppercase tracking-wide"
              >
                {instructorSearching ? 'SEARCHING...' : 'FIND INSTRUCTOR'}
              </button>

              {connectionMessage && (
                <p className={`font-mono text-xs ${connectionMessage.type === 'success' ? 'text-c-green glow-g' : 'text-c-red'}`}>
                  {connectionMessage.text}
                </p>
              )}

              {instructorSearchResults.length > 0 && (
                <div className="space-y-2">
                  <p className="font-mono text-[10px] text-c-muted uppercase tracking-wider">RESULTS</p>
                  {instructorSearchResults.map((inst) => (
                    <div key={inst.id} className="flex items-center justify-between bg-c-panel rounded-lg border border-c-border px-3 py-2">
                      <div>
                        <span className="font-mono text-sm text-c-text">{inst.displayName}</span>
                        {inst.certType && (
                          <span className="ml-2 font-mono text-[10px] px-2 py-0.5 rounded border border-c-amber/30 bg-c-amber-lo text-c-amber uppercase">
                            {inst.certType}
                          </span>
                        )}
                      </div>
                      <button
                        onClick={() => requestInstructorConnection(inst.userId)}
                        disabled={connectionActionLoading}
                        className="px-3 py-1.5 bg-c-amber hover:bg-c-amber/90 disabled:opacity-50 text-c-bg font-mono text-[10px] font-semibold rounded-lg transition-colors uppercase"
                      >
                        {connectionActionLoading ? '...' : 'CONNECT'}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* 7.75. Checkride Milestones */}
      <div className="bezel rounded-lg border border-c-border p-6">
        <h2 className="font-mono text-xs text-c-muted uppercase tracking-wider mb-1">CHECKRIDE MILESTONES</h2>
        <p className="font-mono text-[9px] text-c-dim mb-4">
          Track your progress toward your checkride. These are self-reported and shared with your connected instructor.
        </p>
        {milestoneLoading ? (
          <div className="h-24 bg-c-bezel rounded animate-pulse" />
        ) : (
          <div className="space-y-3">
            {milestones.map(m => (
              <div key={m.key} className="flex items-center gap-3 py-2 border-b border-c-border last:border-0">
                <span className="font-mono text-sm text-c-text flex-1">{MILESTONE_LABELS[m.key] || m.key}</span>
                <select
                  value={m.status}
                  onChange={(e) => handleMilestoneUpdate(m.key, e.target.value)}
                  disabled={milestoneUpdating === m.key}
                  className="font-mono text-[10px] bg-c-panel border border-c-border rounded px-2 py-1 text-c-text disabled:opacity-50"
                >
                  {STATUS_OPTIONS.map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 8. Instructor Mode (behind feature flag) */}
      {instructorFeatureEnabled && (
        <div className="bezel rounded-lg border border-c-border p-6">
          <h2 className="font-mono font-semibold text-base text-c-amber mb-1 tracking-wider uppercase">INSTRUCTOR MODE</h2>
          <p className="font-mono text-xs text-c-muted mb-5">
            Are you a CFI? Activate Instructor Mode to connect with your students on HeyDPE and monitor their checkride preparation progress.
          </p>

          {instructorLoading ? (
            <div className="font-mono text-sm text-c-dim uppercase">LOADING...</div>
          ) : !instructorState?.hasProfile && !instructorFormVisible ? (
            /* No profile yet — show activation prompt */
            <div>
              <button
                onClick={() => setInstructorFormVisible(true)}
                className="px-4 py-2 bg-c-amber hover:bg-c-amber/90 text-c-bg font-mono text-sm font-semibold rounded-lg transition-colors uppercase tracking-wide"
              >
                APPLY FOR INSTRUCTOR MODE
              </button>
              {instructorMessage && (
                <p className={`font-mono text-xs mt-3 ${instructorMessage.type === 'success' ? 'text-c-green glow-g' : 'text-c-red'}`}>
                  {instructorMessage.type === 'success' ? '\u2713 ' : ''}{instructorMessage.text}
                </p>
              )}
            </div>
          ) : instructorFormVisible || (instructorState?.applicationStatus === 'rejected' && instructorFormVisible) ? (
            /* Application form */
            <div className="space-y-4">
              <div>
                <label className="block font-mono text-xs text-c-muted mb-1.5 uppercase tracking-wider">FIRST NAME</label>
                <input
                  type="text"
                  value={instructorFirstName}
                  onChange={(e) => setInstructorFirstName(e.target.value)}
                  placeholder="Your first name"
                  maxLength={100}
                  required
                  className="w-full px-3 py-2 bg-c-panel border border-c-border rounded-lg text-c-text font-mono text-sm focus:outline-none focus:ring-1 focus:ring-c-amber focus:border-c-amber placeholder-c-dim transition-colors"
                />
              </div>
              <div>
                <label className="block font-mono text-xs text-c-muted mb-1.5 uppercase tracking-wider">LAST NAME</label>
                <input
                  type="text"
                  value={instructorLastName}
                  onChange={(e) => setInstructorLastName(e.target.value)}
                  placeholder="Your last name"
                  maxLength={100}
                  required
                  className="w-full px-3 py-2 bg-c-panel border border-c-border rounded-lg text-c-text font-mono text-sm focus:outline-none focus:ring-1 focus:ring-c-amber focus:border-c-amber placeholder-c-dim transition-colors"
                />
              </div>
              <div>
                <label className="block font-mono text-xs text-c-muted mb-1.5 uppercase tracking-wider">CERTIFICATE NUMBER</label>
                <input
                  type="text"
                  value={instructorCertNumber}
                  onChange={(e) => setInstructorCertNumber(e.target.value)}
                  placeholder="FAA certificate number"
                  maxLength={50}
                  required
                  className="w-full px-3 py-2 bg-c-panel border border-c-border rounded-lg text-c-text font-mono text-sm focus:outline-none focus:ring-1 focus:ring-c-amber focus:border-c-amber placeholder-c-dim transition-colors"
                />
              </div>
              <div>
                <label className="block font-mono text-xs text-c-muted mb-1.5 uppercase tracking-wider">CERTIFICATE TYPE</label>
                <select
                  value={instructorCertType}
                  onChange={(e) => setInstructorCertType(e.target.value as CertificateType)}
                  className="w-full px-3 py-2 bg-c-panel border border-c-border rounded-lg text-c-text font-mono text-sm focus:outline-none focus:ring-1 focus:ring-c-amber focus:border-c-amber transition-colors"
                >
                  <option value="CFI">CFI — Certified Flight Instructor</option>
                  <option value="CFII">CFII — Certified Flight Instructor Instrument</option>
                  <option value="MEI">MEI — Multi-Engine Instructor</option>
                  <option value="AGI">AGI — Advanced Ground Instructor</option>
                  <option value="IGI">IGI — Instrument Ground Instructor</option>
                </select>
              </div>

              {instructorMessage && (
                <p className={`font-mono text-xs ${instructorMessage.type === 'success' ? 'text-c-green glow-g' : 'text-c-red'}`}>
                  {instructorMessage.type === 'success' ? '\u2713 ' : ''}{instructorMessage.text}
                </p>
              )}

              <div className="flex gap-3">
                <button
                  onClick={() => {
                    setInstructorFormVisible(false);
                    setInstructorMessage(null);
                  }}
                  disabled={instructorSubmitting}
                  className="px-4 py-2 text-c-muted hover:text-c-text font-mono text-sm transition-colors uppercase tracking-wide"
                >
                  CANCEL
                </button>
                <button
                  onClick={submitInstructorApplication}
                  disabled={instructorSubmitting || !instructorFirstName.trim() || !instructorLastName.trim() || !instructorCertNumber.trim()}
                  className="px-5 py-2 bg-c-amber hover:bg-c-amber/90 disabled:opacity-50 text-c-bg font-mono text-sm font-semibold rounded-lg transition-colors uppercase tracking-wide"
                >
                  {instructorSubmitting ? 'SUBMITTING...' : 'APPLY FOR INSTRUCTOR MODE'}
                </button>
              </div>
            </div>
          ) : instructorState?.applicationStatus === 'pending' ? (
            /* Pending review */
            <div>
              <p className="font-mono text-sm text-c-muted">
                Your instructor application is under review. We&apos;ll notify you when it&apos;s approved.
              </p>
              {instructorMessage && (
                <p className={`font-mono text-xs mt-3 ${instructorMessage.type === 'success' ? 'text-c-green glow-g' : 'text-c-red'}`}>
                  {instructorMessage.type === 'success' ? '\u2713 ' : ''}{instructorMessage.text}
                </p>
              )}
            </div>
          ) : instructorState?.applicationStatus === 'approved' ? (
            /* Approved — active instructor */
            <div>
              <div className="flex items-center gap-2 mb-3">
                <span className="w-2.5 h-2.5 rounded-full bg-c-green inline-block glow-g" />
                <span className="font-mono text-sm text-c-green font-semibold uppercase">ACTIVE</span>
              </div>
              <p className="font-mono text-xs text-gray-500 mb-3">
                Instructor access is a courtesy benefit and may be revoked.
              </p>
              {/* Courtesy access status */}
              <div className="flex flex-col gap-1 mb-3">
                {instructorState.hasCourtesyAccess ? (
                  <span className="font-mono text-xs text-c-green">Courtesy access: Active</span>
                ) : (
                  <span className="font-mono text-xs text-c-amber">Courtesy access: Inactive</span>
                )}
                {typeof instructorState.paidStudentCount === 'number' && (
                  <span className="font-mono text-xs text-c-dim">
                    {instructorState.paidStudentCount} paying {instructorState.paidStudentCount === 1 ? 'student' : 'students'} connected
                  </span>
                )}
              </div>
              {instructorState.profile?.certificate_type && instructorState.profile?.certificate_number && (
                <div className="iframe rounded-lg p-3">
                  <div className="font-mono text-xs text-c-muted mb-1 uppercase">CERTIFICATE</div>
                  <div className="font-mono text-sm text-c-text">
                    {instructorState.profile.certificate_type} &mdash; ****{instructorState.profile.certificate_number.slice(-4)}
                  </div>
                </div>
              )}
              {/* Invite Students */}
              <div className="mt-5 pt-5 border-t border-c-border">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <h3 className="font-mono text-xs text-c-muted uppercase tracking-wider mb-0.5">INVITE STUDENTS</h3>
                    <p className="font-mono text-[10px] text-c-dim">Share a link with your students so they can connect with you on HeyDPE.</p>
                  </div>
                  <button
                    onClick={createInviteLink}
                    disabled={inviteCreating}
                    className="px-3 py-1.5 bg-c-amber hover:bg-c-amber/90 disabled:opacity-50 text-c-bg font-mono text-[10px] font-semibold rounded-lg transition-colors uppercase tracking-wide whitespace-nowrap"
                  >
                    {inviteCreating ? 'CREATING...' : '+ NEW LINK'}
                  </button>
                </div>

                {invites.length > 0 ? (
                  <div className="space-y-2">
                    {invites.filter(i => !i.revoked_at).map((invite) => {
                      const expired = new Date(invite.expires_at) < new Date();
                      const claimed = !!invite.claimed_at;
                      return (
                        <div key={invite.id} className="flex items-center gap-2 bg-c-panel rounded-lg border border-c-border px-3 py-2">
                          <div className="flex-1 min-w-0">
                            <div className="font-mono text-[10px] text-c-text truncate">{invite.invite_url}</div>
                            <div className="font-mono text-[9px] text-c-dim mt-0.5">
                              {claimed ? (
                                <span className="text-c-green">Claimed</span>
                              ) : expired ? (
                                <span className="text-c-red">Expired</span>
                              ) : (
                                <span>Expires {new Date(invite.expires_at).toLocaleDateString()}</span>
                              )}
                            </div>
                          </div>
                          {!claimed && !expired && (
                            <button
                              onClick={() => copyInviteUrl(invite.invite_url, invite.id)}
                              className="px-2 py-1 rounded border border-c-border bg-c-bezel text-c-muted hover:text-c-text font-mono text-[9px] uppercase transition-colors whitespace-nowrap"
                            >
                              {inviteCopied === invite.id ? 'COPIED!' : 'COPY'}
                            </button>
                          )}
                          {!claimed && (
                            <button
                              onClick={() => revokeInviteLink(invite.id)}
                              className="px-2 py-1 rounded border border-c-red/20 bg-c-red-dim text-c-red hover:bg-c-red/20 font-mono text-[9px] uppercase transition-colors whitespace-nowrap"
                            >
                              REVOKE
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="font-mono text-[10px] text-c-dim">No active invite links. Create one to share with your students.</p>
                )}
              </div>
            </div>
          ) : instructorState?.applicationStatus === 'rejected' ? (
            /* Rejected — show reason + reapply */
            <div>
              <p className="font-mono text-sm text-c-muted mb-3">
                {instructorState.profile?.rejection_reason
                  ? `Your application was not approved: ${instructorState.profile.rejection_reason}`
                  : 'Your application was not approved. You may reapply with updated information.'}
              </p>
              <button
                onClick={() => setInstructorFormVisible(true)}
                className="px-4 py-2 bg-c-amber hover:bg-c-amber/90 text-c-bg font-mono text-sm font-semibold rounded-lg transition-colors uppercase tracking-wide"
              >
                REAPPLY
              </button>
              {instructorMessage && (
                <p className={`font-mono text-xs mt-3 ${instructorMessage.type === 'success' ? 'text-c-green glow-g' : 'text-c-red'}`}>
                  {instructorMessage.type === 'success' ? '\u2713 ' : ''}{instructorMessage.text}
                </p>
              )}
            </div>
          ) : instructorState?.applicationStatus === 'suspended' ? (
            /* Suspended — show reason + contact support */
            <div>
              <p className="font-mono text-sm text-c-muted mb-3">
                {instructorState.profile?.suspension_reason
                  ? `Your instructor account has been suspended: ${instructorState.profile.suspension_reason}`
                  : 'Your instructor account has been suspended.'}
              </p>
              <a
                href="mailto:support@heydpe.com"
                className="font-mono text-sm text-c-amber hover:underline uppercase"
              >
                CONTACT SUPPORT
              </a>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
