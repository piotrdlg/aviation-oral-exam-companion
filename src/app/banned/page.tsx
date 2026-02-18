import Link from 'next/link';

export default function BannedPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-c-bg px-4">
      <div className="w-full max-w-md p-8 bezel rounded-lg border border-c-border text-center">
        <div className="w-12 h-12 mx-auto mb-4 rounded-full bg-c-red-dim/40 flex items-center justify-center">
          <svg
            className="w-6 h-6 text-c-red"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1.5}
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M18.364 18.364A9 9 0 0 0 5.636 5.636m12.728 12.728A9 9 0 0 1 5.636 5.636m12.728 12.728L5.636 5.636"
            />
          </svg>
        </div>
        <h1 className="text-2xl font-bold font-mono uppercase tracking-wider text-c-text mb-2">Account Banned</h1>
        <p className="text-c-muted mb-6">
          Your account has been permanently banned due to a violation of our terms of service.
          If you believe this is an error, please contact support.
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
  );
}
