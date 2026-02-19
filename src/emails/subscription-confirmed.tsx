import { Text, Button } from '@react-email/components';
import * as React from 'react';
import { EmailLayout } from './layout';

interface SubscriptionConfirmedEmailProps {
  plan: 'monthly' | 'annual';
}

const PLAN_DETAILS = {
  monthly: '$39/month, renews automatically',
  annual: '$299/year ($24.92/month), renews automatically',
} as const;

export function SubscriptionConfirmedEmail({
  plan,
}: SubscriptionConfirmedEmailProps) {
  return (
    <EmailLayout preview="Your HeyDPE subscription is now active">
      <Text style={heading}>Your subscription is active</Text>

      <Text style={paragraph}>
        You now have unlimited access to HeyDPE. Your AI-powered DPE is ready
        whenever you are.
      </Text>

      <Text style={planBox}>
        <strong>Plan:</strong> {plan === 'monthly' ? 'Monthly' : 'Annual'}
        <br />
        <strong>Billing:</strong> {PLAN_DETAILS[plan]}
      </Text>

      <Text style={paragraph}>
        Your subscription includes unlimited practice sessions, full ACS
        coverage across all ratings, and detailed progress tracking.
      </Text>

      <Button href="https://heydpe.com/practice" style={ctaButton}>
        GO TO PRACTICE
      </Button>

      <Text style={muted}>
        You can manage your subscription anytime from your account settings.
      </Text>
    </EmailLayout>
  );
}

export default SubscriptionConfirmedEmail;

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

const planBox: React.CSSProperties = {
  color: '#e5e5e5',
  fontSize: '14px',
  lineHeight: '24px',
  backgroundColor: '#252525',
  borderRadius: '6px',
  padding: '16px',
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
