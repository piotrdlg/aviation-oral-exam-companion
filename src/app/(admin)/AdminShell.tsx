'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';

const topNavItems = [
  { href: '/home', label: 'Home' },
  { href: '/practice', label: 'Practice' },
  { href: '/progress', label: 'Progress' },
  { href: '/settings', label: 'Settings' },
  { href: '/help', label: 'Help' },
];

const navSections = [
  {
    label: 'OVERVIEW',
    items: [
      { href: '/admin', label: 'Dashboard', icon: '\u2636' },
      { href: '/admin/analytics', label: 'Analytics', icon: '\u2261' },
      { href: '/admin/support', label: 'Support', icon: '\u2709' },
      { href: '/admin/users', label: 'Users', icon: '\u2603' },
      { href: '/admin/instructors', label: 'Instructors', icon: '\u2708' },
      { href: '/admin/partnership', label: 'Partnership', icon: '\u2764' },
    ],
  },
  {
    label: 'SYSTEM',
    items: [
      { href: '/admin/prompts', label: 'Prompts', icon: '\u27E8\u27E9' },
      { href: '/admin/config', label: 'Config', icon: '\u2699' },
      { href: '/admin/tts', label: 'Voice / TTS', icon: '\u266B' },
      { href: '/admin/voicelab', label: 'Voice Lab', icon: '\u2697' },
      { href: '/admin/moderation', label: 'Moderation', icon: '\u2691' },
      { href: '/admin/graph', label: 'Graph', icon: '\u2B21' },
    ],
  },
];

export default function AdminShell({
  email,
  children,
}: {
  email: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();

  async function handleSignOut() {
    await supabase.auth.signOut();
    router.push('/admin/login');
    router.refresh();
  }

  return (
    <div className="min-h-screen bg-c-bg flex flex-col">
      {/* Top nav — matches dashboard layout nav */}
      <nav className="border-b border-c-border bg-c-bg/80 backdrop-blur-lg flex-shrink-0">
        <div className="max-w-5xl mx-auto px-4 flex items-center justify-between h-14">
          <div className="flex items-center gap-6">
            <Link href="/home" className="font-mono font-bold text-c-amber glow-a text-base tracking-widest">
              HEYDPE
            </Link>
            <div className="flex gap-1">
              {topNavItems.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="px-3 py-1.5 rounded-md font-mono text-sm tracking-wide uppercase transition-colors text-c-muted hover:text-c-amber"
                >
                  {item.label}
                </Link>
              ))}
              <Link
                href="/admin"
                className="px-3 py-1.5 rounded-md font-mono text-sm tracking-wide uppercase transition-colors text-c-amber"
              >
                Admin
              </Link>
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

      <div className="flex flex-1 min-h-0">
        {/* Sidebar */}
        <aside className="w-56 flex-shrink-0 border-r border-c-border bg-c-panel flex flex-col">
          <div className="h-10 flex items-center px-4 border-b border-c-border">
            <span className="font-mono text-[10px] text-c-dim uppercase tracking-wider">// Admin Panel</span>
          </div>

          <nav className="flex-1 px-2 py-4 space-y-4">
            {navSections.map((section) => (
              <div key={section.label}>
                <p className="font-mono text-[10px] text-c-dim uppercase tracking-wider px-3 mb-2">
                  // {section.label}
                </p>
                <div className="space-y-0.5">
                  {section.items.map((item) => {
                    const isActive =
                      item.href === '/admin'
                        ? pathname === '/admin'
                        : pathname.startsWith(item.href);

                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        className={`flex items-center gap-2.5 px-3 py-2 text-xs font-mono uppercase tracking-wide transition-colors ${
                          isActive
                            ? 'border-l-2 border-c-amber bg-c-amber-lo/30 text-c-amber rounded-r-md -ml-[2px]'
                            : 'text-c-muted hover:text-c-text hover:bg-c-elevated/50 rounded-md'
                        }`}
                      >
                        <span className="w-4 text-center flex-shrink-0 text-sm">{item.icon}</span>
                        {item.label}
                      </Link>
                    );
                  })}
                </div>
              </div>
            ))}
          </nav>
        </aside>

        {/* Main content */}
        <main className="flex-1 overflow-auto">
          <div className="max-w-6xl mx-auto px-6 py-8">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
