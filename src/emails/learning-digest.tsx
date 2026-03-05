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
import type { DigestData } from '@/lib/digest-builder';

type LearningDigestProps = DigestData;

export function LearningDigestEmail(props: LearningDigestProps) {
  const {
    displayName,
    weakAreas,
    strongAreas,
    recommendations,
    recentSessionCount,
    totalExchanges,
    unsubscribeUrl,
  } = props;

  const greeting = displayName
    ? `Good morning, ${displayName}`
    : 'Good morning';

  return (
    <EmailLayout preview="Your daily HeyDPE study briefing is ready">
      {/* Greeting */}
      <Text style={greetingStyle}>{greeting}</Text>
      <Text style={subtitle}>Here&apos;s your daily study briefing</Text>

      {/* Stats row */}
      <Section style={statsRow}>
        <Row>
          <Column style={statCell}>
            <Text style={statNumber}>{recentSessionCount}</Text>
            <Text style={statLabel}>sessions this week</Text>
          </Column>
          <Column style={statCell}>
            <Text style={statNumber}>{totalExchanges}</Text>
            <Text style={statLabel}>exchanges</Text>
          </Column>
        </Row>
      </Section>

      <Hr style={sectionDivider} />

      {/* Weak areas */}
      {weakAreas.length > 0 && (
        <>
          <Text style={sectionTitle}>Areas to Focus On</Text>
          {weakAreas.map((area) => (
            <Section key={area.elementCode} style={areaCard}>
              <Text style={areaCode}>{area.elementCode}</Text>
              <Text style={areaDescription}>{area.description}</Text>
              <Text style={areaContext}>{area.area}</Text>
              {/* Progress bar */}
              <Section style={progressBarContainer}>
                <Section
                  style={{
                    ...progressBarFill,
                    width: `${Math.max(Math.round(area.satisfactoryRate), 4)}%`,
                    backgroundColor:
                      area.satisfactoryRate < 40
                        ? '#ef4444'
                        : area.satisfactoryRate < 60
                          ? '#f59e0b'
                          : '#eab308',
                  }}
                />
              </Section>
              <Text style={areaStats}>
                {Math.round(area.satisfactoryRate)}% satisfactory &middot;{' '}
                {area.totalAttempts} attempt{area.totalAttempts === 1 ? '' : 's'}
                {area.latestScore && (
                  <> &middot; Latest: {area.latestScore}</>
                )}
              </Text>
            </Section>
          ))}

          <Hr style={sectionDivider} />
        </>
      )}

      {/* Strong areas */}
      {strongAreas.length > 0 && (
        <>
          <Text style={sectionTitle}>Your Strengths</Text>
          {strongAreas.map((area) => (
            <Section key={area.elementCode} style={strengthRow}>
              <Text style={strengthText}>
                <span style={strengthCheck}>&#10003;</span>{' '}
                {area.description}{' '}
                <span style={strengthRate}>
                  {Math.round(area.satisfactoryRate)}%
                </span>
              </Text>
            </Section>
          ))}

          <Hr style={sectionDivider} />
        </>
      )}

      {/* Recommendations */}
      {recommendations.length > 0 && (
        <>
          <Text style={sectionTitle}>
            Today&apos;s Recommendation{recommendations.length > 1 ? 's' : ''}
          </Text>
          {recommendations.map((rec, i) => (
            <Text key={i} style={recommendation}>
              {rec}
            </Text>
          ))}
        </>
      )}

      {/* CTA */}
      <Button href="https://heydpe.com/practice" style={ctaButton}>
        START PRACTICING
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
        You&apos;re receiving this because you have study briefings enabled.{' '}
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

export default LearningDigestEmail;

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

const subtitle: React.CSSProperties = {
  color: '#a3a3a3',
  fontSize: '14px',
  lineHeight: '20px',
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

const sectionDivider: React.CSSProperties = {
  borderColor: '#2a2a2a',
  margin: '20px 0',
};

const sectionTitle: React.CSSProperties = {
  color: '#f59e0b',
  fontSize: '13px',
  fontWeight: 700,
  lineHeight: '20px',
  margin: '0 0 12px',
  textTransform: 'uppercase' as const,
  letterSpacing: '0.05em',
};

const areaCard: React.CSSProperties = {
  backgroundColor: '#141414',
  borderRadius: '6px',
  padding: '12px 16px',
  marginBottom: '8px',
};

const areaCode: React.CSSProperties = {
  color: '#737373',
  fontSize: '11px',
  fontFamily: 'monospace',
  lineHeight: '16px',
  margin: '0 0 2px',
};

const areaDescription: React.CSSProperties = {
  color: '#e5e5e5',
  fontSize: '14px',
  fontWeight: 600,
  lineHeight: '20px',
  margin: '0 0 2px',
};

const areaContext: React.CSSProperties = {
  color: '#a3a3a3',
  fontSize: '12px',
  lineHeight: '16px',
  margin: '0 0 8px',
};

const progressBarContainer: React.CSSProperties = {
  backgroundColor: '#2a2a2a',
  borderRadius: '4px',
  height: '6px',
  margin: '0 0 6px',
  overflow: 'hidden' as const,
};

const progressBarFill: React.CSSProperties = {
  borderRadius: '4px',
  height: '6px',
};

const areaStats: React.CSSProperties = {
  color: '#737373',
  fontSize: '11px',
  lineHeight: '16px',
  margin: '0',
};

const strengthRow: React.CSSProperties = {
  marginBottom: '6px',
};

const strengthText: React.CSSProperties = {
  color: '#e5e5e5',
  fontSize: '14px',
  lineHeight: '22px',
  margin: '0',
};

const strengthCheck: React.CSSProperties = {
  color: '#22c55e',
  fontWeight: 700,
};

const strengthRate: React.CSSProperties = {
  color: '#22c55e',
  fontSize: '12px',
  fontWeight: 600,
};

const recommendation: React.CSSProperties = {
  color: '#d4d4d4',
  fontSize: '14px',
  lineHeight: '22px',
  margin: '0 0 8px',
  paddingLeft: '12px',
  borderLeft: '2px solid #f59e0b',
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
