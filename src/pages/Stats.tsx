import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, CalendarDays, BookOpen, Brain, Clock3 } from 'lucide-react';
import { getActiveJournalsForStats } from '../lib/db/repositories/stats';
import Heatmap from '../components/Heatmap';
import { getCardsDueToday } from '../lib/db/cards';
import { listDueTopicMastery, listTopicMastery } from '../lib/zero2review/repository';
import { getTopicCandidates } from '../lib/zero2review/catalog';
import { listUnifiedLearningTasks, summarizeLearningTasks, type LearningTaskSummary } from '../lib/learning/taskModel';

interface DailyCount {
  date: string;
  count: number;
}

export default function Stats() {
  const navigate = useNavigate();
  const [totalJournals, setTotalJournals] = useState(0);
  const [loading, setLoading] = useState(true);
  const [dailyData, setDailyData] = useState<DailyCount[]>([]);
  const [subjectStats, setSubjectStats] = useState<{ subject: string; count: number }[]>([]);
  const [weakTopics, setWeakTopics] = useState<{ id: string; title: string; mastery: number | null; evidenceCount: number }[]>([]);
  const [dueCardCount, setDueCardCount] = useState(0);
  const [dueTopicCount, setDueTopicCount] = useState(0);
  const [learningSummary, setLearningSummary] = useState<LearningTaskSummary | null>(null);

  useEffect(() => {
    loadStats();
  }, []);

  async function loadStats() {
    setLoading(true);
    const [journals, dueCards, dueTopics, learningTasks] = await Promise.all([
      getActiveJournalsForStats(),
      getCardsDueToday(),
      listDueTopicMastery(),
      listUnifiedLearningTasks(),
    ]);

    setTotalJournals(journals.length);
    setDueCardCount(dueCards.length);
    setDueTopicCount(dueTopics.length);
    setLearningSummary(summarizeLearningTasks(learningTasks, new Date().toISOString().slice(0, 10)));

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
    try {
      const mastery = (await listTopicMastery()).filter((item) => item.mastery === null || item.mastery < 0.6).sort((a, b) => (a.mastery ?? 0) - (b.mastery ?? 0)).slice(0, 5);
      const topics = await getTopicCandidates(mastery.map((item) => item.topicId));
      const titles = new Map(topics.map((topic) => [topic.id, topic.title]));
      setWeakTopics(mastery.map((item) => ({ id: item.topicId, title: titles.get(item.topicId) ?? item.topicId, mastery: item.mastery, evidenceCount: item.evidenceCount })));
    } catch {
      setWeakTopics([]);
    }
    setLoading(false);
  }

  const weekCount = dailyData.slice(-7).reduce((sum, item) => sum + item.count, 0);
  const streak = dailyData.slice().reverse().reduce((count, item, index) => {
    if (index === 0 && item.count === 0) return 0;
    return item.count > 0 && count === index ? count + 1 : count;
  }, 0);

  if (loading) {
    return (
      <div className="content-frame space-y-5"><div className="page-hero"><div className="page-hero-copy"><div className="h-3 w-28 rounded shimmer" /><div className="mt-3 h-8 w-20 rounded shimmer" /></div></div><div className="stat-grid"><div className="card h-24 shimmer" /><div className="card h-24 shimmer" /><div className="card h-24 shimmer" /></div><div className="card h-64 shimmer" />
      </div>
    );
  }

  return (
    <div className="content-frame animate-fade-in space-y-5">
      <div className="page-hero">
        <div className="page-hero-copy">
        <h1 className="text-2xl font-bold text-[var(--color-text)]">统计</h1>
        <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
          你的学习数据概览
        </p>
      </div>
      </div>

      {/* Summary cards */}
      <div className="stat-grid stats-strip">
        <div className="stat-card">
          <BookOpen className="h-5 w-5 text-[var(--color-info)]" />
          <div><p className="text-xl font-bold text-[var(--color-text)]">{totalJournals}</p><p className="text-xs text-[var(--color-text-secondary)]">文档</p></div>
        </div>
        <div className="stat-card"><BookOpen className="h-5 w-5 text-[var(--color-primary)]" /><div><p className="text-xl font-bold text-[var(--color-text)]">{weekCount}</p><p className="text-xs text-[var(--color-text-secondary)]">本周记录</p></div></div>
        <div className="stat-card"><CalendarDays className="h-5 w-5 text-[var(--color-accent)]" /><div><p className="text-xl font-bold text-[var(--color-text)]">{streak}</p><p className="text-xs text-[var(--color-text-secondary)]">连续学习天</p></div></div>
        <div className="stat-card"><Brain className="h-5 w-5 text-[var(--color-primary)]" /><div><p className="text-xl font-bold text-[var(--color-text)]">{learningSummary ? `${Math.round(learningSummary.completionRate * 100)}%` : '0%'}</p><p className="text-xs text-[var(--color-text-secondary)]">任务完成率</p></div></div>
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
              <button key={subject} className="block w-full text-left" onClick={() => navigate(`/search?q=${encodeURIComponent(`subject:${subject}`)}`)} type="button" title={`搜索 ${subject} 相关文档`}>
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
              </button>
            );
          })}
        </div>
      </div>
      </div>
      {weakTopics.length > 0 && <div className="card">
        <div className="mb-3 flex items-center justify-between gap-2"><div><h2 className="text-sm font-semibold text-[var(--color-text)]">下一条航线</h2><p className="mt-1 text-xs text-[var(--color-text-secondary)]">优先补齐掌握度较低或证据不足的主题。</p></div><button className="btn-primary text-xs" onClick={() => navigate('/zero2-review')} type="button">进入训练</button></div>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {weakTopics.map((topic) => <button key={topic.id} className="rounded-lg border border-[var(--color-border)] p-3 text-left transition-colors hover:border-[var(--color-primary)] hover:bg-[var(--color-surface-hover)]" onClick={() => navigate('/zero2-review')} type="button"><span className="block truncate text-sm font-medium text-[var(--color-text)]">{topic.title}</span><span className="mt-1 block text-xs text-[var(--color-text-secondary)]">{topic.mastery == null ? '掌握度未知' : `掌握度 ${Math.round(topic.mastery * 100)}%`} · {topic.evidenceCount} 条证据</span></button>)}
        </div>
      </div>}
      {(dueCardCount > 0 || dueTopicCount > 0 || (learningSummary?.due ?? 0) > 0) && <div className="card border-[var(--color-primary)]/25">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div><h2 className="flex items-center gap-2 text-sm font-semibold text-[var(--color-text)]"><Brain className="h-4 w-4 text-[var(--color-primary)]" />今天的最小行动</h2><p className="mt-1 text-xs text-[var(--color-text-secondary)]">先完成到期内容，再开始新的学习主题。</p></div>
          <button className="btn-primary inline-flex items-center gap-1 text-xs" onClick={() => navigate('/zero2-review')} type="button">进入复习 <ArrowRight className="h-3.5 w-3.5" /></button>
        </div>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {dueTopicCount > 0 && <div className="flex items-center gap-2 rounded-md bg-[var(--color-surface-2)] px-3 py-2 text-xs"><Brain className="h-3.5 w-3.5 text-[var(--color-primary)]" /><span>有 {dueTopicCount} 个课程主题待复习</span></div>}
          {dueCardCount > 0 && <div className="flex items-center gap-2 rounded-md bg-[var(--color-surface-2)] px-3 py-2 text-xs"><Clock3 className="h-3.5 w-3.5 text-[var(--color-accent)]" /><span>有 {dueCardCount} 张知识卡片到期</span></div>}
          {(learningSummary?.due ?? 0) > 0 && <div className="flex items-center gap-2 rounded-md bg-[var(--color-surface-2)] px-3 py-2 text-xs"><CalendarDays className="h-3.5 w-3.5 text-[var(--color-info)]" /><span>{learningSummary?.due} 项学习任务到期{learningSummary?.overdue ? `，其中 ${learningSummary.overdue} 项逾期` : ''} · 约 {learningSummary?.estimatedMinutesDue} 分钟</span></div>}
        </div>
      </div>}
    </div>
  );
}
