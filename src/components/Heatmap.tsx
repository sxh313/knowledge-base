interface HeatmapData {
  date: string;
  count: number;
}

interface HeatmapProps {
  data: HeatmapData[];
}

export default function Heatmap({ data }: HeatmapProps) {
  return (
    <div className="grid grid-cols-10 gap-1.5">
      {data.map(({ date, count }) => (
        <div key={date} className="group relative">
          <div
            className={`h-6 w-full rounded transition-colors ${
              count === 0
                ? 'border border-[var(--color-border)] bg-[var(--color-surface-2)]'
                : count <= 2
                ? 'bg-[var(--color-info-light)]'
                : count <= 5
                ? 'bg-[var(--color-info)]'
                : 'bg-[var(--color-primary)]'
            }`}
            title={`${date}: ${count} 篇`}
          />
          <div className="pointer-events-none absolute -top-8 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-md bg-gray-800 px-2 py-1 text-xs text-white opacity-0 transition-opacity group-hover:opacity-100">
            {date}: {count} 篇
          </div>
        </div>
      ))}
    </div>
  );
}
