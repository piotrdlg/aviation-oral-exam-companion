import Link from 'next/link';
import { Logo } from '@/components/Brand';

interface FooterProps {
  /**
   * "public" — full footer with nav links (Pricing, Sign in, Get started)
   * "compact" — minimal footer with just Privacy + Terms links
   */
  variant?: 'public' | 'compact';
}

const linkClass =
  'text-c-muted hover:text-c-text transition-colors';

export default function Footer({ variant = 'public' }: FooterProps) {
  return (
    <footer className="py-10 px-4 border-t border-c-border">
      <div className="max-w-4xl mx-auto">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-5 mb-6">
          <Logo size="sm" href="/" />
          <nav className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-[13px]">
            {variant === 'public' && (
              <>
                <Link href="/pricing" className={linkClass}>Pricing</Link>
                <Link href="/login" className={linkClass}>Sign in</Link>
                <Link href="/signup" className="text-c-amber hover:text-c-amber-bright transition-colors">Get started</Link>
              </>
            )}
            <Link href="/help" className={linkClass}>Help</Link>
            <Link href="/privacy" className={linkClass}>Privacy</Link>
            <Link href="/terms" className={linkClass}>Terms</Link>
            <Link href="/accessibility" className={linkClass}>Accessibility</Link>
          </nav>
        </div>
        <p className="text-xs text-c-dim text-center leading-relaxed max-w-xl mx-auto">
          For study purposes only. Not a substitute for instruction from a certificated
          flight instructor (CFI) or an actual DPE checkride. Always verify information
          against current FAA publications. HeyDPE is a product of Imagine Flying LLC,
          Jacksonville, FL.
        </p>
      </div>
    </footer>
  );
}
