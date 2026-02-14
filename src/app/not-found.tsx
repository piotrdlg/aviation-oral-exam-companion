import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-950 px-4">
      <div className="max-w-md text-center">
        <h2 className="text-xl font-bold text-white mb-2">Page Not Found</h2>
        <p className="text-gray-400 mb-6 text-sm">
          The page you&apos;re looking for doesn&apos;t exist.
        </p>
        <Link
          href="/practice"
          className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors inline-block"
        >
          Go to Practice
        </Link>
      </div>
    </div>
  );
}
