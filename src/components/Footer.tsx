import Link from 'next/link';

interface FooterProps {
  /**
   * "public" — full footer with nav links (PRICING, SIGN IN, GET STARTED)
   * "compact" — minimal footer with just PRIVACY + TERMS links
   */
  variant?: 'public' | 'compact';
}

export default function Footer({ variant = 'public' }: FooterProps) {
  return (
    <footer className="py-10 px-4 border-t border-c-border">
      <div className="max-w-4xl mx-auto">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mb-6">
          <Link href="/" className="font-mono font-bold text-c-amber glow-a text-sm tracking-widest">
            HEYDPE
          </Link>
          <div className="flex items-center gap-6 text-xs font-mono text-c-muted">
            {variant === 'public' && (
              <>
                <Link href="/pricing" className="hover:text-c-amber transition-colors">PRICING</Link>
                <Link href="/login" className="hover:text-c-text transition-colors">SIGN IN</Link>
                <Link href="/signup" className="hover:text-c-text transition-colors">GET STARTED</Link>
              </>
            )}
            <Link href="/privacy" className="hover:text-c-text transition-colors">PRIVACY</Link>
            <Link href="/terms" className="hover:text-c-text transition-colors">TERMS</Link>
          </div>
        </div>
        <p className="text-[10px] text-c-muted text-center leading-relaxed max-w-xl mx-auto font-mono">
          FOR STUDY PURPOSES ONLY. NOT A SUBSTITUTE FOR INSTRUCTION FROM A CERTIFICATED
          FLIGHT INSTRUCTOR (CFI) OR AN ACTUAL DPE CHECKRIDE. ALWAYS VERIFY INFORMATION
          AGAINST CURRENT FAA PUBLICATIONS. HEYDPE IS A PRODUCT OF IMAGINE FLYING LLC,
          JACKSONVILLE, FL.
        </p>
      </div>
    </footer>
  );
}
