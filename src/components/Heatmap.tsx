interface HeatmapData {
  date: string;
  count: number;
}

interface HeatmapProps {
  data: HeatmapData[];
}

export default function Heatmap({ data }: HeatmapProps) {
  const maxCount = Math.max(...data.map(d => d.count), 1);

  return (
    <div className="grid grid-cols-10 gap-1.5">
      {data.map(({ date, count }) => (
        <div key={date} className="group relative">
          <div
            className={`h-6 w-full rounded transition-colors ${
              count === 0
                ? 'bg-gray-100 dark:bg-surface-card'
                : count <= 2
                ? 'bg-brand-200 dark:bg-brand-900/40'
                : count <= 5
                ? 'bg-brand-400 dark:bg-brand-700'
                : 'bg-brand-600 dark:bg-brand-500'
            }`}
            title={`${date}: ${count} 篇`}
          />
          <div className="pointer-events-none absolute -top-8 left-1/2 -translate-x-1/2 whitespace-nowrap rounded bg-gray-800 px-2 py-1 text-xs text-white opacity-0 transition-opacity group-hover:opacity-100">
            {date}: {count} 篇
          </div>
        </div>
      ))}
    </div>
  );
}