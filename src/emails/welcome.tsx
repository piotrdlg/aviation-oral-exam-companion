import { Text, Button, Link } from '@react-email/components';
import * as React from 'react';
import { EmailLayout } from './layout';

interface WelcomeEmailProps {
  name?: string;
}

export function WelcomeEmail({ name }: WelcomeEmailProps) {
  return (
    <EmailLayout preview="Practice your checkride oral exam with an AI-powered DPE">
      <Text style={greeting}>Hey {name || 'pilot'},</Text>

      <Text style={paragraph}>
        Welcome to HeyDPE. You now have access to an AI-powered DPE
        that&apos;s available 24/7 to help you prepare for your checkride oral
        exam.
      </Text>

      <Text style={paragraph}>Here&apos;s what you can do:</Text>

      <Text style={listItem}>
        &bull; Practice with 143+ ACS tasks across PPL, CPL, and IR
      </Text>
      <Text style={listItem}>
        &bull; Get scored on every answer (satisfactory, partial, unsatisfactory)
      </Text>
      <Text style={listItem}>
        &bull; Track your progress and identify weak areas
      </Text>

      <Button href="https://heydpe.com/practice" style={ctaButton}>
        START YOUR FIRST SESSION
      </Button>

      <Text style={muted}>
        You have 3 free practice sessions. After that, plans start at $39/month.
      </Text>

      <Text style={paragraph}>
        Questions? Reply to this email or reach us at{' '}
        <Link href="mailto:support@heydpe.com" style={link}>
          support@heydpe.com
        </Link>
        .
      </Text>

      <Text style={paragraph}>
        Clear skies,
        <br />
        The HeyDPE Team
      </Text>
    </EmailLayout>
  );
}

export default WelcomeEmail;

// --- Styles ---

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

const listItem: React.CSSProperties = {
  color: '#e5e5e5',
  fontSize: '14px',
  lineHeight: '24px',
  margin: '0 0 4px',
  paddingLeft: '8px',
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
