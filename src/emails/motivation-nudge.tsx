import {
  Text,
  Button,
  Link,
  Section,
  Row,
  Column,
  Hr,
} from '@react-email/components';
import * as React from 'react';
import { EmailLayout } from './layout';

// ============================================================
// Props
// ============================================================

interface MotivationNudgeEmailProps {
  name?: string;
  heading: string;
  body: string;
  ctaText: string;
  daysSinceLastSession: number;
  totalSessions: number;
  unsubscribeUrl: string;
}

// ============================================================
// Component
// ============================================================

export function MotivationNudgeEmail(props: MotivationNudgeEmailProps) {
  const {
    name,
    heading,
    body,
    ctaText,
    daysSinceLastSession,
    totalSessions,
    unsubscribeUrl,
  } = props;

  const greeting = name ? `Hey ${name},` : 'Hey there,';

  return (
    <EmailLayout preview={heading}>
      {/* Greeting */}
      <Text style={greetingStyle}>{greeting}</Text>

      {/* Heading */}
      <Text style={headingStyle}>{heading}</Text>

      {/* Body */}
      <Text style={bodyStyle}>{body}</Text>

      {/* Stats row */}
      <Section style={statsRow}>
        <Row>
          <Column style={statCell}>
            <Text style={statNumber}>{daysSinceLastSession}</Text>
            <Text style={statLabel}>
              day{daysSinceLastSession === 1 ? '' : 's'} since last session
            </Text>
          </Column>
          <Column style={statCell}>
            <Text style={statNumber}>{totalSessions}</Text>
            <Text style={statLabel}>
              session{totalSessions === 1 ? '' : 's'} completed
            </Text>
          </Column>
        </Row>
      </Section>

      {/* CTA */}
      <Button href="https://heydpe.com/practice" style={ctaButton}>
        {ctaText}
      </Button>

      {/* Sign-off */}
      <Text style={paragraph}>
        Clear skies,
        <br />
        The HeyDPE Team
      </Text>

      {/* Unsubscribe */}
      <Hr style={sectionDivider} />
      <Text style={unsubscribeText}>
        You&apos;re receiving this because you have motivation nudges enabled.{' '}
        <Link href={unsubscribeUrl} style={unsubscribeLink}>
          Unsubscribe
        </Link>
        {' or '}
        <Link href="https://heydpe.com/settings" style={unsubscribeLink}>
          manage email preferences
        </Link>
        .
      </Text>
    </EmailLayout>
  );
}

export default MotivationNudgeEmail;

// ============================================================
// Styles
// ============================================================

const greetingStyle: React.CSSProperties = {
  color: '#e5e5e5',
  fontSize: '18px',
  fontWeight: 600,
  lineHeight: '28px',
  margin: '0 0 4px',
};

const headingStyle: React.CSSProperties = {
  color: '#f59e0b',
  fontSize: '20px',
  fontWeight: 700,
  lineHeight: '28px',
  margin: '0 0 16px',
};

const bodyStyle: React.CSSProperties = {
  color: '#d4d4d4',
  fontSize: '14px',
  lineHeight: '24px',
  margin: '0 0 24px',
};

const statsRow: React.CSSProperties = {
  backgroundColor: '#141414',
  borderRadius: '6px',
  padding: '16px',
  marginBottom: '0',
};

const statCell: React.CSSProperties = {
  textAlign: 'center' as const,
  width: '50%',
};

const statNumber: React.CSSProperties = {
  color: '#f59e0b',
  fontSize: '24px',
  fontWeight: 700,
  lineHeight: '32px',
  margin: '0',
};

const statLabel: React.CSSProperties = {
  color: '#a3a3a3',
  fontSize: '12px',
  lineHeight: '16px',
  margin: '0',
  textTransform: 'uppercase' as const,
  letterSpacing: '0.05em',
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

const paragraph: React.CSSProperties = {
  color: '#e5e5e5',
  fontSize: '14px',
  lineHeight: '24px',
  margin: '0 0 16px',
};

const sectionDivider: React.CSSProperties = {
  borderColor: '#2a2a2a',
  margin: '20px 0',
};

const unsubscribeText: React.CSSProperties = {
  color: '#525252',
  fontSize: '11px',
  lineHeight: '18px',
  margin: '0',
  textAlign: 'center' as const,
};

const unsubscribeLink: React.CSSProperties = {
  color: '#525252',
  textDecoration: 'underline',
};
