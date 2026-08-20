import { useEffect, useState } from 'react';
import { db } from '../lib/db/schema';
import { CalendarDays, BookOpen, Loader2 } from 'lucide-react';
import Heatmap from '../components/Heatmap';

interface DailyCount {
  date: string;
  count: number;
}

export default function Stats() {
  const [totalJournals, setTotalJournals] = useState(0);
  const [loading, setLoading] = useState(true);
  const [dailyData, setDailyData] = useState<DailyCount[]>([]);
  const [subjectStats, setSubjectStats] = useState<{ subject: string; count: number }[]>([]);

  useEffect(() => {
    loadStats();
  }, []);

  async function loadStats() {
    setLoading(true);
    const journals = await db.journals.filter(j => !j.deletedAt).toArray();

    setTotalJournals(journals.length);

    // Daily counts (last 30 days)
    const counts: Record<string, number> = {};
    const now = new Date();
    for (let i = 29; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const key = d.toISOString().split('T')[0];
      counts[key] = 0;
    }
    for (const j of journals) {
      const key = new Date(j.createdAt).toISOString().split('T')[0];
      if (counts[key] !== undefined) counts[key]++;
    }
    setDailyData(Object.entries(counts).map(([date, count]) => ({ date, count })));

    // Subject breakdown
    const subjCounts: Record<string, number> = {};
    for (const j of journals) {
      const s = j.subject || '未分类';
      subjCounts[s] = (subjCounts[s] || 0) + 1;
    }
    const sorted = Object.entries(subjCounts)
      .map(([subject, count]) => ({ subject, count }))
      .sort((a, b) => b.count - a.count);
    setSubjectStats(sorted);
    setLoading(false);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-brand-500" />
      </div>
    );
  }

  return (
    <div className="content-frame animate-fade-in space-y-5">
      <div className="page-hero">
        <div className="page-hero-copy">
        <div className="page-kicker">Your learning pulse</div>
        <h1 className="text-2xl font-bold text-[var(--color-text)]">统计</h1>
        <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
          你的学习数据概览
        </p>
      </div>
      </div>

      {/* Summary cards */}
      <div className="stat-grid">
        <div className="card stat-card">
          <BookOpen className="mx-auto h-6 w-6 text-brand-500 mb-2" />
          <p className="text-2xl font-bold text-[var(--color-text)]">{totalJournals}</p>
          <p className="text-xs text-[var(--color-text-secondary)]">文档</p>
        </div>
      </div>

      <div className="grid items-start gap-3 lg:grid-cols-[minmax(0,1.45fr)_minmax(18rem,0.55fr)]">
      {/* Heatmap */}
      <div className="card min-w-0">
        <div className="flex items-center gap-2 mb-4">
          <CalendarDays className="h-4 w-4 text-[var(--color-text-secondary)]" />
          <h2 className="text-sm font-semibold text-[var(--color-text)]">近 30 天活动</h2>
        </div>
        <Heatmap data={dailyData} />
      </div>

      {/* Subject breakdown */}
      <div className="card">
        <h2 className="mb-4 text-sm font-semibold text-[var(--color-text)]">分类分布</h2>
        <div className="space-y-3">
          {subjectStats.map(({ subject, count }) => {
            const pct = (count / totalJournals) * 100;
            return (
              <div key={subject}>
                <div className="flex items-center justify-between text-sm mb-1">
                  <span className="text-[var(--color-text)]">{subject}</span>
                  <span className="text-[var(--color-text-secondary)]">{count} 篇</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-gray-200 dark:bg-surface-card">
                  <div
                    className="h-full rounded-full bg-brand-500 transition-all"
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>
      </div>
    </div>
  );
}
