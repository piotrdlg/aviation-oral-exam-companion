'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';

const navSections = [
  {
    label: 'OVERVIEW',
    items: [
      { href: '/admin', label: 'Dashboard', icon: '\u2636' },
      { href: '/admin/users', label: 'Users', icon: '\u2603' },
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
    <div className="min-h-screen bg-c-bg flex">
      {/* Sidebar */}
      <aside className="w-56 flex-shrink-0 border-r border-c-border bg-c-panel flex flex-col">
        <div className="h-14 flex items-center px-4 border-b border-c-border">
          <Link href="/admin" className="font-mono font-bold text-c-amber glow-a text-sm tracking-widest uppercase">
            HEYDPE <span className="text-c-muted font-normal text-[10px] tracking-wider">ADMIN</span>
          </Link>
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

        <div className="border-t border-c-border p-3 space-y-2">
          <p className="font-mono text-[10px] text-c-dim truncate">{email}</p>
          <button
            onClick={handleSignOut}
            className="text-c-muted hover:text-c-amber font-mono text-xs uppercase tracking-wide transition-colors"
            title="Sign Out"
          >
            &#9654; SIGN OUT
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto">
        <div className="max-w-6xl mx-auto px-6 py-8">
          {children}
        </div>
      </main>
    </div>
  );
}
