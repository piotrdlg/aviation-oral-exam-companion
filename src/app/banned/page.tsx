import Link from 'next/link';
import { Logo } from '@/components/Brand';
import Footer from '@/components/Footer';

export default function BannedPage() {
  return (
    <div className="min-h-screen flex flex-col bg-c-bg">
      <header className="px-4 pt-8 flex justify-center">
        <Logo size="md" href="/" />
      </header>
      <div className="flex-1 flex items-center justify-center px-4">
        <div className="w-full max-w-md p-8 bezel rounded-xl border border-c-border text-center">
          <div className="w-12 h-12 mx-auto mb-5 rounded-full bg-c-red-dim/40 flex items-center justify-center">
            <svg
              className="w-6 h-6 text-c-red"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.5}
              stroke="currentColor"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M18.364 18.364A9 9 0 0 0 5.636 5.636m12.728 12.728A9 9 0 0 1 5.636 5.636m12.728 12.728L5.636 5.636"
              />
            </svg>
          </div>
          <p className="font-mono text-xs text-c-red tracking-[0.3em] uppercase mb-3">// Account status</p>
          <h1 className="text-2xl font-bold tracking-tight text-c-text mb-3">Account banned</h1>
          <p className="text-sm text-c-muted leading-relaxed mb-6">
            Your account has been permanently banned due to a violation of our terms of service.
            If you believe this is an error, please contact support.
          </p>
          <a
            href="mailto:pd@imagineflying.com"
            className="inline-flex items-center justify-center min-h-11 px-6 py-2.5 bg-c-bezel hover:bg-c-border text-c-text rounded-lg text-[15px] font-semibold border border-c-border transition-colors"
          >
            Contact support
          </a>
          <div className="mt-5">
            <Link href="/" className="text-sm text-c-muted hover:text-c-text transition-colors">
              Back to home
            </Link>
          </div>
        </div>
      </div>
      <Footer variant="compact" />
    </div>
  );
}
