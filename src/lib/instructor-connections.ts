import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';

// --- Types ---

export type ConnectionState = 'invited' | 'pending' | 'connected' | 'inactive' | 'rejected' | 'disconnected';

export interface ConnectionRow {
  id: string;
  instructor_user_id: string;
  student_user_id: string;
  state: ConnectionState;
  initiated_by: 'student' | 'instructor' | 'system';
  invite_id: string | null;
  requested_at: string | null;
  approved_at: string | null;
  approved_by: string | null;
  connected_at: string | null;
  rejected_at: string | null;
  disconnected_at: string | null;
  disconnected_by: string | null;
  disconnect_reason: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface ConnectionInfo {
  id: string;
  state: ConnectionState;
  instructorName: string | null;
  instructorCertType: string | null;
  connectedAt: string | null;
  requestedAt: string | null;
}

export interface StudentConnectionResult {
  connection: ConnectionInfo | null;
}

export interface InstructorConnectionListResult {
  connected: ConnectionListItem[];
  pending: ConnectionListItem[];
  counts: {
    connected: number;
    pending: number;
    unclaimedInvites: number;
  };
}

export interface ConnectionListItem {
  connectionId: string;
  studentUserId: string;
  studentName: string | null;
  state: ConnectionState;
  requestedAt: string | null;
  connectedAt: string | null;
  initiatedBy: string;
}

// --- Student Functions ---

/**
 * Get a student's current instructor connection.
 * Returns the most recent non-disconnected connection, or null.
 */
export async function getStudentConnection(
  supabase: SupabaseClient,
  studentUserId: string,
): Promise<ConnectionInfo | null> {
  const { data, error } = await supabase
    .from('student_instructor_connections')
    .select('id, state, instructor_user_id, connected_at, requested_at')
    .eq('student_user_id', studentUserId)
    .in('state', ['pending', 'connected', 'invited'])
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) return null;

  // Fetch instructor display info
  const { data: profile } = await supabase
    .from('instructor_profiles')
    .select('first_name, last_name, certificate_type')
    .eq('user_id', data.instructor_user_id)
    .maybeSingle();

  const instructorName = profile
    ? [profile.first_name, profile.last_name].filter(Boolean).join(' ') || null
    : null;

  return {
    id: data.id as string,
    state: data.state as ConnectionState,
    instructorName,
    instructorCertType: (profile?.certificate_type as string) || null,
    connectedAt: data.connected_at as string | null,
    requestedAt: data.requested_at as string | null,
  };
}

/**
 * Student requests connection to an instructor.
 * Creates a new connection with state='pending', initiated_by='student'.
 */
export async function requestConnection(
  supabase: SupabaseClient,
  studentUserId: string,
  instructorUserId: string,
): Promise<{ success: boolean; connectionId?: string; error?: string }> {
  // Prevent self-connection
  if (studentUserId === instructorUserId) {
    return { success: false, error: 'Cannot connect to yourself' };
  }

  // Verify instructor exists and is approved
  const { data: instructor } = await supabase
    .from('instructor_profiles')
    .select('status')
    .eq('user_id', instructorUserId)
    .maybeSingle();

  if (!instructor || instructor.status !== 'approved') {
    return { success: false, error: 'Instructor not found or not active' };
  }

  // Check for existing active connection
  const { data: existing } = await supabase
    .from('student_instructor_connections')
    .select('id, state')
    .eq('student_user_id', studentUserId)
    .eq('instructor_user_id', instructorUserId)
    .maybeSingle();

  if (existing) {
    if (existing.state === 'connected' || existing.state === 'pending' || existing.state === 'invited') {
      return { success: false, error: 'Connection already exists' };
    }
    // Reuse existing row (was disconnected/rejected) — update state
    const { error } = await supabase
      .from('student_instructor_connections')
      .update({
        state: 'pending',
        initiated_by: 'student',
        requested_at: new Date().toISOString(),
        approved_at: null,
        approved_by: null,
        connected_at: null,
        rejected_at: null,
        disconnected_at: null,
        disconnected_by: null,
        disconnect_reason: null,
      })
      .eq('id', existing.id);
    if (error) return { success: false, error: error.message };
    return { success: true, connectionId: existing.id as string };
  }

  // Create new connection
  const { data: newConn, error } = await supabase
    .from('student_instructor_connections')
    .insert({
      student_user_id: studentUserId,
      instructor_user_id: instructorUserId,
      state: 'pending',
      initiated_by: 'student',
      requested_at: new Date().toISOString(),
    })
    .select('id')
    .single();

  if (error) return { success: false, error: error.message };
  return { success: true, connectionId: newConn.id as string };
}

/**
 * Cancel a pending connection request (student side).
 */
export async function cancelConnectionRequest(
  supabase: SupabaseClient,
  connectionId: string,
  studentUserId: string,
): Promise<{ success: boolean; error?: string }> {
  const { data: conn } = await supabase
    .from('student_instructor_connections')
    .select('id, state, student_user_id')
    .eq('id', connectionId)
    .single();

  if (!conn) return { success: false, error: 'Connection not found' };
  if (conn.student_user_id !== studentUserId) return { success: false, error: 'Unauthorized' };
  if (conn.state !== 'pending') return { success: false, error: `Cannot cancel connection in state: ${conn.state}` };

  const { error } = await supabase
    .from('student_instructor_connections')
    .update({
      state: 'disconnected',
      disconnected_at: new Date().toISOString(),
      disconnected_by: studentUserId,
      disconnect_reason: 'Student cancelled request',
    })
    .eq('id', connectionId);

  if (error) return { success: false, error: error.message };
  return { success: true };
}

/**
 * Disconnect from an instructor (student side).
 */
export async function studentDisconnect(
  supabase: SupabaseClient,
  connectionId: string,
  studentUserId: string,
): Promise<{ success: boolean; error?: string }> {
  const { data: conn } = await supabase
    .from('student_instructor_connections')
    .select('id, state, student_user_id')
    .eq('id', connectionId)
    .single();

  if (!conn) return { success: false, error: 'Connection not found' };
  if (conn.student_user_id !== studentUserId) return { success: false, error: 'Unauthorized' };
  if (conn.state !== 'connected') return { success: false, error: `Cannot disconnect from state: ${conn.state}` };

  const { error } = await supabase
    .from('student_instructor_connections')
    .update({
      state: 'disconnected',
      disconnected_at: new Date().toISOString(),
      disconnected_by: studentUserId,
      disconnect_reason: 'Student disconnected',
    })
    .eq('id', connectionId);

  if (error) return { success: false, error: error.message };
  return { success: true };
}

// --- Instructor Functions ---

/**
 * List an instructor's connections (connected + pending).
 */
export async function getInstructorConnections(
  supabase: SupabaseClient,
  instructorUserId: string,
): Promise<InstructorConnectionListResult> {
  const { data: rows } = await supabase
    .from('student_instructor_connections')
    .select('id, student_user_id, state, requested_at, connected_at, initiated_by')
    .eq('instructor_user_id', instructorUserId)
    .in('state', ['connected', 'pending'])
    .order('updated_at', { ascending: false });

  const connections = rows || [];

  // Fetch student display names
  const studentIds = connections.map(r => r.student_user_id as string);
  const nameMap = new Map<string, string>();

  if (studentIds.length > 0) {
    const { data: profiles } = await supabase
      .from('user_profiles')
      .select('user_id, display_name')
      .in('user_id', studentIds);

    for (const p of profiles || []) {
      if (p.display_name) nameMap.set(p.user_id as string, p.display_name as string);
    }
  }

  // Count unclaimed invites
  const { count: unclaimedInvites } = await supabase
    .from('instructor_invites')
    .select('id', { count: 'exact', head: true })
    .eq('instructor_user_id', instructorUserId)
    .is('claimed_at', null)
    .is('revoked_at', null)
    .gt('expires_at', new Date().toISOString());

  const connected: ConnectionListItem[] = [];
  const pending: ConnectionListItem[] = [];

  for (const row of connections) {
    const item: ConnectionListItem = {
      connectionId: row.id as string,
      studentUserId: row.student_user_id as string,
      studentName: nameMap.get(row.student_user_id as string) || null,
      state: row.state as ConnectionState,
      requestedAt: row.requested_at as string | null,
      connectedAt: row.connected_at as string | null,
      initiatedBy: row.initiated_by as string,
    };
    if (row.state === 'connected') connected.push(item);
    else pending.push(item);
  }

  return {
    connected,
    pending,
    counts: {
      connected: connected.length,
      pending: pending.length,
      unclaimedInvites: unclaimedInvites ?? 0,
    },
  };
}

/**
 * Approve a pending connection request (instructor side).
 */
export async function approveConnection(
  supabase: SupabaseClient,
  connectionId: string,
  instructorUserId: string,
): Promise<{ success: boolean; error?: string }> {
  const { data: conn } = await supabase
    .from('student_instructor_connections')
    .select('id, state, instructor_user_id')
    .eq('id', connectionId)
    .single();

  if (!conn) return { success: false, error: 'Connection not found' };
  if (conn.instructor_user_id !== instructorUserId) return { success: false, error: 'Unauthorized' };
  if (conn.state !== 'pending') return { success: false, error: `Cannot approve connection in state: ${conn.state}` };

  const now = new Date().toISOString();
  const { error } = await supabase
    .from('student_instructor_connections')
    .update({
      state: 'connected',
      approved_at: now,
      approved_by: instructorUserId,
      connected_at: now,
    })
    .eq('id', connectionId);

  if (error) return { success: false, error: error.message };
  return { success: true };
}

/**
 * Reject a pending connection request (instructor side).
 */
export async function rejectConnection(
  supabase: SupabaseClient,
  connectionId: string,
  instructorUserId: string,
): Promise<{ success: boolean; error?: string }> {
  const { data: conn } = await supabase
    .from('student_instructor_connections')
    .select('id, state, instructor_user_id')
    .eq('id', connectionId)
    .single();

  if (!conn) return { success: false, error: 'Connection not found' };
  if (conn.instructor_user_id !== instructorUserId) return { success: false, error: 'Unauthorized' };
  if (conn.state !== 'pending') return { success: false, error: `Cannot reject connection in state: ${conn.state}` };

  const { error } = await supabase
    .from('student_instructor_connections')
    .update({
      state: 'rejected',
      rejected_at: new Date().toISOString(),
    })
    .eq('id', connectionId);

  if (error) return { success: false, error: error.message };
  return { success: true };
}

/**
 * Disconnect a student (instructor side).
 */
export async function instructorDisconnect(
  supabase: SupabaseClient,
  connectionId: string,
  instructorUserId: string,
): Promise<{ success: boolean; error?: string }> {
  const { data: conn } = await supabase
    .from('student_instructor_connections')
    .select('id, state, instructor_user_id')
    .eq('id', connectionId)
    .single();

  if (!conn) return { success: false, error: 'Connection not found' };
  if (conn.instructor_user_id !== instructorUserId) return { success: false, error: 'Unauthorized' };
  if (conn.state !== 'connected') return { success: false, error: `Cannot disconnect from state: ${conn.state}` };

  const { error } = await supabase
    .from('student_instructor_connections')
    .update({
      state: 'disconnected',
      disconnected_at: new Date().toISOString(),
      disconnected_by: instructorUserId,
      disconnect_reason: 'Instructor disconnected',
    })
    .eq('id', connectionId);

  if (error) return { success: false, error: error.message };
  return { success: true };
}

// --- Search ---

/**
 * Search for an instructor by last name (and optionally certificate number).
 * Returns only display-safe info — NEVER returns certificate_number.
 */
export async function searchInstructors(
  supabase: SupabaseClient,
  lastName: string,
  certificateNumber?: string,
): Promise<{ id: string; userId: string; displayName: string; certType: string | null }[]> {
  let query = supabase
    .from('instructor_profiles')
    .select('id, user_id, first_name, last_name, certificate_type')
    .eq('status', 'approved')
    .ilike('last_name', lastName.trim());

  if (certificateNumber?.trim()) {
    query = query.eq('certificate_number', certificateNumber.trim());
  }

  const { data } = await query.limit(10);

  return (data || []).map(row => ({
    id: row.id as string,
    userId: row.user_id as string,
    displayName: [row.first_name, row.last_name].filter(Boolean).join(' '),
    certType: (row.certificate_type as string) || null,
  }));
}
