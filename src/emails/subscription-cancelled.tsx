import { Text, Button, Link } from '@react-email/components';
import * as React from 'react';
import { EmailLayout } from './layout';

export function SubscriptionCancelledEmail() {
  return (
    <EmailLayout preview="Your HeyDPE subscription has been cancelled">
      <Text style={heading}>Your subscription has been cancelled</Text>

      <Text style={paragraph}>
        Your HeyDPE subscription has been cancelled. You&apos;ll continue to
        have full access until the end of your current billing period.
      </Text>

      <Text style={paragraph}>
        After that, you can still use HeyDPE with the free tier (3 sessions).
        If you change your mind, you can resubscribe anytime.
      </Text>

      <Button href="https://heydpe.com/pricing" style={ctaButton}>
        VIEW PRICING
      </Button>

      <Text style={muted}>
        We&apos;d love to hear why you cancelled.{' '}
        <Link href="mailto:feedback@heydpe.com" style={link}>
          Send us feedback
        </Link>{' '}
        — it helps us improve.
      </Text>
    </EmailLayout>
  );
}

export default SubscriptionCancelledEmail;

// --- Styles ---

const heading: React.CSSProperties = {
  color: '#e5e5e5',
  fontSize: '20px',
  fontWeight: 600,
  lineHeight: '28px',
  margin: '0 0 16px',
};

const paragraph: React.CSSProperties = {
  color: '#e5e5e5',
  fontSize: '14px',
  lineHeight: '24px',
  margin: '0 0 16px',
};

const ctaButton: React.CSSProperties = {
  backgroundColor: '#f59e0b',
  color: '#0a0a0a',
  fontSize: '14px',
  fontWeight: 600,
  textDecoration: 'none',
  textAlign: 'center' as const,
  display: 'block',
  borderRadius: '6px',
  padding: '12px 24px',
  margin: '24px 0',
};

const muted: React.CSSProperties = {
  color: '#737373',
  fontSize: '13px',
  lineHeight: '20px',
  margin: 0,
};

const link: React.CSSProperties = {
  color: '#f59e0b',
  textDecoration: 'underline',
};
