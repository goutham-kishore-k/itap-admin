export default function DashboardLoading() {
  return (
    <div className="space-y-6 animate-pulse">
      {/* Page title */}
      <div className="space-y-2">
        <div className="h-6 w-40 bg-gray-200 rounded-lg" />
        <div className="h-4 w-56 bg-gray-100 rounded-lg" />
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="bg-white rounded-2xl border border-gray-100 p-5 space-y-3">
            <div className="h-3 w-24 bg-gray-100 rounded" />
            <div className="h-8 w-16 bg-gray-200 rounded-lg" />
            <div className="h-3 w-20 bg-gray-100 rounded" />
            <div className="h-6 w-16 bg-gray-100 rounded-full mt-2" />
          </div>
        ))}
      </div>

      {/* Content panels */}
      <div className="grid md:grid-cols-2 gap-4">
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-50 flex items-center justify-between">
              <div className="space-y-1.5">
                <div className="h-4 w-32 bg-gray-200 rounded" />
                <div className="h-3 w-24 bg-gray-100 rounded" />
              </div>
              <div className="h-6 w-14 bg-gray-100 rounded-full" />
            </div>
            <div className="divide-y divide-gray-50">
              {Array.from({ length: 4 }).map((_, j) => (
                <div key={j} className="px-5 py-3 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5">
                    <div className="w-7 h-7 rounded-full bg-gray-100 shrink-0" />
                    <div className="h-4 w-28 bg-gray-100 rounded" />
                  </div>
                  <div className="text-right space-y-1">
                    <div className="h-4 w-12 bg-gray-200 rounded" />
                    <div className="h-3 w-16 bg-gray-100 rounded" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
