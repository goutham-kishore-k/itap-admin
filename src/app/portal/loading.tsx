export default function PortalLoading() {
  return (
    <div className="space-y-6 animate-pulse">
      {/* Greeting */}
      <div className="space-y-2">
        <div className="h-8 w-52 bg-gray-200 rounded-lg" />
        <div className="h-4 w-36 bg-gray-100 rounded-lg" />
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-3">
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className="bg-white rounded-2xl border border-gray-100 p-5 space-y-2">
            <div className="h-3 w-20 bg-gray-100 rounded" />
            <div className="h-8 w-14 bg-gray-200 rounded-lg" />
            <div className="h-3 w-16 bg-gray-100 rounded" />
          </div>
        ))}
      </div>

      {/* Quick actions */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-brand/20 rounded-2xl h-16" />
        <div className="bg-gray-100 rounded-2xl h-16" />
      </div>

      {/* Recent requests */}
      <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-50">
          <div className="h-4 w-32 bg-gray-200 rounded" />
        </div>
        <div className="divide-y divide-gray-50">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="px-5 py-3.5 flex items-center justify-between gap-3">
              <div className="space-y-1.5 flex-1">
                <div className="h-4 w-44 bg-gray-200 rounded" />
                <div className="h-3 w-24 bg-gray-100 rounded" />
              </div>
              <div className="h-6 w-18 bg-gray-100 rounded-full shrink-0" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
