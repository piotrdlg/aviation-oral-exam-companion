'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';

/**
 * Temporary staging-only login page that supports password auth.
 * DELETE THIS FILE after staging smoke test is complete.
 */
export default function StagingAuthPage() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const supabase = createClient();

  async function handleLogin() {
    setLoading(true);
    setError(null);

    const { error } = await supabase.auth.signInWithPassword({
      email: 'staging-test@heydpe.com',
      password: 'StagingTest2026x',
    });

    if (error) {
      setError(error.message);
      setLoading(false);
    } else {
      router.push('/home');
      router.refresh();
    }
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0a0a0a', color: '#fff', fontFamily: 'monospace' }}>
      <div style={{ textAlign: 'center', maxWidth: 400 }}>
        <h1 style={{ color: '#f59e0b', marginBottom: 8 }}>STAGING AUTH</h1>
        <p style={{ color: '#888', fontSize: 14, marginBottom: 24 }}>Temporary login for smoke testing. Delete this page after.</p>

        {error && <p style={{ color: '#ef4444', marginBottom: 16 }}>{error}</p>}

        <button
          onClick={handleLogin}
          disabled={loading}
          style={{
            padding: '12px 32px',
            background: loading ? '#78350f' : '#f59e0b',
            color: '#0a0a0a',
            border: 'none',
            borderRadius: 8,
            fontWeight: 'bold',
            fontSize: 14,
            cursor: loading ? 'wait' : 'pointer',
            fontFamily: 'monospace',
          }}
        >
          {loading ? 'SIGNING IN...' : 'SIGN IN AS TEST PILOT'}
        </button>

        <p style={{ color: '#555', fontSize: 12, marginTop: 16 }}>staging-test@heydpe.com</p>
      </div>
    </div>
  );
}
