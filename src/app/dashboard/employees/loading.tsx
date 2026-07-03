export default function Loading() {
  return (
    <div className="space-y-5 animate-pulse">
      <div className="flex items-center justify-between">
        <div className="h-6 w-32 bg-gray-200 rounded-lg" />
        <div className="h-9 w-36 bg-gray-100 rounded-full" />
      </div>
      <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-50">
          <div className="h-4 w-24 bg-gray-200 rounded" />
        </div>
        <div className="divide-y divide-gray-50">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="px-5 py-4 flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-gray-100 shrink-0" />
                <div className="space-y-1.5">
                  <div className="h-4 w-36 bg-gray-200 rounded" />
                  <div className="h-3 w-24 bg-gray-100 rounded" />
                </div>
              </div>
              <div className="flex items-center gap-2">
                <div className="h-6 w-16 bg-gray-100 rounded-full" />
                <div className="h-8 w-12 bg-gray-100 rounded-lg" />
                <div className="h-8 w-28 bg-gray-100 rounded-lg" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
