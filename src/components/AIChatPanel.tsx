import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { useNavigate } from 'react-router-dom';
import { useAIStore } from '../stores/aiStore';
import { createCard } from '../lib/db/queries';

interface AIChatPanelProps {
  onAccept?: (content: string) => void;
  onAction?: (action: string) => void;
  journalId?: string;
}

/** 尝试从 AI 返回内容中解析卡片数组 */
function tryParseCards(content: string): { front: string; back: string }[] | null {
  try {
    const parsed = JSON.parse(content);
    if (Array.isArray(parsed) && parsed.every(c => c.front && c.back)) {
      return parsed;
    }
  } catch {
    // 尝试从 markdown 代码块中提取
    const match = content.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (match) {
      try {
        const parsed = JSON.parse(match[1].trim());
        if (Array.isArray(parsed) && parsed.every(c => c.front && c.back)) {
          return parsed;
        }
      } catch { /* not cards */ }
    }
  }
  return null;
}

export default function AIChatPanel({ onAccept, onAction, journalId }: AIChatPanelProps) {
  const { isProcessing, streamingContent, error } = useAIStore();
  const navigate = useNavigate();
  const [cardSaved, setCardSaved] = useState(false);

  const actions = [
    { key: 'summarize', label: '📝 总结', desc: '提炼核心要点' },
    { key: 'generateCards', label: '🃏 卡片', desc: '生成知识卡片' },
    { key: 'codeReview', label: '🔍 代码', desc: '审查代码' },
    { key: 'codeExplain', label: '📖 解释', desc: '解释代码' },
  ] as const;

  const isConfigError = error?.includes('尚未配置');

  // 检测 AI 返回的是否为卡片 JSON
  const parsedCards = !isProcessing && streamingContent ? tryParseCards(streamingContent) : null;

  const handleSaveCards = async () => {
    if (!parsedCards) return;
    for (const card of parsedCards) {
      await createCard({
        front: card.front,
        back: card.back,
        cardType: 'basic',
        tags: [],
        journalId,
      });
    }
    setCardSaved(true);
    setTimeout(() => setCardSaved(false), 3000);
  };

  return (
    <div className="glass w-80 border-l border-[var(--color-border)] flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between p-3 border-b border-[var(--color-border)]">
        <span className="text-sm font-medium flex items-center gap-2">
          <span className="flex h-6 w-6 items-center justify-center rounded-md bg-gradient-to-br from-brand-500 to-brand-700 text-white text-xs">🧠</span>
          AI 助手
        </span>
      </div>

      {/* Action buttons */}
      <div className="grid grid-cols-2 gap-1 p-2 border-b border-[var(--color-border)]">
        {actions.map(({ key, label, desc }) => (
          <button
            key={key}
            className="btn-ghost text-xs flex-col py-2 h-auto"
            onClick={() => onAction?.(key)}
            title={desc}
          >
            <span>{label}</span>
            <span className="text-[10px] text-gray-400 font-normal">{desc}</span>
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-3">
        {isProcessing && (
          <div className="space-y-3">
            <div className="flex gap-2 animate-pulse">
              <div className="w-2 h-2 bg-brand-400 rounded-full animate-bounce" style={{ animationDelay: '0s' }} />
              <div className="w-2 h-2 bg-brand-400 rounded-full animate-bounce" style={{ animationDelay: '0.15s' }} />
              <div className="w-2 h-2 bg-brand-400 rounded-full animate-bounce" style={{ animationDelay: '0.3s' }} />
            </div>
          </div>
        )}

        {streamingContent && (
          <div className="prose-custom text-sm">
            <ReactMarkdown>{streamingContent}</ReactMarkdown>
          </div>
        )}

        {/* 友好错误提示 */}
        {error && !isProcessing && (
          <div className="rounded-lg border p-3 text-center" style={{ borderColor: 'color-mix(in srgb, var(--color-danger) 30%, transparent)', backgroundColor: 'var(--color-danger-light)' }}>
            <p className="text-sm" style={{ color: 'var(--color-danger)' }}>{error}</p>
            {isConfigError && (
              <button
                className="btn-primary text-xs mt-2 px-3 py-1.5"
                onClick={() => navigate('/settings')}
              >
                前往设置
              </button>
            )}
          </div>
        )}

        {!isProcessing && !streamingContent && !error && (
          <p className="text-sm text-gray-400 text-center py-8">
            点击上方按钮，AI 将基于笔记内容自动处理
          </p>
        )}
      </div>

      {/* Action buttons area */}
      {streamingContent && !isProcessing && (
        <div className="p-3 border-t border-[var(--color-border)] space-y-2">
          {/* 如果检测到卡片 JSON，显示保存卡片按钮 */}
          {parsedCards && (
            <button
              className="btn-primary text-xs w-full"
              onClick={handleSaveCards}
              disabled={cardSaved}
            >
              {cardSaved
                ? `✅ 已保存 ${parsedCards.length} 张卡片到复习库`
                : `📥 保存 ${parsedCards.length} 张卡片到复习库`}
            </button>
          )}
          {/* 采纳到笔记摘要 */}
          {onAccept && !parsedCards && (
            <button
              className="btn-secondary text-xs w-full"
              onClick={() => onAccept(streamingContent)}
            >
              📥 采纳到笔记
            </button>
          )}
        </div>
      )}
    </div>
  );
}
