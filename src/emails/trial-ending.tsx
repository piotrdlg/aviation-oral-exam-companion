import { Text, Button, Link } from '@react-email/components';
import * as React from 'react';
import { EmailLayout } from './layout';

interface TrialEndingProps {
  name?: string;
  daysLeft: number;
  plan: 'monthly' | 'annual';
}

export function TrialEndingEmail({ name, daysLeft, plan }: TrialEndingProps) {
  const planLabel = plan === 'annual' ? '$299/year' : '$39/month';
  return (
    <EmailLayout preview={`Your HeyDPE trial ends in ${daysLeft} day${daysLeft === 1 ? '' : 's'}`}>
      <Text style={greeting}>Hey {name || 'pilot'},</Text>

      <Text style={paragraph}>
        Your 7-day free trial ends in <strong>{daysLeft} day{daysLeft === 1 ? '' : 's'}</strong>.
        After that, your {plan} plan ({planLabel}) will begin.
      </Text>

      <Text style={paragraph}>
        If you want to keep practicing for your checkride, you don&apos;t need to do anything —
        your subscription will start automatically.
      </Text>

      <Text style={paragraph}>
        If you&apos;d like to cancel or change your plan, you can do that anytime from your{' '}
        <Link href="https://heydpe.com/settings" style={link}>Settings page</Link>.
      </Text>

      <Button href="https://heydpe.com/practice" style={ctaButton}>
        KEEP PRACTICING
      </Button>

      <Text style={muted}>
        No surprises — cancel before your trial ends and you won&apos;t be charged.
      </Text>

      <Text style={paragraph}>
        Clear skies,
        <br />
        The HeyDPE Team
      </Text>
    </EmailLayout>
  );
}

export default TrialEndingEmail;

const greeting: React.CSSProperties = {
  color: '#e5e5e5',
  fontSize: '16px',
  lineHeight: '24px',
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
  margin: '0 0 16px',
};

const link: React.CSSProperties = {
  color: '#f59e0b',
  textDecoration: 'underline',
};
