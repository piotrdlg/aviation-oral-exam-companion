export default function Loading() {
  return (
    <div className="max-w-2xl mx-auto">
      <div className="h-8 w-48 bg-gray-800 rounded animate-pulse mb-2" />
      <div className="h-5 w-80 bg-gray-800/60 rounded animate-pulse mb-8" />
      <div className="bg-gray-900 rounded-xl border border-gray-800 p-6 min-h-[200px] flex items-center justify-center">
        <div className="flex space-x-1">
          <div className="w-2 h-2 bg-gray-600 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
          <div className="w-2 h-2 bg-gray-600 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
          <div className="w-2 h-2 bg-gray-600 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
        </div>
      </div>
    </div>
  );
}
