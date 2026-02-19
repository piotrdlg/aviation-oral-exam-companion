import { Text, Button, Link } from '@react-email/components';
import * as React from 'react';
import { EmailLayout } from './layout';

export function PaymentFailedEmail() {
  return (
    <EmailLayout preview="Action needed -- update your billing info for HeyDPE">
      <Text style={heading}>Payment failed</Text>

      <Text style={paragraph}>
        We were unable to process your payment for HeyDPE. Please update your
        billing information within 7 days to keep your subscription active.
      </Text>

      <Text style={warningBox}>
        If we can&apos;t process your payment, your subscription will be
        cancelled and you&apos;ll lose access to unlimited practice sessions.
      </Text>

      <Button href="https://heydpe.com/settings" style={ctaButton}>
        UPDATE BILLING
      </Button>

      <Text style={muted}>
        If you believe this is an error, please contact us at{' '}
        <Link href="mailto:support@heydpe.com" style={link}>
          support@heydpe.com
        </Link>
        .
      </Text>
    </EmailLayout>
  );
}

export default PaymentFailedEmail;

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

const warningBox: React.CSSProperties = {
  color: '#fbbf24',
  fontSize: '14px',
  lineHeight: '24px',
  backgroundColor: '#252525',
  borderLeft: '3px solid #f59e0b',
  borderRadius: '4px',
  padding: '12px 16px',
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
