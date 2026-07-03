export default function Loading() {
  return (
    <div className="space-y-5 animate-pulse">
      <div className="space-y-1.5">
        <div className="h-6 w-24 bg-gray-200 rounded-lg" />
        <div className="h-4 w-32 bg-gray-100 rounded" />
      </div>
      <div className="flex gap-4 flex-wrap">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-5 w-24 bg-gray-100 rounded-full" />
        ))}
      </div>
      <div className="bg-white rounded-2xl border border-gray-100 p-8 flex flex-col items-center gap-6">
        <div className="h-16 w-44 bg-gray-100 rounded-2xl" />
        <div className="w-px h-6 bg-gray-200" />
        <div className="flex gap-8">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="flex flex-col items-center gap-4">
              <div className="h-14 w-36 bg-gray-100 rounded-2xl" />
              <div className="w-px h-4 bg-gray-200" />
              <div className="flex gap-4">
                {Array.from({ length: 2 }).map((_, j) => (
                  <div key={j} className="h-12 w-32 bg-gray-50 rounded-2xl border border-gray-100" />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
