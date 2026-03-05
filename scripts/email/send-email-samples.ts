#!/usr/bin/env tsx
/**
 * Email Review Sample Sender — Phase 19
 *
 * Renders and sends one sample of each implemented email template.
 * ALL emails go to pd@imagineflying.com with [REVIEW SAMPLE] prefix.
 *
 * Usage: npx tsx scripts/email/send-email-samples.ts
 * npm:   npm run email:review-samples
 */
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config(); // fallback to .env
import { Resend } from 'resend';
import { render } from '@react-email/components';
import * as fs from 'fs';
import * as path from 'path';

// Templates
import { WelcomeEmail } from '../../src/emails/welcome';
import { SubscriptionConfirmedEmail } from '../../src/emails/subscription-confirmed';
import { SubscriptionCancelledEmail } from '../../src/emails/subscription-cancelled';
import { PaymentFailedEmail } from '../../src/emails/payment-failed';
import { TrialEndingEmail } from '../../src/emails/trial-ending';
import { TicketAutoReplyEmail } from '../../src/emails/ticket-auto-reply';
import { LearningDigestEmail } from '../../src/emails/learning-digest';
import { MotivationNudgeEmail } from '../../src/emails/motivation-nudge';

// Safety: hardcoded review recipient
const REVIEW_RECIPIENT = 'pd@imagineflying.com';
const SUBJECT_PREFIX = '[REVIEW SAMPLE] ';

const EVIDENCE_DIR = path.resolve(
  __dirname,
  '../../docs/system-audit/evidence/2026-03-04-phase20/email'
);

const SENDERS = {
  hello: 'HeyDPE <hello@heydpe.com>',
  billing: 'HeyDPE Billing <billing@heydpe.com>',
  support: 'HeyDPE Support <support@heydpe.com>',
  noreply: 'HeyDPE <noreply@heydpe.com>',
} as const;

interface SampleScenario {
  id: string;
  name: string;
  from: string;
  originalSubject: string;
  reactElement: React.ReactElement;
  type: 'react-template';
}

interface PlainTextScenario {
  id: string;
  name: string;
  from: string;
  originalSubject: string;
  textBody: string;
  htmlBody?: string;
  type: 'plain-text';
}

type Scenario = SampleScenario | PlainTextScenario;

interface SendResult {
  scenario: string;
  id: string;
  subject: string;
  recipient: string;
  from: string;
  timestamp: string;
  status: 'sent' | 'rendered_only' | 'failed';
  resendId?: string;
  error?: string;
  htmlFile?: string;
}

// Define all sendable scenarios
function getScenarios(): Scenario[] {
  return [
    {
      id: 'welcome',
      name: 'Welcome Email',
      from: SENDERS.hello,
      originalSubject: 'Welcome to HeyDPE — Your DPE is ready',
      reactElement: WelcomeEmail({ name: 'Captain Sample' }),
      type: 'react-template',
    },
    {
      id: 'subscription-confirmed-monthly',
      name: 'Subscription Confirmed (Monthly)',
      from: SENDERS.billing,
      originalSubject: 'Your HeyDPE subscription is active',
      reactElement: SubscriptionConfirmedEmail({ plan: 'monthly' }),
      type: 'react-template',
    },
    {
      id: 'subscription-confirmed-annual',
      name: 'Subscription Confirmed (Annual)',
      from: SENDERS.billing,
      originalSubject: 'Your HeyDPE subscription is active',
      reactElement: SubscriptionConfirmedEmail({ plan: 'annual' }),
      type: 'react-template',
    },
    {
      id: 'subscription-cancelled',
      name: 'Subscription Cancelled',
      from: SENDERS.billing,
      originalSubject: 'Your HeyDPE subscription has been cancelled',
      reactElement: SubscriptionCancelledEmail(),
      type: 'react-template',
    },
    {
      id: 'payment-failed',
      name: 'Payment Failed',
      from: SENDERS.billing,
      originalSubject: 'Action needed — Payment failed for HeyDPE',
      reactElement: PaymentFailedEmail(),
      type: 'react-template',
    },
    {
      id: 'trial-ending-2days',
      name: 'Trial Ending (2 days)',
      from: SENDERS.billing,
      originalSubject: 'Your HeyDPE trial ends in 2 days',
      reactElement: TrialEndingEmail({ name: 'Captain Sample', daysLeft: 2, plan: 'monthly' }),
      type: 'react-template',
    },
    {
      id: 'trial-ending-1day',
      name: 'Trial Ending (1 day)',
      from: SENDERS.billing,
      originalSubject: 'Your HeyDPE trial ends in 1 day',
      reactElement: TrialEndingEmail({ name: 'Captain Sample', daysLeft: 1, plan: 'annual' }),
      type: 'react-template',
    },
    {
      id: 'ticket-auto-reply',
      name: 'Support Ticket Auto-Reply',
      from: SENDERS.support,
      originalSubject: 'We received your message — HeyDPE Support',
      reactElement: TicketAutoReplyEmail({ subject: 'Voice mode not working on Safari' }),
      type: 'react-template',
    },
    {
      id: 'ticket-reply',
      name: 'Support Ticket Reply (Admin)',
      from: SENDERS.support,
      originalSubject: 'Re: Voice mode not working on Safari',
      textBody: [
        'Hi there,',
        '',
        'Thank you for reaching out about voice mode on Safari.',
        '',
        'Currently, voice-to-text (STT) is supported on Chrome and Edge browsers only, as it uses the Web Speech API which is not available in Safari or Firefox.',
        '',
        'For the best experience, we recommend using Chrome on desktop.',
        '',
        'Let us know if you have any other questions!',
        '',
        'Best,',
        'HeyDPE Support',
      ].join('\n'),
      htmlBody: [
        '<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"/></head>',
        '<body style="background-color:#0a0a0a;font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',Roboto,sans-serif;margin:0;padding:0">',
        '<div style="max-width:600px;margin:0 auto;padding:40px 20px">',
        '  <div style="text-align:center;padding-bottom:24px"><span style="color:#f59e0b;font-size:20px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase">HEYDPE</span></div>',
        '  <div style="background-color:#1a1a1a;border-radius:8px;padding:32px 24px">',
        '    <p style="color:#e5e5e5;font-size:14px;line-height:24px;margin:0 0 16px">Hi there,</p>',
        '    <p style="color:#e5e5e5;font-size:14px;line-height:24px;margin:0 0 16px">Thank you for reaching out about voice mode on Safari.</p>',
        '    <p style="color:#e5e5e5;font-size:14px;line-height:24px;margin:0 0 16px">Currently, voice-to-text (STT) is supported on <strong>Chrome</strong> and <strong>Edge</strong> browsers only, as it uses the Web Speech API which is not available in Safari or Firefox.</p>',
        '    <p style="color:#e5e5e5;font-size:14px;line-height:24px;margin:0 0 16px">For the best experience, we recommend using Chrome on desktop.</p>',
        '    <p style="color:#e5e5e5;font-size:14px;line-height:24px;margin:0 0 16px">Let us know if you have any other questions!</p>',
        '    <p style="color:#e5e5e5;font-size:14px;line-height:24px;margin:0">Best,<br/>HeyDPE Support</p>',
        '  </div>',
        '  <hr style="border-color:#2a2a2a;margin:32px 0 16px"/>',
        '  <div style="text-align:center;padding:0 20px">',
        '    <p style="color:#737373;font-size:12px;line-height:20px;margin:0 0 4px">Imagine Flying LLC &middot; Jacksonville, FL</p>',
        '    <p style="color:#737373;font-size:12px;line-height:20px;margin:0"><a href="https://heydpe.com/privacy" style="color:#737373;text-decoration:underline">Privacy Policy</a> &middot; <a href="https://heydpe.com/terms" style="color:#737373;text-decoration:underline">Terms of Service</a></p>',
        '  </div>',
        '</div></body></html>',
      ].join('\n'),
      type: 'plain-text',
    },
    {
      id: 'email-forward',
      name: 'Email Forward (Catch-all)',
      from: SENDERS.noreply,
      originalSubject: '[Fwd] Partnership inquiry for HeyDPE',
      textBody: [
        '--- Forwarded message from partner@example.com ---',
        '',
        'Hi HeyDPE team,',
        '',
        'I run a flight school in Florida and would love to discuss a partnership.',
        'Can we schedule a call?',
        '',
        'Best regards,',
        'Jane Doe',
        'SunState Flight Academy',
      ].join('\n'),
      htmlBody: '<p><strong>Forwarded message from partner@example.com</strong></p><hr/><pre>Hi HeyDPE team,\n\nI run a flight school in Florida and would love to discuss a partnership.\nCan we schedule a call?\n\nBest regards,\nJane Doe\nSunState Flight Academy</pre>',
      type: 'plain-text',
    },
    {
      id: 'learning-digest',
      name: 'Daily Learning Digest',
      from: SENDERS.hello,
      originalSubject: `Your HeyDPE study briefing — ${new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`,
      reactElement: LearningDigestEmail({
        displayName: 'Captain Sample',
        rating: 'private',
        totalSessions: 24,
        recentSessionCount: 5,
        totalExchanges: 87,
        weakAreas: [
          { elementCode: 'PA.I.C.K3', description: 'Weather theory — fronts, airmasses, and thunderstorm formation', area: 'I. Preflight Preparation', satisfactoryRate: 35, totalAttempts: 8, latestScore: 'unsatisfactory' },
          { elementCode: 'PA.III.B.K1', description: 'Airport marking aids and signs', area: 'III. Airport and Seaplane Base Operations', satisfactoryRate: 50, totalAttempts: 6, latestScore: 'partial' },
          { elementCode: 'PA.IX.A.K2', description: 'Engine failure procedures during flight', area: 'IX. Emergency Operations', satisfactoryRate: 60, totalAttempts: 5, latestScore: 'satisfactory' },
        ],
        strongAreas: [
          { elementCode: 'PA.I.A.K1', description: 'Pilot qualifications and currency requirements', area: 'I. Preflight Preparation', satisfactoryRate: 95 },
          { elementCode: 'PA.II.B.K1', description: 'Principles of flight — aerodynamics', area: 'II. Preflight Procedures', satisfactoryRate: 90 },
        ],
        recommendations: [
          'Focus on Area I.C — Weather: your weakest element at 35% satisfactory rate. Review AC 00-6B Chapter 10.',
          'You have 3 weak areas in different ACS areas. Consider a cross-ACS study session to cover them all.',
        ],
        generatedAt: new Date().toISOString(),
        unsubscribeUrl: 'https://aviation-oral-exam-companion.vercel.app/email/preferences?uid=sample&cat=learning_digest&token=sample',
      }),
      type: 'react-template' as const,
    },
    {
      id: 'motivation-nudge-day3',
      name: 'Motivation Nudge (Day 3)',
      from: SENDERS.hello,
      originalSubject: 'Your weak areas are waiting — HeyDPE',
      reactElement: MotivationNudgeEmail({
        name: 'Captain Sample',
        heading: 'Your weak areas are waiting',
        body: "It's been 3 days since your last practice session. Your DPE won't wait — and neither should you. Even a quick 10-minute session keeps your knowledge fresh and your confidence high.",
        ctaText: 'Review My Weak Areas',
        daysSinceLastSession: 3,
        totalSessions: 12,
        unsubscribeUrl: 'https://aviation-oral-exam-companion.vercel.app/email/preferences?uid=sample&cat=motivation_nudges&token=sample',
      }),
      type: 'react-template' as const,
    },
    {
      id: 'motivation-nudge-day14',
      name: 'Motivation Nudge (Day 14)',
      from: SENDERS.hello,
      originalSubject: "Don't lose your progress — HeyDPE",
      reactElement: MotivationNudgeEmail({
        name: 'Captain Sample',
        heading: "Don't lose your progress",
        body: "Two weeks is a long time away from the books. Studies show that aviation knowledge retention drops significantly after 10+ days without review. The good news? Even a short session today can bring it all back.",
        ctaText: 'Jump Back In',
        daysSinceLastSession: 14,
        totalSessions: 12,
        unsubscribeUrl: 'https://aviation-oral-exam-companion.vercel.app/email/preferences?uid=sample&cat=motivation_nudges&token=sample',
      }),
      type: 'react-template' as const,
    },
  ];
}

async function main() {
  console.log('='.repeat(72));
  console.log('  EMAIL REVIEW SAMPLE SENDER — Phase 19');
  console.log('  Recipient: ' + REVIEW_RECIPIENT);
  console.log('  Subject prefix: ' + SUBJECT_PREFIX);
  console.log('='.repeat(72));
  console.log();

  const renderOnly = !process.env.RESEND_API_KEY;
  if (renderOnly) {
    console.log('WARNING: RESEND_API_KEY not set. Running in RENDER-ONLY mode.');
    console.log('  Templates will be rendered and saved, but NOT sent.');
    console.log();
  }

  const resend = renderOnly ? null : new Resend(process.env.RESEND_API_KEY);
  const scenarios = getScenarios();
  const results: SendResult[] = [];

  // Ensure evidence directory exists
  fs.mkdirSync(EVIDENCE_DIR, { recursive: true });

  for (const scenario of scenarios) {
    const subject = SUBJECT_PREFIX + scenario.originalSubject;
    const timestamp = new Date().toISOString();
    const htmlFile = `${scenario.id}.html`;
    const htmlPath = path.join(EVIDENCE_DIR, htmlFile);

    console.log(`[${scenario.id}] ${scenario.name}`);
    console.log(`  Subject: ${subject}`);

    try {
      let html: string;
      let text: string | undefined;

      if (scenario.type === 'react-template') {
        // Render React Email template to HTML
        html = await render(scenario.reactElement);
        // Save rendered HTML
        fs.writeFileSync(htmlPath, html, 'utf-8');
        console.log(`  Rendered: ${htmlFile}`);
      } else {
        // Plain text scenario
        text = scenario.textBody;
        html = scenario.htmlBody ?? `<pre>${scenario.textBody}</pre>`;
        fs.writeFileSync(htmlPath, html, 'utf-8');
        console.log(`  Rendered: ${htmlFile}`);
      }

      if (renderOnly || !resend) {
        // Render-only mode — no sending
        console.log(`  STATUS: RENDERED_ONLY (no API key)`);
        results.push({
          scenario: scenario.name,
          id: scenario.id,
          subject,
          recipient: REVIEW_RECIPIENT,
          from: scenario.from,
          timestamp,
          status: 'rendered_only',
          htmlFile,
        });
      } else {
        // Send via Resend
        const sendPayload: Parameters<typeof resend.emails.send>[0] = {
          from: scenario.from,
          to: REVIEW_RECIPIENT,
          subject,
          ...(scenario.type === 'react-template' ? { html } : { html, text }),
        };

        const { data, error } = await resend.emails.send(sendPayload);

        if (error) {
          console.log(`  STATUS: FAILED — ${error.message}`);
          results.push({
            scenario: scenario.name,
            id: scenario.id,
            subject,
            recipient: REVIEW_RECIPIENT,
            from: scenario.from,
            timestamp,
            status: 'failed',
            error: error.message,
            htmlFile,
          });
        } else {
          console.log(`  STATUS: SENT — Resend ID: ${data?.id}`);
          results.push({
            scenario: scenario.name,
            id: scenario.id,
            subject,
            recipient: REVIEW_RECIPIENT,
            from: scenario.from,
            timestamp,
            status: 'sent',
            resendId: data?.id,
            htmlFile,
          });
        }
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      console.log(`  STATUS: FAILED — ${errMsg}`);
      results.push({
        scenario: scenario.name,
        id: scenario.id,
        subject,
        recipient: REVIEW_RECIPIENT,
        from: scenario.from,
        timestamp,
        status: 'failed',
        error: errMsg,
        htmlFile,
      });
    }

    console.log();
    // Small delay to avoid rate limiting
    await new Promise((r) => setTimeout(r, 500));
  }

  // Write send report (JSON)
  const reportJson = {
    generatedAt: new Date().toISOString(),
    recipient: REVIEW_RECIPIENT,
    subjectPrefix: SUBJECT_PREFIX,
    totalScenarios: results.length,
    sent: results.filter((r) => r.status === 'sent').length,
    renderedOnly: results.filter((r) => r.status === 'rendered_only').length,
    failed: results.filter((r) => r.status === 'failed').length,
    results,
  };
  fs.writeFileSync(
    path.join(EVIDENCE_DIR, 'send-report.json'),
    JSON.stringify(reportJson, null, 2),
    'utf-8'
  );

  // Write send report (Markdown)
  const md = [
    '# Email Review Sample Send Report',
    '',
    `**Date:** ${new Date().toISOString()}`,
    `**Recipient:** ${REVIEW_RECIPIENT}`,
    `**Subject prefix:** ${SUBJECT_PREFIX}`,
    '',
    `| # | Scenario | Status | Subject | Resend ID | HTML File |`,
    `|---|----------|--------|---------|-----------|-----------|`,
    ...results.map(
      (r, i) =>
        `| ${i + 1} | ${r.scenario} | ${r.status.toUpperCase()} | ${r.subject} | ${r.resendId ?? r.error ?? '—'} | ${r.htmlFile ?? '—'} |`
    ),
    '',
    '## Summary',
    '',
    `- **Sent:** ${reportJson.sent}`,
    `- **Rendered only:** ${reportJson.renderedOnly}`,
    `- **Failed:** ${reportJson.failed}`,
    `- **Total:** ${reportJson.totalScenarios}`,
  ].join('\n');
  fs.writeFileSync(path.join(EVIDENCE_DIR, 'send-report.md'), md, 'utf-8');

  // Print summary
  console.log('='.repeat(72));
  console.log('  SUMMARY');
  console.log('='.repeat(72));
  console.log(`  Total scenarios:  ${results.length}`);
  console.log(`  Sent:             ${reportJson.sent}`);
  console.log(`  Rendered only:    ${reportJson.renderedOnly}`);
  console.log(`  Failed:           ${reportJson.failed}`);
  console.log();
  console.log(`  Reports saved to: ${EVIDENCE_DIR}`);
  console.log('='.repeat(72));
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
