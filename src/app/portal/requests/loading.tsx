export default function Loading() {
  return (
    <div className="space-y-5 animate-pulse">
      <div className="flex items-center justify-between gap-3">
        <div className="h-6 w-28 bg-gray-200 rounded-lg" />
        <div className="h-9 w-32 bg-brand/20 rounded-full" />
      </div>
      <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
        <div className="divide-y divide-gray-50">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="px-5 py-4 flex items-center justify-between gap-4">
              <div className="space-y-1.5 flex-1">
                <div className="h-4 w-48 bg-gray-200 rounded" />
                <div className="h-3 w-28 bg-gray-100 rounded" />
              </div>
              <div className="h-6 w-20 bg-gray-100 rounded-full shrink-0" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
