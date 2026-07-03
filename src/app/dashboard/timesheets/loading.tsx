export default function Loading() {
  return (
    <div className="space-y-5 animate-pulse">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="h-6 w-36 bg-gray-200 rounded-lg" />
        <div className="flex gap-2">
          <div className="h-9 w-32 bg-gray-100 rounded-full" />
          <div className="h-9 w-36 bg-gray-100 rounded-full" />
        </div>
      </div>
      {/* Week filter row */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="h-9 w-28 bg-gray-100 rounded-lg" />
        <div className="h-9 w-36 bg-gray-100 rounded-lg" />
        <div className="h-9 w-24 bg-gray-100 rounded-lg" />
      </div>
      {/* Employee cards */}
      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
            <div className="px-5 py-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-gray-100 shrink-0" />
                <div className="space-y-1.5">
                  <div className="h-4 w-32 bg-gray-200 rounded" />
                  <div className="h-3 w-20 bg-gray-100 rounded" />
                </div>
              </div>
              <div className="flex items-center gap-2">
                <div className="h-6 w-20 bg-gray-100 rounded-full" />
                <div className="h-8 w-20 bg-gray-100 rounded-lg" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
