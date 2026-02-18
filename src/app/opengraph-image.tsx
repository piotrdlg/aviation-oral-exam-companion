import { ImageResponse } from 'next/og';

export const runtime = 'edge';
export const alt = 'HeyDPE — AI Checkride Oral Exam Simulator';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default async function Image() {
  return new ImageResponse(
    (
      <div style={{
        background: '#0a0a0f',
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: 'monospace',
      }}>
        <div style={{ fontSize: 72, fontWeight: 800, color: '#f59e0b', marginBottom: 16 }}>
          HEYDPE
        </div>
        <div style={{ fontSize: 32, color: '#e5e5e5', marginBottom: 24, textAlign: 'center' }}>
          Your DPE Is Ready When You Are
        </div>
        <div style={{ fontSize: 18, color: '#a3a3a3', marginBottom: 40 }}>
          Voice-first AI checkride oral exam simulator
        </div>
        <div style={{ display: 'flex', gap: 16 }}>
          {['PPL', 'CPL', 'IR'].map((badge) => (
            <div key={badge} style={{
              padding: '8px 24px',
              border: '2px solid #f59e0b',
              borderRadius: 8,
              color: '#f59e0b',
              fontSize: 20,
              fontWeight: 700,
            }}>
              {badge}
            </div>
          ))}
        </div>
      </div>
    ),
    { ...size }
  );
}
