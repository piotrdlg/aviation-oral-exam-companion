import {
  Text,
  Section,
  Row,
  Column,
  Hr,
  Link,
  Button,
} from '@react-email/components';
import * as React from 'react';
import { EmailLayout } from './layout';

export interface StudentEmailSummary {
  displayName: string;
  readinessScore: number | null;
  readinessTrend: string; // 'improving' | 'declining' | 'stable' | 'insufficient_data'
  sessionsThisWeek: number;
  needsAttention: boolean;
  needsAttentionReasons: string[];
  milestoneCompleted: string | null; // most recent milestone label or null
}

export interface InstructorWeeklySummaryProps {
  instructorName: string;
  weekLabel: string; // e.g. "Mar 3-9, 2026"
  totalStudents: number;
  activeStudents: number; // active in last 7 days
  needsAttentionCount: number;
  students: StudentEmailSummary[];
  unsubscribeUrl: string;
  referralCode?: string;
  referralLink?: string;
  qrUrl?: string;
}

function getReadinessColor(score: number | null): string {
  if (score === null) return '#737373';
  if (score >= 70) return '#22c55e';
  if (score >= 50) return '#f59e0b';
  return '#ef4444';
}

function getTrendIndicator(trend: string): { text: string; color: string } | null {
  switch (trend) {
    case 'improving':
      return { text: '\u2191 Improving', color: '#22c55e' };
    case 'declining':
      return { text: '\u2193 Declining', color: '#ef4444' };
    case 'stable':
      return { text: '\u2192 Stable', color: '#737373' };
    default:
      return null;
  }
}

export function InstructorWeeklySummaryEmail(props: InstructorWeeklySummaryProps) {
  const {
    instructorName,
    weekLabel,
    totalStudents,
    activeStudents,
    needsAttentionCount,
    students,
    unsubscribeUrl,
    referralLink,
    qrUrl,
  } = props;

  return (
    <EmailLayout preview="Your weekly instructor summary">
      {/* Greeting */}
      <Text style={greetingStyle}>Hello, {instructorName}</Text>
      <Text style={subtitle}>Week of {weekLabel}</Text>

      {totalStudents > 0 ? (
        <>
          {/* Stats row */}
          <Section style={statsRow}>
            <Row>
              <Column style={statCell}>
                <Text style={statNumber}>{totalStudents}</Text>
                <Text style={statLabel}>Total Students</Text>
              </Column>
              <Column style={statCell}>
                <Text style={statNumber}>{activeStudents}</Text>
                <Text style={statLabel}>Active (7d)</Text>
              </Column>
              <Column style={statCell}>
                <Text style={{
                  ...statNumber,
                  color: needsAttentionCount > 0 ? '#ef4444' : '#f59e0b',
                }}>
                  {needsAttentionCount}
                </Text>
                <Text style={statLabel}>Needs Attention</Text>
              </Column>
            </Row>
          </Section>

          <Hr style={sectionDivider} />

          {/* Student summaries */}
          <Text style={sectionTitle}>Student Summaries</Text>
          {students.map((student) => {
            const readinessColor = getReadinessColor(student.readinessScore);
            const trend = getTrendIndicator(student.readinessTrend);

            return (
              <Section key={student.displayName} style={studentCard}>
                {/* Student name */}
                <Text style={studentName}>{student.displayName}</Text>

                {/* Readiness score + trend */}
                <Text style={studentMeta}>
                  <span style={{ color: readinessColor, fontWeight: 700 }}>
                    {student.readinessScore !== null
                      ? `${student.readinessScore}% ready`
                      : 'No score yet'}
                  </span>
                  {trend && (
                    <span style={{ color: trend.color, marginLeft: '8px' }}>
                      {trend.text}
                    </span>
                  )}
                </Text>

                {/* Sessions count */}
                <Text style={studentSessions}>
                  {student.sessionsThisWeek} session{student.sessionsThisWeek === 1 ? '' : 's'} this week
                </Text>

                {/* Needs attention reasons */}
                {student.needsAttention && student.needsAttentionReasons.length > 0 && (
                  <>
                    {student.needsAttentionReasons.map((reason, i) => (
                      <Text key={i} style={attentionReason}>
                        {reason}
                      </Text>
                    ))}
                  </>
                )}

                {/* Milestone completed */}
                {student.milestoneCompleted && (
                  <Text style={milestoneText}>
                    &#10003; {student.milestoneCompleted}
                  </Text>
                )}
              </Section>
            );
          })}

          {/* CTA */}
          <Button href="https://heydpe.com/instructor" style={ctaButton}>
            OPEN COMMAND CENTER
          </Button>
        </>
      ) : (
        <>
          {/* Referral CTA for instructors with 0 connected students */}
          <Hr style={sectionDivider} />

          <Text style={referralHeading}>Get Started with Student Connections</Text>
          <Text style={referralIntro}>
            Connect with your students on HeyDPE in three simple steps:
          </Text>

          <Section style={stepCard}>
            <Text style={stepNumber}>1</Text>
            <Text style={stepText}>Share your referral link with students</Text>
          </Section>
          <Section style={stepCard}>
            <Text style={stepNumber}>2</Text>
            <Text style={stepText}>Students click the link and sign up</Text>
          </Section>
          <Section style={stepCard}>
            <Text style={stepNumber}>3</Text>
            <Text style={stepText}>Once a student subscribes, you unlock courtesy access</Text>
          </Section>

          {referralLink && (
            <Section style={referralLinkBox}>
              <Text style={referralLinkLabel}>Your referral link:</Text>
              <Link href={referralLink} style={referralLinkValue}>
                {referralLink}
              </Link>
            </Section>
          )}

          {referralLink && (
            <Button href={referralLink} style={ctaButton}>
              COPY REFERRAL LINK
            </Button>
          )}

          {qrUrl && (
            <Text style={qrDownload}>
              <Link href={qrUrl} style={qrDownloadLink}>
                Download QR Code
              </Link>
              {' \u2014 Print or share with students'}
            </Text>
          )}

          <Hr style={sectionDivider} />

          <Text style={disclaimerText}>
            Courtesy access (Checkride Prep tier) is automatically granted when at least one of
            your connected students has an active paid subscription.
          </Text>
        </>
      )}

      {/* Sign-off */}
      <Text style={paragraph}>
        Clear skies,
        <br />
        The HeyDPE Team
      </Text>

      {/* Unsubscribe */}
      <Hr style={sectionDivider} />
      <Text style={unsubscribeText}>
        You&apos;re receiving this because you have instructor summaries enabled.{' '}
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

export default InstructorWeeklySummaryEmail;

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
  width: '33.33%',
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

const studentCard: React.CSSProperties = {
  backgroundColor: '#141414',
  borderRadius: '6px',
  padding: '12px 16px',
  marginBottom: '8px',
};

const studentName: React.CSSProperties = {
  color: '#e5e5e5',
  fontSize: '14px',
  fontWeight: 600,
  lineHeight: '20px',
  margin: '0 0 4px',
};

const studentMeta: React.CSSProperties = {
  fontSize: '13px',
  lineHeight: '20px',
  margin: '0 0 2px',
};

const studentSessions: React.CSSProperties = {
  color: '#a3a3a3',
  fontSize: '12px',
  lineHeight: '16px',
  margin: '0 0 4px',
};

const attentionReason: React.CSSProperties = {
  color: '#ef4444',
  fontSize: '12px',
  lineHeight: '18px',
  margin: '0 0 2px',
};

const milestoneText: React.CSSProperties = {
  color: '#22c55e',
  fontSize: '12px',
  lineHeight: '18px',
  margin: '4px 0 0',
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

// Referral CTA styles (0-students variant)

const referralHeading: React.CSSProperties = {
  color: '#f59e0b',
  fontSize: '16px',
  fontWeight: 700,
  lineHeight: '24px',
  margin: '0 0 8px',
  textAlign: 'center' as const,
};

const referralIntro: React.CSSProperties = {
  color: '#a3a3a3',
  fontSize: '14px',
  lineHeight: '22px',
  margin: '0 0 16px',
  textAlign: 'center' as const,
};

const stepCard: React.CSSProperties = {
  backgroundColor: '#141414',
  borderRadius: '6px',
  padding: '10px 16px',
  marginBottom: '6px',
};

const stepNumber: React.CSSProperties = {
  color: '#f59e0b',
  fontSize: '14px',
  fontWeight: 700,
  lineHeight: '20px',
  margin: '0 0 2px',
  display: 'inline',
};

const stepText: React.CSSProperties = {
  color: '#e5e5e5',
  fontSize: '13px',
  lineHeight: '20px',
  margin: '0',
  display: 'inline',
  marginLeft: '8px',
};

const referralLinkBox: React.CSSProperties = {
  backgroundColor: '#141414',
  borderRadius: '6px',
  padding: '12px 16px',
  marginTop: '16px',
  marginBottom: '0',
  textAlign: 'center' as const,
};

const referralLinkLabel: React.CSSProperties = {
  color: '#a3a3a3',
  fontSize: '11px',
  lineHeight: '16px',
  margin: '0 0 4px',
  textTransform: 'uppercase' as const,
  letterSpacing: '0.05em',
};

const referralLinkValue: React.CSSProperties = {
  color: '#60a5fa',
  fontSize: '13px',
  lineHeight: '20px',
  textDecoration: 'underline',
  wordBreak: 'break-all' as const,
};

const qrDownload: React.CSSProperties = {
  color: '#a3a3a3',
  fontSize: '12px',
  lineHeight: '18px',
  margin: '0 0 8px',
  textAlign: 'center' as const,
};

const qrDownloadLink: React.CSSProperties = {
  color: '#60a5fa',
  textDecoration: 'underline',
};

const disclaimerText: React.CSSProperties = {
  color: '#525252',
  fontSize: '11px',
  lineHeight: '16px',
  margin: '0',
  textAlign: 'center' as const,
  fontStyle: 'italic',
};
