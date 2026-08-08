import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, RefreshCw, CheckCircle, PackageOpen, Layers } from 'lucide-react';
import { useReviewStore } from '../stores/reviewStore';
import { db } from '../lib/db/schema';

export default function ReviewPage() {
  const navigate = useNavigate();
  const {
    cards, index, isFlipped, isLoading, isComplete, stats,
    load, flip, rate,
  } = useReviewStore();
  const [totalCardsInSystem, setTotalCardsInSystem] = useState(0);

  useEffect(() => {
    load();
    db.cards.count().then(setTotalCardsInSystem);
  }, []);

  const card = cards[index] ?? null;
  const total = cards.length;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-brand-500 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="animate-fade-in space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <button onClick={() => navigate('/')} className="btn-ghost">
          <ArrowLeft className="h-4 w-4" />
          返回
        </button>
        <h1 className="text-lg font-bold">📅 复习</h1>
        <div className="flex items-center gap-1">
          <button onClick={() => navigate('/cards')} className="btn-ghost" title="卡片库">
            <Layers className="h-4 w-4" />
            卡片库
          </button>
          <button onClick={load} className="btn-ghost" title="刷新">
            <RefreshCw className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Progress */}
      <div className="text-center">
        {total > 0 ? (
          <span className="text-sm text-[var(--color-text-secondary)]">
            {stats.reviewed} / {total}
          </span>
        ) : (
          <span className="text-sm text-[var(--color-text-secondary)]">没有待复习的卡片</span>
        )}
      </div>

      {!card ? (
        totalCardsInSystem === 0 ? (
          /* 从未创建过卡片 */
          <div className="flex flex-col items-center gap-4 py-16 text-[var(--color-text-secondary)]">
            <PackageOpen className="h-16 w-16 text-gray-300" />
            <p className="text-lg font-medium">还没有复习卡片</p>
            <p className="text-sm max-w-xs text-center">
              在文档编辑器中使用 AI 生成知识卡片，然后来这里间隔复习
            </p>
            <div className="flex flex-wrap justify-center gap-3 mt-2">
              <button onClick={() => navigate('/cards')} className="btn-primary">
                🗂 去卡片库创建
              </button>
              <button onClick={() => navigate('/')} className="btn-secondary">
                ✏️ 去写文档
              </button>
            </div>
          </div>
        ) : isComplete ? (
          /* 今天确实复习完了 */
          <div className="flex flex-col items-center gap-4 py-16 text-[var(--color-text-secondary)]">
            <CheckCircle className="h-16 w-16 text-green-400" />
            <p className="text-lg font-medium">🎉 今日复习完成！</p>
            <p className="text-sm">
              复习了 {stats.reviewed} 张卡片
              {stats.again > 0 && `，${stats.again} 张需要再次复习`}
            </p>
            <div className="flex gap-3 mt-2">
              <button onClick={() => navigate('/stats')} className="btn-secondary">
                查看统计
              </button>
              <button onClick={() => navigate('/')} className="btn-ghost">
                继续学习
              </button>
            </div>
          </div>
        ) : (
          /* 有卡片但今天没有到期的 */
          <div className="flex flex-col items-center gap-4 py-16 text-[var(--color-text-secondary)]">
            <CheckCircle className="h-16 w-16 text-blue-300" />
            <p className="text-lg font-medium">今天没有需要复习的卡片</p>
            <p className="text-sm">下次复习时间还没到，先去学习新内容吧</p>
            <button onClick={() => navigate('/')} className="btn-secondary mt-4">
              继续学习
            </button>
          </div>
        )
      ) : (
        <div className="mx-auto max-w-lg">
          {/* Card */}
          <div
            className="perspective-1000 cursor-pointer"
            onClick={() => !isFlipped && flip()}
          >
            <div className={`relative transition-transform duration-500 ${isFlipped ? 'rotate-y-180' : ''}`}>
              {/* Front */}
              <div className={`backface-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-8 text-center shadow-sm ${isFlipped ? 'hidden' : ''}`}>
                <div className="mb-4">
                  {card.tags?.slice(0, 3).map(t => (
                    <span key={t} className="tag-gray ml-1">{t}</span>
                  ))}
                </div>
                <p className="text-lg font-medium leading-relaxed text-[var(--color-text)]">
                  {card.front}
                </p>
                <p className="mt-6 text-xs text-[var(--color-text-secondary)]">
                  👆 点击翻转查看答案
                </p>
              </div>
              {/* Back */}
              <div className={`backface-hidden rotate-y-180 absolute inset-0 rounded-xl border border-brand-200 dark:border-brand-800 bg-brand-50 dark:bg-brand-950/30 p-8 text-center shadow-sm ${isFlipped ? 'relative' : 'hidden'}`}>
                <span className="tag-brand mb-4">答案</span>
                <p className="text-base leading-relaxed text-[var(--color-text)] mt-4">
                  {card.back}
                </p>
              </div>
            </div>
          </div>

          {/* Rating Buttons */}
          {isFlipped && (
            <div className="mt-8 animate-slide-up">
              <p className="mb-3 text-center text-sm font-medium text-[var(--color-text-secondary)]">
                你的掌握程度？
              </p>
              <div className="grid grid-cols-4 gap-3">
                {([
                  { rating: 1, label: '忘了', hint: '1天后', color: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300 hover:bg-red-200' },
                  { rating: 2, label: '困难', hint: '3天后', color: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300 hover:bg-orange-200' },
                  { rating: 3, label: '良好', hint: '7天后', color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 hover:bg-blue-200' },
                  { rating: 4, label: '轻松', hint: '14天后', color: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300 hover:bg-green-200' },
                ]).map(({ rating: r, label, hint, color }) => (
                  <button
                    key={r}
                    onClick={() => rate(r as 1 | 2 | 3 | 4)}
                    className={`rounded-lg px-4 py-3 text-sm font-semibold transition-all active:scale-95 flex flex-col items-center ${color}`}
                  >
                    <span>{label}</span>
                    <span className="text-[10px] opacity-70 font-normal mt-0.5">{hint}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Progress Bar */}
      {total > 0 && (
        <div className="mx-auto mt-8 max-w-lg">
          <div className="h-2 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
            <div
              className="h-full rounded-full bg-brand-500 transition-all duration-500"
              style={{ width: `${(stats.reviewed / total) * 100}%` }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
