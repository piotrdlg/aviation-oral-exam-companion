import {
  Html,
  Head,
  Body,
  Container,
  Section,
  Text,
  Link,
  Hr,
  Preview,
} from '@react-email/components';
import * as React from 'react';

interface EmailLayoutProps {
  children: React.ReactNode;
  preview?: string;
}

export function EmailLayout({ children, preview }: EmailLayoutProps) {
  return (
    <Html lang="en">
      <Head />
      {preview && <Preview>{preview}</Preview>}
      <Body style={body}>
        <Container style={container}>
          {/* Header */}
          <Section style={header}>
            <Text style={logo}>HEYDPE</Text>
          </Section>

          {/* Content */}
          <Section style={content}>{children}</Section>

          {/* Footer */}
          <Hr style={divider} />
          <Section style={footer}>
            <Text style={footerText}>
              Imagine Flying LLC &middot; Jacksonville, FL
            </Text>
            <Text style={footerLinks}>
              <Link href="https://heydpe.com/privacy" style={footerLink}>
                Privacy Policy
              </Link>
              {' \u00B7 '}
              <Link href="https://heydpe.com/terms" style={footerLink}>
                Terms of Service
              </Link>
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

// --- Styles ---

const body: React.CSSProperties = {
  backgroundColor: '#0a0a0a',
  fontFamily:
    "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
  margin: 0,
  padding: 0,
};

const container: React.CSSProperties = {
  maxWidth: '600px',
  margin: '0 auto',
  padding: '40px 20px',
};

const header: React.CSSProperties = {
  textAlign: 'center' as const,
  paddingBottom: '24px',
};

const logo: React.CSSProperties = {
  color: '#f59e0b',
  fontSize: '20px',
  fontWeight: 700,
  letterSpacing: '0.1em',
  textTransform: 'uppercase' as const,
  margin: 0,
};

const content: React.CSSProperties = {
  backgroundColor: '#1a1a1a',
  borderRadius: '8px',
  padding: '32px 24px',
};

const divider: React.CSSProperties = {
  borderColor: '#2a2a2a',
  margin: '32px 0 16px',
};

const footer: React.CSSProperties = {
  textAlign: 'center' as const,
  padding: '0 20px',
};

const footerText: React.CSSProperties = {
  color: '#737373',
  fontSize: '12px',
  lineHeight: '20px',
  margin: '0 0 4px',
};

const footerLinks: React.CSSProperties = {
  color: '#737373',
  fontSize: '12px',
  lineHeight: '20px',
  margin: 0,
};

const footerLink: React.CSSProperties = {
  color: '#737373',
  textDecoration: 'underline',
};
