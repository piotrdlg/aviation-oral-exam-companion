import Link from 'next/link';
import Footer from '@/components/Footer';

export default function NotFound() {
  return (
    <div className="min-h-screen flex flex-col bg-c-bg">
      <div className="flex-1 flex items-center justify-center px-4">
        <div className="bezel rounded-lg border border-c-border p-8 max-w-md text-center">
          <p className="font-mono font-bold text-6xl text-c-amber glow-a mb-4">404</p>
          <h2 className="font-mono font-bold text-xl text-c-amber uppercase tracking-wider mb-2">
            PAGE NOT FOUND
          </h2>
          <p className="text-c-muted font-mono text-sm mb-6">
            The page you&apos;re looking for doesn&apos;t exist.
          </p>
          <Link
            href="/practice"
            className="inline-block px-6 py-2.5 bg-c-amber hover:bg-c-amber/90 text-c-bg rounded-lg font-mono font-semibold text-xs uppercase tracking-wide transition-colors"
          >
            GO TO PRACTICE
          </Link>
        </div>
      </div>
      <Footer variant="compact" />
    </div>
  );
}
