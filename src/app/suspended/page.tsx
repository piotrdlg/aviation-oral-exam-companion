import Link from 'next/link';
import Footer from '@/components/Footer';

export default function SuspendedPage() {
  return (
    <div className="min-h-screen flex flex-col bg-c-bg">
      <div className="flex-1 flex items-center justify-center px-4">
        <div className="w-full max-w-md p-8 bezel rounded-lg border border-c-border text-center">
          <div className="w-12 h-12 mx-auto mb-4 rounded-full bg-c-amber-lo flex items-center justify-center">
            <svg
              className="w-6 h-6 text-c-amber"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.5}
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z"
              />
            </svg>
          </div>
          <h1 className="text-2xl font-bold font-mono uppercase tracking-wider text-c-text mb-2">Account Suspended</h1>
          <p className="text-c-muted mb-6">
            Your account has been temporarily suspended. This may be due to unusual activity
            or a billing issue. Please contact support to resolve this.
          </p>
          <a
            href="mailto:pd@imagineflying.com"
            className="inline-block px-6 py-2 bg-c-bezel hover:bg-c-elevated text-c-text rounded-lg text-sm font-mono uppercase font-medium border border-c-border-hi transition-colors"
          >
            Contact Support
          </a>
          <div className="mt-4">
            <Link href="/" className="text-sm text-c-dim hover:text-c-muted transition-colors">
              Back to home
            </Link>
          </div>
        </div>
      </div>
      <Footer variant="compact" />
    </div>
  );
}
