import { Loader2 } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { useAIStore } from '../stores/aiStore';

interface AIChatPanelProps {
  onAccept?: (content: string) => void;
  onAction?: (action: string) => void;
}

export default function AIChatPanel({ onAccept, onAction }: AIChatPanelProps) {
  const { isProcessing, streamingContent } = useAIStore();

  const actions = [
    { key: 'summarize', label: '📝 总结', desc: '提炼核心要点' },
    { key: 'generateCards', label: '🃏 卡片', desc: '生成知识卡片' },
    { key: 'codeReview', label: '🔍 代码', desc: '审查代码' },
    { key: 'codeExplain', label: '📖 解释', desc: '解释代码' },
  ] as const;

  return (
    <div className="w-80 border-l border-[var(--color-border)] bg-[var(--color-surface)] flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between p-3 border-b border-[var(--color-border)]">
        <span className="text-sm font-medium">🧠 AI 助手</span>
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
        {!isProcessing && !streamingContent && (
          <p className="text-sm text-gray-400 text-center py-8">
            点击上方按钮，AI 将基于笔记内容自动处理
          </p>
        )}
      </div>

      {/* Accept button */}
      {streamingContent && !isProcessing && onAccept && (
        <div className="p-3 border-t border-[var(--color-border)]">
          <button
            className="btn-secondary text-xs w-full"
            onClick={() => onAccept(streamingContent)}
          >
            📥 采纳到笔记
          </button>
        </div>
      )}
    </div>
  );
}