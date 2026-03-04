import { Text, Link } from '@react-email/components';
import * as React from 'react';
import { EmailLayout } from './layout';

interface TicketAutoReplyProps {
  subject?: string;
}

export function TicketAutoReplyEmail({ subject }: TicketAutoReplyProps) {
  return (
    <EmailLayout preview="We received your message — HeyDPE Support">
      <Text style={greeting}>Hey there,</Text>

      <Text style={paragraph}>
        We received your message{subject ? ` regarding "${subject}"` : ''} and
        a member of our team will get back to you within 24 hours.
      </Text>

      <Text style={paragraph}>
        In the meantime, you might find answers in our{' '}
        <Link href="https://heydpe.com/help" style={link}>Help &amp; FAQ</Link>{' '}
        page.
      </Text>

      <Text style={paragraph}>
        Clear skies,
        <br />
        The HeyDPE Team
      </Text>
    </EmailLayout>
  );
}

export default TicketAutoReplyEmail;

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

const link: React.CSSProperties = {
  color: '#f59e0b',
  textDecoration: 'underline',
};
