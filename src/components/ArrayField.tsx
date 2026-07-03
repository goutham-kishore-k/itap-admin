'use client';

interface Props {
  label: string;
  items: string[];
  onChange: (items: string[]) => void;
  placeholder?: string;
}

export default function ArrayField({ label, items, onChange, placeholder }: Props) {
  function update(i: number, value: string) {
    const next = [...items];
    next[i] = value;
    onChange(next);
  }

  return (
    <div>
      <label className="block text-sm font-semibold text-gray-700 mb-2">{label}</label>
      <div className="space-y-2">
        {items.map((item, i) => (
          <div key={i} className="flex items-center gap-2">
            <span className="text-brand font-bold text-xs mt-0.5 shrink-0">•</span>
            <input
              value={item}
              onChange={e => update(i, e.target.value)}
              placeholder={placeholder}
              className="flex-1 px-3.5 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand/20 focus:border-brand transition-colors"
            />
            <button
              type="button"
              onClick={() => onChange(items.filter((_, j) => j !== i))}
              className="text-gray-300 hover:text-red-400 transition-colors text-lg leading-none font-bold px-1"
              aria-label="Remove"
            >
              ×
            </button>
          </div>
        ))}
      </div>
      <button
        type="button"
        onClick={() => onChange([...items, ''])}
        className="mt-2.5 text-sm font-semibold text-brand hover:text-brand-dark flex items-center gap-1 transition-colors"
      >
        <span className="text-base leading-none">+</span> Add item
      </button>
    </div>
  );
}
