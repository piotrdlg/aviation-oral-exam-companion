'use client';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-c-bg px-4">
      <div className="bezel rounded-lg border border-c-border p-8 max-w-md text-center">
        <p className="font-mono text-4xl text-c-red mb-4">&#9888;</p>
        <h2 className="font-mono font-bold text-xl text-c-red uppercase tracking-wider mb-2">
          SOMETHING WENT WRONG
        </h2>
        <p className="text-c-muted font-mono text-sm mb-6">
          {error.message || 'An unexpected error occurred.'}
        </p>
        <button
          onClick={reset}
          className="px-6 py-2.5 bg-c-amber hover:bg-c-amber/90 text-c-bg rounded-lg font-mono font-semibold text-xs uppercase tracking-wide transition-colors"
        >
          TRY AGAIN
        </button>
      </div>
    </div>
  );
}
