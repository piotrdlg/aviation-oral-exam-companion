import {
  Text,
  Section,
  Hr,
  Link,
  Button,
} from '@react-email/components';
import * as React from 'react';
import { EmailLayout } from './layout';

export interface InstructorInviteEmailProps {
  instructorName: string;
  certType: string | null;
  inviteUrl: string;
}

export function InstructorInviteEmail(props: InstructorInviteEmailProps) {
  const { instructorName, certType, inviteUrl } = props;

  const certLabel = certType ? ` (${certType})` : '';

  return (
    <EmailLayout preview={`${instructorName} invited you to HeyDPE`}>
      {/* Heading */}
      <Text style={heading}>You&apos;ve been invited to HeyDPE</Text>

      {/* Body */}
      <Text style={paragraph}>
        <strong>{instructorName}</strong>, a certified flight instructor{certLabel}, has invited
        you to connect on HeyDPE.
      </Text>

      <Text style={paragraph}>
        HeyDPE is an AI-powered oral exam practice tool that helps you prepare for your FAA
        checkride. By accepting this invitation, your instructor will be able to monitor your
        study progress and provide targeted guidance.
      </Text>

      {/* CTA */}
      <Section style={ctaSection}>
        <Button href={inviteUrl} style={ctaButton}>
          ACCEPT INVITATION
        </Button>
      </Section>

      {/* Disclaimer */}
      <Hr style={divider} />
      <Text style={disclaimer}>
        HeyDPE is an AI practice tool. Your instructor remains responsible for flight training.
        This invitation does not constitute an endorsement or guarantee of checkride readiness.
      </Text>

      {/* Ignore notice */}
      <Text style={ignoreText}>
        If you didn&apos;t expect this invitation, you can safely ignore this email or contact{' '}
        <Link href="mailto:support@heydpe.com" style={supportLink}>
          support@heydpe.com
        </Link>
        .
      </Text>
    </EmailLayout>
  );
}

export default InstructorInviteEmail;

// ============================================================
// Styles
// ============================================================

const heading: React.CSSProperties = {
  color: '#e5e5e5',
  fontSize: '20px',
  fontWeight: 700,
  lineHeight: '28px',
  margin: '0 0 16px',
};

const paragraph: React.CSSProperties = {
  color: '#e5e5e5',
  fontSize: '14px',
  lineHeight: '24px',
  margin: '0 0 16px',
};

const ctaSection: React.CSSProperties = {
  textAlign: 'center' as const,
  margin: '24px 0',
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
};

const divider: React.CSSProperties = {
  borderColor: '#2a2a2a',
  margin: '20px 0',
};

const disclaimer: React.CSSProperties = {
  color: '#737373',
  fontSize: '12px',
  lineHeight: '18px',
  margin: '0 0 12px',
};

const ignoreText: React.CSSProperties = {
  color: '#525252',
  fontSize: '11px',
  lineHeight: '18px',
  margin: '0',
};

const supportLink: React.CSSProperties = {
  color: '#525252',
  textDecoration: 'underline',
};
