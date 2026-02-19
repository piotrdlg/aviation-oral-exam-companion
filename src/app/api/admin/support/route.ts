import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, handleAdminError } from '@/lib/admin-guard';
import { sendTicketReply } from '@/lib/email';
import type { TicketStatus, TicketPriority, TicketType } from '@/types/database';

const VALID_STATUSES: TicketStatus[] = ['open', 'in_progress', 'resolved', 'closed'];
const VALID_PRIORITIES: TicketPriority[] = ['low', 'normal', 'high', 'urgent'];
const VALID_TYPES: TicketType[] = ['support', 'feedback'];

/**
 * GET /api/admin/support
 *
 * Two modes:
 * 1. Single ticket: ?id={ticketId} -- returns ticket + replies
 * 2. List tickets:  ?status=open&type=support -- returns tickets + counts
 *
 * Query params (list mode):
 * - status: TicketStatus | 'all' (default: 'all')
 * - type: TicketType | 'all' (default: 'all')
 */
export async function GET(request: NextRequest) {
  try {
    const { serviceSupabase } = await requireAdmin(request);
    const { searchParams } = new URL(request.url);

    // ----- Single ticket mode -----
    const ticketId = searchParams.get('id');
    if (ticketId) {
      const { data: ticket, error: ticketError } = await serviceSupabase
        .from('support_tickets')
        .select('*')
        .eq('id', ticketId)
        .maybeSingle();

      if (ticketError) {
        console.error('Support ticket fetch error:', ticketError.message);
        return NextResponse.json({ error: ticketError.message }, { status: 500 });
      }

      if (!ticket) {
        return NextResponse.json({ error: 'Ticket not found' }, { status: 404 });
      }

      const { data: replies, error: repliesError } = await serviceSupabase
        .from('ticket_replies')
        .select('*')
        .eq('ticket_id', ticketId)
        .order('created_at', { ascending: true })
        .limit(200);

      if (repliesError) {
        console.error('Ticket replies fetch error:', repliesError.message);
        return NextResponse.json({ error: repliesError.message }, { status: 500 });
      }

      return NextResponse.json({ ticket, replies: replies || [] });
    }

    // ----- List mode -----
    const status = searchParams.get('status') || 'all';
    const type = searchParams.get('type') || 'all';

    // Validate status param
    if (status !== 'all' && !VALID_STATUSES.includes(status as TicketStatus)) {
      return NextResponse.json(
        { error: `Invalid status. Must be one of: all, ${VALID_STATUSES.join(', ')}` },
        { status: 400 }
      );
    }

    // Validate type param
    if (type !== 'all' && !VALID_TYPES.includes(type as TicketType)) {
      return NextResponse.json(
        { error: `Invalid type. Must be one of: all, ${VALID_TYPES.join(', ')}` },
        { status: 400 }
      );
    }

    // Fetch tickets
    let query = serviceSupabase
      .from('support_tickets')
      .select('*')
      .order('created_at', { ascending: false });

    if (status !== 'all') {
      query = query.eq('status', status);
    }
    if (type !== 'all') {
      query = query.eq('ticket_type', type);
    }

    const { data: tickets, error: ticketsError } = await query;

    if (ticketsError) {
      console.error('Support tickets list error:', ticketsError.message);
      return NextResponse.json({ error: ticketsError.message }, { status: 500 });
    }

    // Compute counts using head-only queries (no data transfer)
    const [openRes, inProgressRes, resolvedRes, closedRes] = await Promise.all([
      serviceSupabase.from('support_tickets').select('*', { count: 'exact', head: true }).eq('status', 'open'),
      serviceSupabase.from('support_tickets').select('*', { count: 'exact', head: true }).eq('status', 'in_progress'),
      serviceSupabase.from('support_tickets').select('*', { count: 'exact', head: true }).eq('status', 'resolved'),
      serviceSupabase.from('support_tickets').select('*', { count: 'exact', head: true }).eq('status', 'closed'),
    ]);

    const counts = {
      open: openRes.count ?? 0,
      in_progress: inProgressRes.count ?? 0,
      resolved: resolvedRes.count ?? 0,
      closed: closedRes.count ?? 0,
      total: (openRes.count ?? 0) + (inProgressRes.count ?? 0) + (resolvedRes.count ?? 0) + (closedRes.count ?? 0),
    };

    return NextResponse.json({ tickets: tickets || [], counts });
  } catch (error) {
    return handleAdminError(error);
  }
}

/**
 * PATCH /api/admin/support
 *
 * Update a ticket's status, priority, admin_notes, or assigned_to.
 *
 * Body: { id: string, status?: TicketStatus, priority?: TicketPriority, admin_notes?: string, assigned_to?: string }
 */
export async function PATCH(request: NextRequest) {
  try {
    const { serviceSupabase } = await requireAdmin(request);
    const body = await request.json();

    const { id, status, priority, admin_notes, assigned_to } = body as {
      id?: string;
      status?: string;
      priority?: string;
      admin_notes?: string;
      assigned_to?: string;
    };

    if (!id) {
      return NextResponse.json({ error: 'Missing ticket id' }, { status: 400 });
    }

    // Validate status if provided
    if (status !== undefined && !VALID_STATUSES.includes(status as TicketStatus)) {
      return NextResponse.json(
        { error: `Invalid status. Must be one of: ${VALID_STATUSES.join(', ')}` },
        { status: 400 }
      );
    }

    // Validate priority if provided
    if (priority !== undefined && !VALID_PRIORITIES.includes(priority as TicketPriority)) {
      return NextResponse.json(
        { error: `Invalid priority. Must be one of: ${VALID_PRIORITIES.join(', ')}` },
        { status: 400 }
      );
    }

    // Build update payload with only provided fields
    const updates: Record<string, unknown> = {};
    if (status !== undefined) updates.status = status;
    if (priority !== undefined) updates.priority = priority;
    if (admin_notes !== undefined) updates.admin_notes = admin_notes;
    if (assigned_to !== undefined) updates.assigned_to = assigned_to;

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
    }

    const { data: ticket, error } = await serviceSupabase
      .from('support_tickets')
      .update(updates)
      .eq('id', id)
      .select('*')
      .maybeSingle();

    if (error) {
      console.error('Support ticket update error:', error.message);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!ticket) {
      return NextResponse.json({ error: 'Ticket not found' }, { status: 404 });
    }

    return NextResponse.json({ ticket });
  } catch (error) {
    return handleAdminError(error);
  }
}

/**
 * POST /api/admin/support
 *
 * Send a reply to a ticket.
 *
 * Body: { ticketId: string, body: string }
 *
 * Steps:
 * 1. Look up the ticket (need from_email, subject, resend_email_id for threading)
 * 2. Send the email via sendTicketReply()
 * 3. Insert a ticket_replies row with direction: 'outbound'
 * 4. Update ticket reply_count and last_reply_at
 */
export async function POST(request: NextRequest) {
  try {
    const { serviceSupabase, user } = await requireAdmin(request);
    const reqBody = await request.json();

    const { ticketId, body } = reqBody as { ticketId?: string; body?: string };

    if (!ticketId || !body) {
      return NextResponse.json(
        { error: 'Missing required fields: ticketId, body' },
        { status: 400 }
      );
    }

    // 1. Fetch the ticket
    const { data: ticket, error: ticketError } = await serviceSupabase
      .from('support_tickets')
      .select('*')
      .eq('id', ticketId)
      .maybeSingle();

    if (ticketError) {
      console.error('Support ticket fetch error:', ticketError.message);
      return NextResponse.json({ error: ticketError.message }, { status: 500 });
    }

    if (!ticket) {
      return NextResponse.json({ error: 'Ticket not found' }, { status: 404 });
    }

    // 2. Send the email
    const resendEmailId = await sendTicketReply(
      ticket.from_email,
      ticket.subject,
      body,
      ticket.resend_email_id ?? undefined
    );

    const emailSent = resendEmailId !== null;
    if (!emailSent) {
      console.error('[admin/support] Email send failed for ticket:', ticketId);
    }

    // 3. Insert the reply record (save even if email failed for audit trail)
    const { data: reply, error: replyError } = await serviceSupabase
      .from('ticket_replies')
      .insert({
        ticket_id: ticketId,
        direction: 'outbound' as const,
        from_email: user.email || 'support@heydpe.com',
        body_text: body,
        resend_email_id: resendEmailId,
      })
      .select('*')
      .single();

    if (replyError) {
      console.error('Ticket reply insert error:', replyError.message);
      return NextResponse.json({ error: replyError.message }, { status: 500 });
    }

    // 4. Update reply_count (derived from actual reply rows to avoid race conditions)
    const { count: replyCount } = await serviceSupabase
      .from('ticket_replies')
      .select('*', { count: 'exact', head: true })
      .eq('ticket_id', ticketId);

    await serviceSupabase
      .from('support_tickets')
      .update({
        reply_count: replyCount ?? 1,
        last_reply_at: new Date().toISOString(),
      })
      .eq('id', ticketId);

    return NextResponse.json({ reply, emailSent });
  } catch (error) {
    return handleAdminError(error);
  }
}
