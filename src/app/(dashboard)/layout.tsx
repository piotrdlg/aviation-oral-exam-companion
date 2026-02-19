'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { getStoredUTMParams } from '@/lib/utm';

const navItems = [
  { href: '/practice', label: 'Practice' },
  { href: '/progress', label: 'Progress' },
  { href: '/settings', label: 'Settings' },
];

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    async function checkAdmin() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase
        .from('admin_users')
        .select('user_id')
        .eq('user_id', user.id)
        .maybeSingle();
      setIsAdmin(!!data);

      // Persist UTM params from sessionStorage to user metadata (OAuth return flow)
      const utm = getStoredUTMParams();
      if (utm) {
        supabase.auth.updateUser({ data: { utm } }).catch(() => {});
        try { sessionStorage.removeItem('heydpe_utm'); } catch {}
      }
    }
    checkAdmin();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleSignOut() {
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  }

  return (
    <div className="min-h-screen bg-c-bg">
      <nav className="border-b border-c-border bg-c-bg/80 backdrop-blur-lg">
        <div className="max-w-5xl mx-auto px-4 flex items-center justify-between h-14">
          <div className="flex items-center gap-6">
            <Link href="/practice" className="font-mono font-bold text-c-amber glow-a text-base tracking-widest">
              HEYDPE
            </Link>
            <div className="flex gap-1">
              {navItems.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`px-3 py-1.5 rounded-md font-mono text-sm tracking-wide uppercase transition-colors ${
                    pathname === item.href
                      ? 'text-c-amber'
                      : 'text-c-muted hover:text-c-amber'
                  }`}
                >
                  {item.label}
                </Link>
              ))}
              {isAdmin && (
                <Link
                  href="/admin"
                  className={`px-3 py-1.5 rounded-md font-mono text-sm tracking-wide uppercase transition-colors ${
                    pathname.startsWith('/admin')
                      ? 'text-c-amber'
                      : 'text-c-amber/80 hover:text-c-amber'
                  }`}
                >
                  Admin
                </Link>
              )}
            </div>
          </div>
          <button
            onClick={handleSignOut}
            className="font-mono text-sm text-c-muted hover:text-c-amber tracking-wide uppercase transition-colors"
          >
            Sign Out
          </button>
        </div>
      </nav>
      <main className="max-w-5xl mx-auto px-4 py-8">
        {children}
      </main>
    </div>
  );
}
