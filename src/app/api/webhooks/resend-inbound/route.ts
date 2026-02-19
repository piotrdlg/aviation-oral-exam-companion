import { NextResponse } from 'next/server';
import { Webhook } from 'svix';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import {
  routeEmail,
  extractEmailAddress,
  extractEmailName,
} from '@/lib/email-routing';
import { forwardEmail } from '@/lib/email';

const serviceSupabase = createServiceClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/** Shape of the Resend `email.received` webhook payload. */
interface ResendEmailReceivedEvent {
  type: 'email.received';
  data: {
    email_id: string;
    from: string;
    to: string[];
    subject: string;
  };
}

/** Shape of the Resend Receiving API response (full email body). */
interface ResendEmailBody {
  text?: string;
  html?: string;
}

export async function POST(request: Request) {
  // 1. Verify webhook signature using Svix
  const body = await request.text();
  const headers = {
    'svix-id': request.headers.get('svix-id') ?? '',
    'svix-timestamp': request.headers.get('svix-timestamp') ?? '',
    'svix-signature': request.headers.get('svix-signature') ?? '',
  };

  const wh = new Webhook(process.env.RESEND_WEBHOOK_SECRET!);
  let event: ResendEmailReceivedEvent;
  try {
    event = wh.verify(body, headers) as ResendEmailReceivedEvent;
  } catch {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  // 2. Only handle email.received events
  if (event.type !== 'email.received') {
    return NextResponse.json({ received: true });
  }

  const { email_id, from, to, subject } = event.data;

  // Guard against empty recipient list
  if (!to || to.length === 0) {
    console.warn('[resend-inbound] Email received with empty to-addresses, skipping');
    return NextResponse.json({ received: true });
  }

  try {
    // 3. Route the email using pure routing logic
    const route = routeEmail(to, process.env.EMAIL_FORWARD_TO);

    // 4. Fetch full email body from Resend Receiving API
    //    The webhook payload does NOT include the body — must fetch separately.
    let bodyText: string | null = null;
    let bodyHtml: string | null = null;
    try {
      const resp = await fetch(
        `https://api.resend.com/emails/receiving/${email_id}`,
        {
          headers: {
            Authorization: `Bearer ${process.env.RESEND_INBOUND_API_KEY}`,
          },
          signal: AbortSignal.timeout(10_000),
        }
      );
      if (resp.ok) {
        const data: ResendEmailBody = await resp.json();
        bodyText = data.text ?? null;
        bodyHtml = data.html ?? null;
      }
    } catch (err) {
      console.error('[resend-inbound] Failed to fetch email body:', err);
    }

    // 5. Execute route
    const fromEmail = extractEmailAddress(from);
    const fromName = extractEmailName(from);

    if (route.action === 'create_ticket') {
      // Match from_email to existing HeyDPE user via GoTrue admin API.
      // The Supabase JS SDK's listUsers() types don't expose the `filter` param,
      // so we call the GoTrue REST endpoint directly with the service role key.
      let userId: string | null = null;
      try {
        const url = new URL(
          '/auth/v1/admin/users',
          process.env.NEXT_PUBLIC_SUPABASE_URL!
        );
        url.searchParams.set('filter', fromEmail);
        url.searchParams.set('page', '1');
        url.searchParams.set('per_page', '1');

        const resp = await fetch(url.toString(), {
          headers: {
            Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY!}`,
            apikey: process.env.SUPABASE_SERVICE_ROLE_KEY!,
          },
          signal: AbortSignal.timeout(5_000),
        });
        if (resp.ok) {
          const data: { users?: Array<{ id: string; email?: string }> } =
            await resp.json();
          const users = data.users ?? [];
          userId =
            users.find((u) => u.email?.toLowerCase() === fromEmail)?.id ?? null;
        }
      } catch {
        // User lookup failed — create ticket without user link
      }

      // SECURITY: body_html contains raw HTML from external email senders.
      // It is stored for reference but MUST NEVER be rendered with dangerouslySetInnerHTML.
      // Only body_text is displayed in the admin UI.
      const { error: insertError } = await serviceSupabase
        .from('support_tickets')
        .insert({
          resend_email_id: email_id,
          from_email: fromEmail,
          from_name: fromName,
          to_address: to[0],
          subject: subject || '(no subject)',
          body_text: bodyText,
          body_html: bodyHtml,
          ticket_type: route.type,
          user_id: userId,
        });

      if (insertError) {
        // 23505 = unique_violation — idempotent duplicate via resend_email_id constraint
        if (insertError.code !== '23505') {
          console.error(
            '[resend-inbound] Failed to create ticket:',
            insertError
          );
        }
      }
    } else if (route.action === 'forward') {
      await forwardEmail(
        from,
        to[0],
        subject || '(no subject)',
        bodyText || '',
        bodyHtml ?? undefined
      );
    }
    // route.action === 'ignore' — nothing to do

    return NextResponse.json({ received: true });
  } catch (err) {
    console.error('[resend-inbound] Unhandled error:', err);
    return NextResponse.json({ error: 'Processing failed' }, { status: 500 });
  }
}
