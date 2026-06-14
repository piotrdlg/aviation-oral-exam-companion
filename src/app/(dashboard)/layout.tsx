'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { getStoredUTMParams } from '@/lib/utm';
import Footer from '@/components/Footer';
import { Logo } from '@/components/Brand';

const navItems = [
  { href: '/home', label: 'Home' },
  { href: '/practice', label: 'Practice' },
  { href: '/progress', label: 'Progress' },
  { href: '/settings', label: 'Settings' },
  { href: '/help', label: 'Help' },
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
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError) { console.error('[admin-check] getUser failed:', userError.message); return; }
      if (!user) return;
      const { data, error: queryError } = await supabase
        .from('admin_users')
        .select('user_id')
        .eq('user_id', user.id)
        .maybeSingle();
      if (queryError) { console.error('[admin-check] admin_users query failed:', queryError.message); }
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
      <nav className="sticky top-0 z-40 border-b border-c-border bg-c-bg/85 backdrop-blur-lg">
        <div className="max-w-5xl mx-auto px-4 flex items-center justify-between h-14">
          <div className="flex items-center gap-3 sm:gap-6 min-w-0">
            <Logo size="md" href="/home" />
            <div className="flex gap-0.5 min-w-0 overflow-x-auto">
              {navItems.map((item) => {
                const active = pathname === item.href;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    aria-current={active ? 'page' : undefined}
                    className={`relative px-3 py-1.5 rounded-md text-sm transition-colors ${
                      active
                        ? 'text-c-amber font-medium'
                        : 'text-c-muted hover:text-c-text'
                    }`}
                  >
                    {item.label}
                    {active && (
                      <span className="absolute inset-x-3 -bottom-px h-0.5 bg-c-amber rounded-full" />
                    )}
                  </Link>
                );
              })}
              {isAdmin && (
                <Link
                  href="/admin"
                  aria-current={pathname.startsWith('/admin') ? 'page' : undefined}
                  className={`px-3 py-1.5 rounded-md text-sm transition-colors ${
                    pathname.startsWith('/admin')
                      ? 'text-c-amber font-medium'
                      : 'text-c-amber/70 hover:text-c-amber'
                  }`}
                >
                  Admin
                </Link>
              )}
            </div>
          </div>
          <button
            onClick={handleSignOut}
            className="text-sm text-c-muted hover:text-c-text transition-colors"
          >
            Sign out
          </button>
        </div>
      </nav>
      <main className="max-w-5xl mx-auto px-4 py-8">
        {children}
      </main>
      <Footer variant="compact" />
    </div>
  );
}
