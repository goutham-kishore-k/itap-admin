export default function Loading() {
  return (
    <div className="space-y-5 animate-pulse">
      <div className="space-y-1.5">
        <div className="h-6 w-24 bg-gray-200 rounded-lg" />
        <div className="h-4 w-32 bg-gray-100 rounded" />
      </div>
      {/* Legend */}
      <div className="flex gap-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-5 w-20 bg-gray-100 rounded-full" />
        ))}
      </div>
      {/* Chart area */}
      <div className="bg-white rounded-2xl border border-gray-100 p-8 flex flex-col items-center gap-6">
        <div className="h-16 w-40 bg-gray-100 rounded-2xl" />
        <div className="w-px h-6 bg-gray-200" />
        <div className="flex gap-8">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="flex flex-col items-center gap-4">
              <div className="h-14 w-36 bg-gray-100 rounded-2xl" />
              <div className="w-px h-4 bg-gray-200" />
              <div className="h-12 w-32 bg-gray-50 rounded-2xl border border-gray-100" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
